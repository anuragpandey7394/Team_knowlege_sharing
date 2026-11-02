import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { authenticatedUser } from "../helpers/identity";
import { createServer } from "../../apps/api/src/server";
let harness: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let owner: Awaited<ReturnType<typeof authenticatedUser>>;
let reviewer: Awaited<ReturnType<typeof authenticatedUser>>;
let editor: Awaited<ReturnType<typeof authenticatedUser>>;
let reader: Awaited<ReturnType<typeof authenticatedUser>>;
let orgId: string;
let pageId: string;
let versionId: string;
const url = (suffix = "") =>
  `/api/v1/organizations/${orgId}/pages/${pageId}/comments${suffix}`;
beforeAll(async () => {
  harness = await createTestDatabase();
  app = await createServer(harness.db, harness.env, false);
  owner = await authenticatedUser(app);
  reviewer = await authenticatedUser(app);
  editor = await authenticatedUser(app);
  reader = await authenticatedUser(app);
  orgId = (
    await owner.client.post("/api/v1/organizations", {
      name: "Synthetic comment provenance",
    })
  ).json().id;
  for (const [user, role] of [
    [reviewer, "REVIEWER"],
    [editor, "EDITOR"],
    [reader, "READER"],
  ] as const)
    await harness.db.membership.create({
      data: { organizationId: orgId, userId: user.userId, role },
    });
  const base = `/api/v1/organizations/${orgId}`;
  const spaceId = (
    await owner.client.post(`${base}/spaces`, { name: "Comments" })
  ).json().id;
  pageId = (
    await owner.client.post(`${base}/pages`, {
      spaceId,
      title: "Commented page",
    })
  ).json().id;
  await owner.client.post(
    `${base}/pages/${pageId}/draft`,
    {
      expectedRevision: 0,
      title: "Commented page",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Authoritative synthetic instructions" },
            ],
          },
        ],
      },
    },
    "PATCH",
  );
  versionId = (
    await owner.client.post(`${base}/pages/${pageId}/publish`, {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
  ).json().versionId;
}, 60000);
afterAll(async () => {
  await app?.close();
  await harness?.close();
});
it("enforces roles, own edits, immutable revisions, and version-at-post metadata", async () => {
  expect(
    (await reader.client.post(url(), { text: "Reader cannot comment" }))
      .statusCode,
  ).toBe(403);
  for (const account of [reviewer, editor, owner])
    expect(
      (await account.client.post(url(), { text: "Allowed advice" })).statusCode,
    ).toBe(201);
  const first = (
    await reviewer.client.post(url(), {
      text: "Original advice <script>unsafe()</script>",
    })
  ).json();
  expect(first.pageVersionId).toBe(versionId);
  expect(first.pageVersionNumber).toBe(1);
  expect(
    (
      await editor.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1, text: "Other author" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await owner.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1, text: "Admin may not rewrite" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(403);
  const edit = await reviewer.client.post(
    url(`/${first.id}`),
    { expectedRevision: 1, text: "Revised advice" },
    "PATCH",
  );
  expect(edit.statusCode).toBe(200);
  expect(edit.json().revision).toBe(2);
  expect(
    (
      await reviewer.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1, text: "Stale" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(409);
  const old = await reader.client.request(
    url(`/${first.id}/revisions/${first.revisionId}`),
  );
  expect(old.statusCode).toBe(200);
  expect(old.json().text).toBe(first.text);
  await expect(
    harness.db.commentRevision.update({
      where: { id: first.revisionId },
      data: { text: "Illegal mutation" },
    }),
  ).rejects.toThrow();
  expect(
    (await reader.client.request(url("?limit=2"))).json().items,
  ).toHaveLength(2);
  expect(
    await harness.db.outboxEvent.count({ where: { sourceId: first.id } }),
  ).toBe(2);
});
it("tombstones moderation and all historical references without exposing bodies", async () => {
  const first = (
    await reviewer.client.post(url(), { text: "Sensitive synthetic advice" })
  ).json();
  expect(
    (
      await editor.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1 },
        "DELETE",
      )
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await owner.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1 },
        "DELETE",
      )
    ).statusCode,
  ).toBe(200);
  const historical = await reader.client.request(
    url(`/${first.id}/revisions/${first.revisionId}`),
  );
  expect(historical.json()).toMatchObject({ text: null, tombstoned: true });
  expect(historical.body).not.toContain("Sensitive synthetic advice");
  expect((await reader.client.request(url())).body).not.toContain(
    "Sensitive synthetic advice",
  );
  expect(
    (
      await reviewer.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1, text: "Resurrect" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(409);
  expect(
    await harness.db.auditEvent.count({
      where: { resourceId: first.id, action: "comment.moderated" },
    }),
  ).toBe(1);
  expect(
    await harness.db.outboxEvent.count({
      where: { sourceId: first.id, kind: "comment.deleted" },
    }),
  ).toBe(1);
});
it("serializes concurrent edits and allows own deletion without resurrecting revisions", async () => {
  const first = (
    await editor.client.post(url(), { text: "Concurrent advice" })
  ).json();
  const results = await Promise.all(
    ["First replacement", "Second replacement"].map((text) =>
      editor.client.post(
        url(`/${first.id}`),
        { expectedRevision: 1, text },
        "PATCH",
      ),
    ),
  );
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(
    await harness.db.commentRevision.count({ where: { commentId: first.id } }),
  ).toBe(2);
  expect(
    (
      await editor.client.post(
        url(`/${first.id}`),
        { expectedRevision: 2 },
        "DELETE",
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await reader.client.request(
        url(`/${first.id}/revisions/${first.revisionId}`),
      )
    ).json().text,
  ).toBeNull();
});
it("rejects forged comment/version tenants, keeps former author safe, and disallows archived mutations", async () => {
  const first = (
    await reviewer.client.post(url(), { text: "Former member advice" })
  ).json();
  const other = await authenticatedUser(app);
  expect(
    (
      await other.client.request(
        url(`/${first.id}/revisions/${first.revisionId}`),
      )
    ).statusCode,
  ).toBe(404);
  const own = (await owner.client.post(url(), { text: "Own comment" })).json();
  expect(
    (
      await reader.client.request(
        url(`/${own.id}/revisions/${first.revisionId}`),
      )
    ).statusCode,
  ).toBe(404);
  await harness.db.membership.delete({
    where: {
      organizationId_userId: { organizationId: orgId, userId: reviewer.userId },
    },
  });
  expect(
    (
      await reader.client.request(
        url(`/${first.id}/revisions/${first.revisionId}`),
      )
    ).json().author,
  ).toBe("Former member");
  expect((await reviewer.client.request(url())).statusCode).toBe(404);
  const page = await harness.db.page.findUniqueOrThrow({
    where: { id: pageId },
  });
  expect(
    (
      await owner.client.post(
        `/api/v1/organizations/${orgId}/pages/${pageId}/archive`,
        { expectedRevision: page.revision },
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (await owner.client.post(url(), { text: "Archived addition" })).statusCode,
  ).toBe(404);
  expect(
    (
      await owner.client.post(
        url(`/${own.id}`),
        { expectedRevision: 1, text: "Archived edit" },
        "PATCH",
      )
    ).statusCode,
  ).toBe(404);
  expect((await reader.client.request(url())).statusCode).toBe(200);
});
