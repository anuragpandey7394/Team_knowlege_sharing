import { answer } from "../../apps/api/src/providers";
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { createServer } from "../../apps/api/src/server";
import { authenticatedUser } from "../helpers/identity";
import {
  dispatch,
  claim,
  heartbeat,
  complete,
  runOne,
  indexView,
  AdapterFailure,
} from "../../apps/api/src/jobs";
import { currentSource } from "../../apps/api/src/index-routes";
let h: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let user: Awaited<ReturnType<typeof authenticatedUser>>;
let orgId: string;
let spaceId: string;
const base = () => `/api/v1/organizations/${orgId}`;
let now = new Date("2030-01-01T00:00:00Z");
beforeAll(async () => {
  h = await createTestDatabase();
  app = await createServer(
    h.db,
    { ...h.env, AI_SERVICE_TOKEN: "synthetic-test-service-secret-at-least-32" },
    false,
  );
  user = await authenticatedUser(app);
  orgId = (
    await user.client.post("/api/v1/organizations", {
      name: "Job state fixtures",
    })
  ).json().id;
  spaceId = (
    await user.client.post(`${base()}/spaces`, { name: "Source jobs" })
  ).json().id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await h?.close();
});
async function publish() {
  const pageId = (
    await user.client.post(`${base()}/pages`, {
      spaceId,
      title: "Durable source",
    })
  ).json().id;
  await user.client.post(
    `${base()}/pages/${pageId}/draft`,
    {
      expectedRevision: 0,
      title: "Durable source",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Durable synthetic published evidence" },
            ],
          },
        ],
      },
    },
    "PATCH",
  );
  expect(
    (
      await user.client.post(`${base()}/pages/${pageId}/publish`, {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(200);
  return currentSource(h.db, orgId, "page", pageId);
}
async function drain() {
  let ticks = 0;
  while (await dispatch(h.db, now)) {
    if (++ticks > 100) throw new Error("Dispatcher did not drain");
  }
  while (await runOne(h.db, undefined, () => now)) {
    if (++ticks > 200) throw new Error("Worker did not drain");
  }
}
it("dispatches duplicate-safe jobs and disabled provider never becomes ready", async () => {
  const source = await publish();
  expect(await dispatch(h.db, now)).toBe(1);
  expect(await dispatch(h.db, now)).toBe(0);
  expect(await runOne(h.db, undefined, () => now)).toBe(true);
  expect(await indexView(h.db, source)).toMatchObject({
    status: "awaiting_provider",
    eligible: false,
  });
  expect(await h.db.job.count({ where: { organizationId: orgId } })).toBe(1);
});
it("uses token leases, heartbeat, crash reclamation and rejects late completion", async () => {
  const source = await publish();
  await dispatch(h.db, now);
  const first = await claim(h.db, now, 1000);
  expect(first).not.toBeNull();
  expect(
    await heartbeat(h.db, first!, new Date(now.getTime() + 500), 1000),
  ).toBe(true);
  expect(await claim(h.db, new Date(now.getTime() + 1200), 1000)).toBeNull();
  const reclaimed = await claim(h.db, new Date(now.getTime() + 1600), 1000);
  expect(reclaimed?.id).toBe(first!.id);
  expect(reclaimed?.token).not.toBe(first!.token);
  expect(
    await complete(
      h.db,
      first!,
      { status: "ready", simulated: true },
      new Date(now.getTime() + 1700),
    ),
  ).toBe(false);
  expect(
    await complete(
      h.db,
      reclaimed!,
      { status: "awaiting_provider" },
      new Date(now.getTime() + 1700),
    ),
  ).toBe(true);
  expect((await indexView(h.db, source)).eligible).toBe(false);
});
it("bounds transient retries and records safe terminal errors without leaking adapter content", async () => {
  const source = await publish();
  await dispatch(h.db, now);
  for (let attempt = 0; attempt < 3; attempt++) {
    expect(
      await runOne(
        h.db,
        {
          mode: "fake",
          index: async () => {
            throw new AdapterFailure(true);
          },
        },
        () => now,
      ),
    ).toBe(true);
    now = new Date(now.getTime() + 5000);
  }
  const state = await indexView(h.db, source);
  expect(state).toMatchObject({
    status: "failed",
    safeError: "INDEX_ADAPTER_UNAVAILABLE",
    eligible: false,
  });
  expect(await runOne(h.db, undefined, () => now)).toBe(false);
  const terminal = await publish();
  await dispatch(h.db, now);
  await runOne(
    h.db,
    {
      mode: "fake",
      index: async () => {
        throw new Error("untrusted secret detail");
      },
    },
    () => now,
  );
  expect((await indexView(h.db, terminal)).safeError).toBe(
    "INDEX_ADAPTER_UNAVAILABLE",
  );
});
it("fake success remains simulated and old publication completion cannot ready the new source", async () => {
  const source = await publish();
  await dispatch(h.db, now);
  await runOne(h.db, { mode: "fake", index: async () => {} }, () => now);
  expect(await indexView(h.db, source)).toMatchObject({
    status: "awaiting_provider",
    simulated: true,
    eligible: false,
  });
  const stale = await publish();
  await dispatch(h.db, now);
  const job = await claim(h.db, now);
  expect(job).not.toBeNull();
  await user.client.post(
    `${base()}/pages/${stale.sourceId}/draft`,
    {
      expectedRevision: 1,
      title: "New publication",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "New version evidence" }],
          },
        ],
      },
    },
    "PATCH",
  );
  const next = (
    await user.client.post(`${base()}/pages/${stale.sourceId}/publish`, {
      expectedRevision: 2,
      idempotencyKey: randomUUID(),
    })
  ).json();
  await complete(h.db, job!, { status: "ready", simulated: true }, now);
  expect(
    (
      await h.db.indexState.findFirstOrThrow({
        where: { sourceVersionId: stale.sourceVersionId },
      })
    ).status,
  ).toBe("superseded");
  expect(
    await indexView(h.db, { ...stale, sourceVersionId: next.versionId }),
  ).toMatchObject({ eligible: false, status: "awaiting_provider" });
  await drain();
});
it("fences generations, exhausted leases and retry authorization", async () => {
  const source = await publish();
  await dispatch(h.db, now);
  const job = await claim(h.db, now, 1000, 1);
  expect(job).not.toBeNull();
  const newer = { ...source, generation: 2 };
  expect(await indexView(h.db, newer)).toMatchObject({
    status: "awaiting_provider",
    eligible: false,
  });
  await complete(h.db, job!, { status: "ready", simulated: true }, now);
  expect(await indexView(h.db, newer)).toMatchObject({
    status: "awaiting_provider",
    eligible: false,
  });
  const expired = await publish();
  await dispatch(h.db, now);
  for (let i = 0; i < 3; i++) {
    expect(await claim(h.db, now, 100)).not.toBeNull();
    now = new Date(now.getTime() + 101);
  }
  expect(await claim(h.db, now, 100)).toBeNull();
  expect(await indexView(h.db, expired)).toMatchObject({
    status: "failed",
    safeError: "LEASE_EXHAUSTED",
  });
  const retry = await user.client.post(
    `${base()}/index/page/${expired.sourceId}/retry`,
    {},
  );
  expect(retry.statusCode).toBe(200);
  expect(retry.json().eligible).toBe(false);
  await drain();
  const reader = await authenticatedUser(app);
  await h.db.membership.create({
    data: { organizationId: orgId, userId: reader.userId, role: "READER" },
  });
  expect(
    (
      await reader.client.post(
        `${base()}/index/page/${expired.sourceId}/retry`,
        {},
      )
    ).statusCode,
  ).toBe(403);
});
it("validates mock source fixtures and keeps disabled answer contracts honest", async () => {
  const source = await publish();
  const request = {
    requestId: randomUUID(),
    organizationId: orgId,
    userId: user.userId,
    conversationId: randomUUID(),
    question: "Synthetic question",
  };
  const disabled = [];
  for await (const event of answer(
    h.db,
    h.env,
    request,
    new AbortController().signal,
  ))
    disabled.push(event);
  expect(disabled).toEqual([
    { type: "error", requestId: request.requestId, code: "PROVIDER_DISABLED" },
  ]);
  const citation = {
    ...source,
    pageId: source.sourceId,
    pageVersionId: source.sourceVersionId,
    title: "Durable source",
    locator: { start: 0, end: 7 },
    quote: "Durable",
  };
  const collect = async (fixtures = [citation]) => {
    const events = [];
    for await (const event of answer(
      h.db,
      { ...h.env, AI_PROVIDER: "mock" },
      request,
      new AbortController().signal,
      fixtures,
    ))
      events.push(event);
    return events;
  };
  expect((await collect()).at(-1)).toMatchObject({
    type: "result",
    result: { simulated: true, providerMode: "mock" },
  });
  await expect(
    collect([{ ...citation, organizationId: randomUUID() }]),
  ).rejects.toThrow("Invalid mock citation scope");
  await expect(
    collect([{ ...citation, sourceVersionId: randomUUID() }]),
  ).rejects.toThrow("Invalid mock citation scope");
  await drain();
});
it("excludes archived/deleted/edited sources and rechecks service auth and tenant membership", async () => {
  const source = await publish();
  await dispatch(h.db, now);
  const job = await claim(h.db, now);
  expect(job).not.toBeNull();
  await user.client.post(`${base()}/pages/${source.sourceId}/archive`, {
    expectedRevision: 0,
  });
  await complete(h.db, job!, { status: "ready", simulated: true }, now);
  expect((await indexView(h.db, source)).eligible).toBe(false);
  await drain();
  const active = await publish();
  const body = { ...active, userId: user.userId };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/internal/v1/index-source",
        payload: body,
      })
    ).statusCode,
  ).toBe(401);
  const request = () =>
    app.inject({
      method: "POST",
      url: "/internal/v1/index-source",
      headers: {
        authorization: "Bearer synthetic-test-service-secret-at-least-32",
      },
      payload: body,
    });
  expect((await request()).statusCode).toBe(200);
  body.organizationId = randomUUID();
  expect((await request()).statusCode).toBe(404);
  body.organizationId = orgId;
  await drain();
  const c = (
    await user.client.post(`${base()}/pages/${active.sourceId}/comments`, {
      text: "Job comment",
    })
  ).json();
  await dispatch(h.db, now);
  const oldCommentJob = await claim(h.db, now);
  expect(oldCommentJob?.source.sourceType).toBe("comment");
  await user.client.post(
    `${base()}/pages/${active.sourceId}/comments/${c.id}`,
    { expectedRevision: 1, text: "Revised job comment" },
    "PATCH",
  );
  await complete(
    h.db,
    oldCommentJob!,
    { status: "ready", simulated: true },
    now,
  );
  expect(
    (
      await h.db.indexState.findFirstOrThrow({
        where: { sourceVersionId: c.revisionId },
      })
    ).status,
  ).toBe("superseded");
  await dispatch(h.db, now);
  const editedJob = await claim(h.db, now);
  expect(editedJob).not.toBeNull();
  await user.client.post(
    `${base()}/pages/${active.sourceId}/comments/${c.id}`,
    { expectedRevision: 2 },
    "DELETE",
  );
  await complete(h.db, editedJob!, { status: "ready", simulated: true }, now);
  const commentSource = await currentSource(h.db, orgId, "comment", c.id);
  expect((await indexView(h.db, commentSource)).eligible).toBe(false);
  await h.db.membership.delete({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.userId },
    },
  });
  expect((await request()).statusCode).toBe(404);
});
