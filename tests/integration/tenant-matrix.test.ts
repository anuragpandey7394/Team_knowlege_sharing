import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createTestDatabase } from "../helpers/database";
import { authenticatedUser } from "../helpers/identity";
import { createServer } from "../../apps/api/src/server";
let h: Awaited<ReturnType<typeof createTestDatabase>>,
  app: Awaited<ReturnType<typeof createServer>>;
let a: Awaited<ReturnType<typeof authenticatedUser>>, b: typeof a;
let orgA: string, orgB: string;
const ids: Record<string, string> = {};
const doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Synthetic matrix source" }],
    },
  ],
};
beforeAll(async () => {
  h = await createTestDatabase();
  app = await createServer(h.db, h.env, false);
  a = await authenticatedUser(app);
  b = await authenticatedUser(app);
  orgA = (
    await a.client.post("/api/v1/organizations", { name: "Tenant matrix A" })
  ).json().id;
  orgB = (
    await b.client.post("/api/v1/organizations", { name: "Tenant matrix B" })
  ).json().id;
  const base = `/api/v1/organizations/${orgA}`;
  ids.spaceId = (
    await a.client.post(`${base}/spaces`, { name: "Private matrix space" })
  ).json().id;
  ids.pageId = (
    await a.client.post(`${base}/pages`, {
      spaceId: ids.spaceId,
      title: "Private matrix page",
    })
  ).json().id;
  await a.client.post(
    `${base}/pages/${ids.pageId}/draft`,
    { expectedRevision: 0, title: "Private matrix page", body: doc },
    "PATCH",
  );
  ids.versionId = (
    await a.client.post(`${base}/pages/${ids.pageId}/publish`, {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
  ).json().versionId;
  const comment = (
    await a.client.post(`${base}/pages/${ids.pageId}/comments`, {
      text: "Private matrix advice",
    })
  ).json();
  ids.commentId = comment.id;
  ids.revisionId = comment.revisionId;
  ids.inviteId = (
    await a.client.post(`${base}/invitations`, {
      email: `matrix-${randomUUID()}@example.test`,
      role: "READER",
    })
  ).json().id;
  ids.conversationId = (
    await a.client.post(`${base}/conversations`, {
      title: "Private matrix conversation",
    })
  ).json().id;
  ids.requestId = randomUUID();
  await a.client.post(`${base}/conversations/${ids.conversationId}/messages`, {
    requestId: ids.requestId,
    question: "Private matrix question",
  });
  ids.userId = a.userId;
  ids.sourceType = "page";
  ids.sourceId = ids.pageId!;
}, 60000);
afterAll(async () => {
  await app?.close();
  await h?.close();
});
function body(path: string, method: string) {
  if (method === "GET") return undefined;
  if (path.endsWith("/members/{userId}"))
    return method === "PATCH" ? { role: "READER" } : {};
  if (path.endsWith("/invitations"))
    return { email: `forged-${randomUUID()}@example.test`, role: "READER" };
  if (
    path.endsWith("/resend") ||
    path.endsWith("/retry") ||
    path.endsWith("/cancel")
  )
    return {};
  if (path.includes("/invitations/")) return {};
  if (path.endsWith("/conversations"))
    return { title: "Forged conversation", spaceId: null };
  if (path.endsWith("/conversations/{conversationId}")) return {};
  if (path.endsWith("/messages"))
    return { requestId: randomUUID(), question: "Forged question" };
  if (path.endsWith("/spaces")) return { name: "Forged space" };
  if (path.endsWith("/spaces/{spaceId}"))
    return { name: "Forged rename", expectedRevision: 0 };
  if (path.endsWith("/archive") || path.endsWith("/restore"))
    return { expectedRevision: 0 };
  if (path.endsWith("/pages"))
    return { spaceId: ids.spaceId, title: "Forged page" };
  if (path.endsWith("/draft"))
    return { expectedRevision: 1, title: "Forged draft", body: doc };
  if (path.endsWith("/publish"))
    return { expectedRevision: 1, idempotencyKey: randomUUID() };
  if (path.endsWith("/move")) return { expectedRevision: 0, parentId: null };
  if (path.endsWith("/comments")) return { text: "Forged advice" };
  if (path.endsWith("/comments/{commentId}"))
    return method === "PATCH"
      ? { expectedRevision: 1, text: "Forged edit" }
      : { expectedRevision: 1 };
  if (path === "/api/v1/organizations/{orgId}")
    return { name: "Forged organization rename" };
  throw new Error(`Missing valid tenant matrix payload: ${method} ${path}`);
}
it("covers every org-scoped method with foreign membership and every resource with a forged tenant", async () => {
  const spec = (await a.client.request("/api/v1/openapi.json")).json();
  const results: {
    method: string;
    path: string;
    foreignMembership: number;
    forgedResource: number | null;
  }[] = [];
  for (const [path, entry] of Object.entries(
    spec.paths as Record<string, Record<string, unknown>>,
  )) {
    if (!path.includes("{orgId}")) continue;
    for (const method of Object.keys(entry)) {
      if (!["get", "post", "patch", "delete"].includes(method)) continue;
      const upper = method.toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE";
      const materialize = (org: string) =>
        path.replace(/\{([^}]+)\}/g, (_, key: string) =>
          key === "orgId"
            ? org
            : (ids[key] ??
              (() => {
                throw new Error(`Unmapped route parameter ${key}`);
              })()),
        ) + (path.endsWith("/search") ? "?q=synthetic" : "");
      const payload = body(path, upper);
      const foreign =
        upper === "GET"
          ? await b.client.request(materialize(orgA))
          : await b.client.post(materialize(orgA), payload, upper);
      expect(foreign.statusCode, `${upper} ${path} foreign membership`).toBe(
        404,
      );
      let forged: number | null = null;
      if (
        /\{(spaceId|pageId|userId|inviteId|sourceId|conversationId)\}/.test(
          path,
        )
      ) {
        const response =
          upper === "GET"
            ? await b.client.request(materialize(orgB))
            : await b.client.post(materialize(orgB), payload, upper);
        forged = response.statusCode;
        expect(forged, `${upper} ${path} forged resource`).toBe(404);
      }
      results.push({
        method: upper,
        path,
        foreignMembership: foreign.statusCode,
        forgedResource: forged,
      });
    }
  }
  expect(results.length).toBeGreaterThan(30);
  writeFileSync(
    "docs/evidence/M09-tenant-matrix.json",
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        outcome: "PASS",
        source: "runtime OpenAPI enumeration",
        cases: results.length,
        results,
      },
      null,
      2,
    ) + "\n",
  );
});
it("revokes a current Reader session across history/search and audits administrative changes safely", async () => {
  const reader = await authenticatedUser(app);
  await h.db.membership.create({
    data: { organizationId: orgA, userId: reader.userId, role: "READER" },
  });
  const root = `/api/v1/organizations/${orgA}`;
  expect(
    (
      await reader.client.request(
        `${root}/pages/${ids.pageId}/versions/${ids.versionId}`,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await a.client.post(`${root}/members/${reader.userId}`, {}, "DELETE"))
      .statusCode,
  ).toBe(200);
  expect(
    (
      await reader.client.request(
        `${root}/pages/${ids.pageId}/versions/${ids.versionId}`,
      )
    ).statusCode,
  ).toBe(404);
  expect(
    (await reader.client.request(`${root}/search?q=synthetic`)).statusCode,
  ).toBe(404);
  const rows = await h.db.auditEvent.findMany({
    where: { organizationId: orgA },
  });
  for (const action of [
    "organization.created",
    "invitation.created",
    "page.published",
    "membership.removed",
  ])
    expect(rows.some((row) => row.action === action)).toBe(true);
  expect(rows.every((row) => row.actorId === a.userId && !!row.requestId)).toBe(
    true,
  );
  expect(JSON.stringify(rows)).not.toContain("Private matrix advice");
  expect(JSON.stringify(rows)).not.toContain("tokenHash");
  const response = await a.client.request(`${root}/pages/${ids.pageId}`);
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});
it("keeps sensitive query/body/header values out of structured request logs", async () => {
  const { Writable } = await import("node:stream");
  const { createDatabase } = await import("../../apps/api/src/database");
  let output = "";
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output += String(chunk);
      callback();
    },
  });
  const logging = await createServer(
    createDatabase(h.env.TEST_DATABASE_URL, h.schema),
    h.env,
    true,
    sink,
  );
  const marker = "synthetic-sensitive-log-sentinel";
  try {
    const response = await logging.inject({
      method: "GET",
      url: `/health/live?token=${marker}`,
      headers: {
        authorization: `Bearer ${marker}`,
        cookie: `example=${marker}`,
      },
    });
    expect(response.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(output).toContain("/health/live");
    expect(output).not.toContain(marker);
    expect(response.headers["cache-control"]).toBe("no-store");
  } finally {
    await logging.close();
  }
});
