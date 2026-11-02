import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { authenticatedUser } from "../helpers/identity";
import { createServer } from "../../apps/api/src/server";
let harness: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let owner: Awaited<ReturnType<typeof authenticatedUser>>;
let orgId: string;
let spaceId: string;
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const url = (suffix: string) => `/api/v1/organizations/${orgId}${suffix}`;
beforeAll(async () => {
  harness = await createTestDatabase();
  app = await createServer(harness.db, harness.env, false);
  owner = await authenticatedUser(app);
  orgId = (
    await owner.client.post("/api/v1/organizations", {
      name: "Synthetic publishing",
    })
  ).json().id;
  spaceId = (
    await owner.client.post(url("/spaces"), { name: "Publication fixtures" })
  ).json().id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await harness?.close();
});
async function page() {
  const created = await owner.client.post(url("/pages"), {
    spaceId,
    title: "Synthetic version one",
  });
  expect(created.statusCode).toBe(201);
  const id = created.json().id as string;
  expect(
    (
      await owner.client.post(
        url(`/pages/${id}/draft`),
        {
          title: "Synthetic version one",
          body: doc("First immutable body"),
          expectedRevision: 0,
        },
        "PATCH",
      )
    ).statusCode,
  ).toBe(200);
  return id;
}
it("atomically snapshots versions, pointer, audit and one outbox per idempotent publication", async () => {
  const id = await page();
  const key = randomUUID();
  const publish = () =>
    owner.client.post(url(`/pages/${id}/publish`), {
      expectedRevision: 1,
      idempotencyKey: key,
    });
  const [first, replay] = await Promise.all([publish(), publish()]);
  expect(first.statusCode).toBe(200);
  expect(replay.statusCode).toBe(200);
  expect(replay.json()).toEqual(first.json());
  expect(
    (await harness.db.page.findUniqueOrThrow({ where: { id } }))
      .publishedVersionId,
  ).toBe(first.json().versionId);
  expect(await harness.db.outboxEvent.count({ where: { sourceId: id } })).toBe(
    1,
  );
  expect(await harness.db.auditEvent.count({ where: { resourceId: id } })).toBe(
    1,
  );
  expect(
    (
      await owner.client.post(
        url(`/pages/${id}/draft`),
        {
          expectedRevision: 1,
          title: "Second title",
          body: doc("Second body"),
        },
        "PATCH",
      )
    ).statusCode,
  ).toBe(200);
  const second = await owner.client.post(url(`/pages/${id}/publish`), {
    expectedRevision: 2,
    idempotencyKey: randomUUID(),
  });
  expect(second.statusCode).toBe(200);
  expect(second.json().number).toBe(2);
  const old = await harness.db.pageVersion.findUniqueOrThrow({
    where: { id: first.json().versionId },
  });
  expect(old.text).toBe("First immutable body");
  expect(old.title).toBe("Synthetic version one");
  await expect(
    harness.db.pageVersion.update({
      where: { id: old.id },
      data: { title: "Illegal replacement" },
    }),
  ).rejects.toThrow();
  await expect(
    harness.db.pageVersion.delete({ where: { id: old.id } }),
  ).rejects.toThrow();
  expect(
    (
      await owner.client.post(url(`/pages/${id}/publish`), {
        expectedRevision: 2,
        idempotencyKey: key,
      })
    ).statusCode,
  ).toBe(409);
});
it("rejects stale/empty publication and serializes a concurrent save without mixed snapshots", async () => {
  const id = await page();
  expect(
    (
      await owner.client.post(url(`/pages/${id}/publish`), {
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(409);
  const [publication, save] = await Promise.all([
    owner.client.post(url(`/pages/${id}/publish`), {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    }),
    owner.client.post(
      url(`/pages/${id}/draft`),
      {
        expectedRevision: 1,
        title: "Concurrent title",
        body: doc("Concurrent body"),
      },
      "PATCH",
    ),
  ]);
  expect(save.statusCode).toBe(200);
  expect([200, 409]).toContain(publication.statusCode);
  const versions = await harness.db.pageVersion.findMany({
    where: { pageId: id },
  });
  if (publication.statusCode === 200) {
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      title: "Synthetic version one",
      text: "First immutable body",
      draftRevision: 1,
    });
  } else expect(versions).toHaveLength(0);
  const blank = (
    await owner.client.post(url("/pages"), { spaceId, title: "Empty body" })
  ).json().id;
  expect(
    (
      await owner.client.post(url(`/pages/${blank}/publish`), {
        expectedRevision: 0,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(400);
  expect(
    await harness.db.outboxEvent.count({ where: { sourceId: blank } }),
  ).toBe(0);
});
it("checks membership and capability before publication or replay", async () => {
  const id = await page();
  const outsider = await authenticatedUser(app);
  expect(
    (
      await outsider.client.post(url(`/pages/${id}/publish`), {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(404);
  await harness.db.membership.create({
    data: { organizationId: orgId, userId: outsider.userId, role: "READER" },
  });
  expect(
    (
      await outsider.client.post(url(`/pages/${id}/publish`), {
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      })
    ).statusCode,
  ).toBe(403);
});
it("serves published-only content, exact tenant versions and safe manual search after edits", async () => {
  const id = await page();
  const reader = await authenticatedUser(app);
  await harness.db.membership.create({
    data: { organizationId: orgId, userId: reader.userId, role: "READER" },
  });
  const read = (suffix = "") =>
    reader.client.request(url(`/pages/${id}${suffix}`));
  const first = (
    await owner.client.post(url(`/pages/${id}/publish`), {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
  ).json();
  expect((await read()).json()).toMatchObject({
    title: "Synthetic version one",
    text: "First immutable body",
    changed: false,
    archived: false,
  });
  expect((await read("/draft")).statusCode).toBe(403);
  await owner.client.post(
    url(`/pages/${id}/draft`),
    {
      expectedRevision: 1,
      title: "Secretunpublishedtitle",
      body: doc("Secretunpublishedbody"),
    },
    "PATCH",
  );
  expect((await read()).body).not.toContain("Secretunpublished");
  expect(
    (await reader.client.request(url("/search?q=Secretunpublishedbody"))).json()
      .total,
  ).toBe(0);
  await owner.client.post(url(`/pages/${id}/publish`), {
    expectedRevision: 2,
    idempotencyKey: randomUUID(),
  });
  expect((await read()).json().text).toBe("Secretunpublishedbody");
  expect((await read(`/versions/${first.versionId}`)).json()).toMatchObject({
    text: "First immutable body",
    changed: true,
  });
  expect((await read("/versions")).json().total).toBe(2);
  const search = await reader.client.request(
    url(`/search?q=Secretunpublishedbody&spaceId=${spaceId}`),
  );
  expect(search.statusCode).toBe(200);
  expect(search.json().items).toHaveLength(1);
  expect(search.json().items[0]).toMatchObject({
    pageId: id,
    title: "Secretunpublishedtitle",
  });
  expect(
    (
      await reader.client.request(
        url(
          `/search?q=${encodeURIComponent("'; DROP TABLE Page; -- <script>")}`,
        ),
      )
    ).statusCode,
  ).toBe(200);
  const other = await page();
  expect(
    (
      await reader.client.request(
        url(`/pages/${other}/versions/${first.versionId}`),
      )
    ).statusCode,
  ).toBe(404);
  const foreign = (
    await reader.client.post("/api/v1/organizations", {
      name: "Foreign organization",
    })
  ).json().id;
  expect(
    (
      await reader.client.request(
        `/api/v1/organizations/${foreign}/pages/${id}/versions/${first.versionId}`,
      )
    ).statusCode,
  ).toBe(404);
  await harness.db.membership.delete({
    where: {
      organizationId_userId: { organizationId: orgId, userId: reader.userId },
    },
  });
  expect((await read(`/versions/${first.versionId}`)).statusCode).toBe(404);
});
it("archives entire subtrees, preserves historical citations and validates restore ancestry", async () => {
  const root = await page();
  const rootVersion = (
    await owner.client.post(url(`/pages/${root}/publish`), {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
  ).json().versionId;
  const child = (
    await owner.client.post(url("/pages"), {
      spaceId,
      parentId: root,
      title: "Descendant",
    })
  ).json().id;
  await owner.client.post(
    url(`/pages/${child}/draft`),
    {
      expectedRevision: 0,
      title: "Descendant",
      body: doc("Uniquechildsearchword"),
    },
    "PATCH",
  );
  const version = (
    await owner.client.post(url(`/pages/${child}/publish`), {
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
    })
  ).json().versionId;
  expect(
    (
      await owner.client.post(url(`/pages/${root}/archive`), {
        expectedRevision: 0,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    await harness.db.page.count({
      where: { id: { in: [root, child] }, archivedAt: { not: null } },
    }),
  ).toBe(2);
  expect((await owner.client.request(url(`/pages/${child}`))).statusCode).toBe(
    404,
  );
  expect(
    (
      await owner.client.request(url(`/pages/${child}/versions/${version}`))
    ).json().archived,
  ).toBe(true);
  expect(
    (await owner.client.request(url("/search?q=Uniquechildsearchword"))).json()
      .total,
  ).toBe(0);
  expect(
    (
      await owner.client.post(url(`/pages/${child}/restore`), {
        expectedRevision: 1,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await owner.client.post(url(`/pages/${child}/restore`), {
        expectedRevision: 1,
        parentId: null,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await owner.client.request(url("/search?q=Uniquechildsearchword"))).json()
      .total,
  ).toBe(1);
  expect(
    (
      await owner.client.post(url(`/pages/${root}/restore`), {
        expectedRevision: 1,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await owner.client.request(url(`/pages/${root}/versions/${rootVersion}`))
    ).json().archived,
  ).toBe(false);
  const revision = (
    await owner.client.request(url(`/spaces/${spaceId}`))
  ).json().revision;
  expect(
    (
      await owner.client.post(url(`/spaces/${spaceId}/archive`), {
        expectedRevision: revision,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await owner.client.request(url("/search?q=Uniquechildsearchword"))).json()
      .total,
  ).toBe(0);
  expect(
    (
      await owner.client.request(url(`/pages/${child}/versions/${version}`))
    ).json().archived,
  ).toBe(true);
  expect(
    (
      await owner.client.post(url(`/spaces/${spaceId}/restore`), {
        expectedRevision: revision + 1,
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await owner.client.request(url("/search?q=Uniquechildsearchword"))).json()
      .total,
  ).toBe(1);
});
