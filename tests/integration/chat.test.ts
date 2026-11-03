import { request as httpRequest } from "node:http";
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { createServer } from "../../apps/api/src/server";
import { createDatabase } from "../../apps/api/src/database";
import { authenticatedUser } from "../helpers/identity";
import { AuthClient } from "../helpers/auth";
let h: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>, mock: typeof app;
let owner: Awaited<ReturnType<typeof authenticatedUser>>,
  other: typeof owner,
  admin: typeof owner;
let orgId: string, spaceId: string, foreignSpace: string;
let mockClient: AuthClient;
let mockAddress: string;
const base = () => `/api/v1/organizations/${orgId}/conversations`;
const events = (body: string) =>
  body
    .split("\n\n")
    .filter(Boolean)
    .map((s) => JSON.parse(s.replace(/^data: /, "")));
beforeAll(async () => {
  h = await createTestDatabase();
  app = await createServer(h.db, h.env, false);
  mock = await createServer(
    createDatabase(h.env.TEST_DATABASE_URL, h.schema),
    { ...h.env, AI_PROVIDER: "mock" },
    false,
  );
  mockAddress = await mock.listen({ port: 0, host: "127.0.0.1" });
  owner = await authenticatedUser(app);
  other = await authenticatedUser(app);
  admin = await authenticatedUser(app);
  orgId = (
    await admin.client.post("/api/v1/organizations", {
      name: "Private chat fixtures",
    })
  ).json().id;
  await h.db.membership.createMany({
    data: [
      { organizationId: orgId, userId: owner.userId, role: "READER" },
      { organizationId: orgId, userId: other.userId, role: "REVIEWER" },
    ],
  });
  spaceId = (
    await admin.client.post(`/api/v1/organizations/${orgId}/spaces`, {
      name: "Fixed scope",
    })
  ).json().id;
  const foreign = (
    await other.client.post("/api/v1/organizations", {
      name: "Foreign chat fixtures",
    })
  ).json().id;
  foreignSpace = (
    await other.client.post(`/api/v1/organizations/${foreign}/spaces`, {
      name: "Foreign scope",
    })
  ).json().id;
  mockClient = new AuthClient(mock);
  mockClient.cookies = new Map(owner.client.cookies);
}, 60000);
afterAll(async () => {
  await mock?.close();
  await app?.close();
  await h?.close();
});
async function conversation(space: string | null = null) {
  const r = await owner.client.post(base(), {
    title: "Owner-private synthetic question",
    spaceId: space,
  });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
}
async function pending(id: string, requestId: string) {
  for (let i = 0; i < 80; i++) {
    const row = await h.db.message.findFirst({
      where: {
        conversationId: id,
        requestId,
        role: "ASSISTANT",
        state: "PENDING",
      },
    });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Message did not become pending");
}
it("scopes conversations to the owner even for same-org Admins and rejects foreign spaces/IDs", async () => {
  const id = await conversation(spaceId);
  for (const actor of [other, admin]) {
    expect((await actor.client.request(`${base()}/${id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await actor.client.request(`${base()}/${id}/messages`)).statusCode,
    ).toBe(404);
    expect(
      (await actor.client.post(`${base()}/${id}`, {}, "DELETE")).statusCode,
    ).toBe(404);
    expect(
      (
        await actor.client.post(`${base()}/${id}/messages`, {
          requestId: randomUUID(),
          question: "Forged request",
        })
      ).statusCode,
    ).toBe(404);
  }
  expect(
    (await owner.client.post(base(), { spaceId: foreignSpace })).statusCode,
  ).toBe(404);
  expect(
    (await owner.client.request(`${base()}?limit=1`)).json().items,
  ).toHaveLength(1);
  const foreign = (await other.client.request("/api/v1/organizations"))
    .json()
    .items.find((o: { id: string }) => o.id !== orgId).id;
  expect(
    (
      await other.client.request(
        `/api/v1/organizations/${foreign}/conversations/${id}`,
      )
    ).statusCode,
  ).toBe(404);
});
it("persists disabled requests and retries without duplicate assistant/user messages", async () => {
  const id = await conversation();
  const requestId = randomUUID(),
    body = { requestId, question: "A saved synthetic question" };
  for (let i = 0; i < 2; i++)
    expect(
      (await owner.client.post(`${base()}/${id}/messages`, body)).statusCode,
    ).toBe(503);
  const history = (
    await owner.client.request(`${base()}/${id}/messages`)
  ).json();
  expect(history.total).toBe(2);
  expect(history.providerMode).toBe("disabled");
  expect(
    history.items.find((m: { role: string }) => m.role === "ASSISTANT"),
  ).toMatchObject({ state: "FAILED", content: "" });
  expect(
    (
      await owner.client.post(`${base()}/${id}/messages`, {
        ...body,
        question: "Changed key payload",
      })
    ).statusCode,
  ).toBe(409);
});
it("streams labelled mock events and replays the same completed message pair", async () => {
  const id = await conversation();
  const requestId = randomUUID(),
    body = { requestId, question: "Test mock plumbing" };
  const spec = (await owner.client.request("/api/v1/openapi.json")).json();
  expect(
    spec.paths[
      "/api/v1/organizations/{orgId}/conversations/{conversationId}/messages"
    ].post.responses["200"].content["text/event-stream"],
  ).toBeDefined();
  const result = await mockClient.post(`${base()}/${id}/messages`, body);
  expect(result.statusCode).toBe(200);
  expect(result.headers["content-type"]).toContain("text/event-stream");
  const stream = events(result.body);
  expect(stream.at(-1)).toMatchObject({
    type: "result",
    result: { providerMode: "mock", simulated: true },
  });
  expect(stream.at(-1).result.content).toContain("Simulation only");
  const replay = await mockClient.post(`${base()}/${id}/messages`, body);
  expect(events(replay.body)).toHaveLength(1);
  expect(await h.db.message.count({ where: { conversationId: id } })).toBe(2);
});
it("cancels an active request, rejects concurrent duplication and retries its original pair", async () => {
  const id = await conversation();
  const requestId = randomUUID(),
    body = { requestId, question: "Cancel the mock stream" };
  const work = mockClient.post(`${base()}/${id}/messages`, body);
  await pending(id, requestId);
  expect(
    (await owner.client.post(`${base()}/${id}/messages`, body)).statusCode,
  ).toBe(409);
  expect(
    (
      await other.client.post(
        `${base()}/${id}/requests/${requestId}/cancel`,
        {},
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await owner.client.post(
        `${base()}/${id}/requests/${requestId}/cancel`,
        {},
      )
    ).statusCode,
  ).toBe(200);
  await work;
  expect(
    (
      await h.db.message.findFirstOrThrow({
        where: { conversationId: id, role: "ASSISTANT" },
      })
    ).state,
  ).toBe("CANCELLED");
  const retry = await mockClient.post(`${base()}/${id}/messages`, body);
  expect(events(retry.body).at(-1).type).toBe("result");
  expect(await h.db.message.count({ where: { conversationId: id } })).toBe(2);
});
it("fences old attempts when cancellation is immediately followed by retry", async () => {
  const id = await conversation(),
    requestId = randomUUID(),
    body = { requestId, question: "Immediate retry attempt" };
  const original = mockClient.post(`${base()}/${id}/messages`, body);
  await pending(id, requestId);
  await owner.client.post(`${base()}/${id}/requests/${requestId}/cancel`, {});
  const retry = mockClient.post(`${base()}/${id}/messages`, body);
  const [old, next] = await Promise.all([original, retry]);
  expect(events(old.body).some((e) => e.type === "result")).toBe(false);
  expect(events(next.body).at(-1).type).toBe("result");
  expect(await h.db.message.count({ where: { conversationId: id } })).toBe(2);
  expect(
    (
      await h.db.message.findFirstOrThrow({
        where: { conversationId: id, role: "ASSISTANT" },
      })
    ).state,
  ).toBe("COMPLETE");
});
it("marks a disconnected real HTTP stream cancelled and recovers on retry", async () => {
  const id = await conversation(),
    requestId = randomUUID();
  const csrf = await mockClient.request("/api/v1/auth/csrf");
  await new Promise<void>((resolve, reject) => {
    let disconnected = false;
    const request = httpRequest(
      `${mockAddress}${base()}/${id}/messages`,
      {
        method: "POST",
        agent: false,
        headers: {
          "content-type": "application/json",
          origin: h.env.WEB_ORIGIN,
          cookie: mockClient.cookieHeader(),
          "x-csrf-token": csrf.json().csrfToken,
        },
      },
      (response) => {
        if (response.statusCode !== 200) {
          request.destroy();
          reject(new Error(`Unexpected stream status ${response.statusCode}`));
          return;
        }
        response.once("data", () => {
          disconnected = true;
          request.destroy();
          resolve();
        });
        response.on("error", (error) => {
          if (!disconnected) reject(error);
        });
      },
    );
    request.on("error", (error) => {
      if (!disconnected) reject(error);
    });
    request.end(
      JSON.stringify({ requestId, question: "Disconnect this simulation" }),
    );
  });
  let state = "PENDING";
  for (let i = 0; i < 80 && state === "PENDING"; i++) {
    state = (
      await h.db.message.findFirstOrThrow({
        where: { conversationId: id, requestId, role: "ASSISTANT" },
      })
    ).state;
    if (state === "PENDING")
      await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(state).toBe("CANCELLED");
  const retry = await mockClient.post(`${base()}/${id}/messages`, {
    requestId,
    question: "Disconnect this simulation",
  });
  expect(events(retry.body).at(-1).type).toBe("result");
  expect(await h.db.message.count({ where: { conversationId: id } })).toBe(2);
});
it("revokes active stream access on membership removal and rejects old private history", async () => {
  const id = await conversation();
  const requestId = randomUUID();
  const work = mockClient.post(`${base()}/${id}/messages`, {
    requestId,
    question: "Revocation during simulation",
  });
  await pending(id, requestId);
  await h.db.membership.delete({
    where: {
      organizationId_userId: { organizationId: orgId, userId: owner.userId },
    },
  });
  const result = await work;
  expect(events(result.body).some((e) => e.type === "result")).toBe(false);
  expect(
    (await owner.client.request(`${base()}/${id}/messages`)).statusCode,
  ).toBe(404);
  await h.db.membership.create({
    data: { organizationId: orgId, userId: owner.userId, role: "READER" },
  });
  expect(
    (await owner.client.post(`${base()}/${id}`, {}, "DELETE")).statusCode,
  ).toBe(200);
  expect(await h.db.message.count({ where: { conversationId: id } })).toBe(0);
});
