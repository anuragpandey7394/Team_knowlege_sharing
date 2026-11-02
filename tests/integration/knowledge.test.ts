import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { authenticatedUser } from "../helpers/identity";
import { AuthClient, mailToken } from "../helpers/auth";
import { createServer } from "../../apps/api/src/server";
let harness: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let owner: Awaited<ReturnType<typeof authenticatedUser>>;
let editor: Awaited<ReturnType<typeof authenticatedUser>>;
let reader: Awaited<ReturnType<typeof authenticatedUser>>;
let reviewer: Awaited<ReturnType<typeof authenticatedUser>>;
let orgId: string;
let spaceId: string;
const document = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const url = (suffix: string) => `/api/v1/organizations/${orgId}${suffix}`;
beforeAll(async () => {
  harness = await createTestDatabase();
  app = await createServer(harness.db, harness.env, false);
  owner = await authenticatedUser(app);
  editor = await authenticatedUser(app);
  reader = await authenticatedUser(app);
  reviewer = await authenticatedUser(app);
  const org = await owner.client.post("/api/v1/organizations", {
    name: "Draft privacy organization",
  });
  expect(org.statusCode).toBe(201);
  orgId = org.json().id;
  for (const [account, role] of [
    [editor, "EDITOR"],
    [reader, "READER"],
    [reviewer, "REVIEWER"],
  ] as const) {
    expect(
      (
        await owner.client.post(url("/invitations"), {
          email: account.email,
          role,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await account.client.post("/api/v1/invitations/accept", {
          token: await mailToken(account.email, "Organization invitation"),
        })
      ).statusCode,
    ).toBe(200);
  }
  const space = await owner.client.post(url("/spaces"), {
    name: "Technical notes",
    description: "Synthetic space",
  });
  expect(space.statusCode).toBe(201);
  spaceId = space.json().id;
}, 60000);
afterAll(async () => {
  await app?.close();
  await harness?.close();
});
async function page(
  title: string,
  parentId: string | null = null,
  targetSpace = spaceId,
) {
  const response = await owner.client.post(url("/pages"), {
    spaceId: targetSpace,
    parentId,
    title,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; revision: number };
}
describe("real shared drafts and tenant-safe hierarchy", () => {
  it("isolates drafts from Reader/Reviewer tree, counts and direct draft routes", async () => {
    const draft = await page("Secret unpublished title");
    for (const account of [reader, reviewer]) {
      const tree = await account.client.request(url(`/spaces/${spaceId}/tree`));
      expect(tree.statusCode).toBe(200);
      expect(tree.json()).toEqual({ items: [], total: 0 });
      expect(tree.body).not.toContain("Secret unpublished");
      expect(
        (await account.client.request(url(`/pages/${draft.id}/draft`)))
          .statusCode,
      ).toBe(403);
      expect(
        (
          await account.client.post(url("/pages"), {
            spaceId,
            title: "Forbidden",
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await account.client.request(
            url(`/spaces/${spaceId}/tree?parentId=${draft.id}`),
          )
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (await editor.client.request(url(`/pages/${draft.id}/draft`))).statusCode,
    ).toBe(200);
    expect(
      (await owner.client.request(url(`/spaces/${spaceId}/tree?limit=101`)))
        .statusCode,
    ).toBe(400);
  });
  it("returns 409 to a stale editor and retains the first save until an explicit merged revision succeeds", async () => {
    const draft = await page("Concurrent draft");
    const path = url(`/pages/${draft.id}/draft`);
    const first = await owner.client.request(path);
    const second = await editor.client.request(path);
    expect(first.json().revision).toBe(second.json().revision);
    const saved = await owner.client.post(
      path,
      {
        expectedRevision: first.json().revision,
        title: "First title",
        body: document("First editor content"),
      },
      "PATCH",
    );
    expect(saved.statusCode).toBe(200);
    const stale = await editor.client.post(
      path,
      {
        expectedRevision: second.json().revision,
        title: "Second title",
        body: document("Second editor content"),
      },
      "PATCH",
    );
    expect(stale.statusCode).toBe(409);
    const latest = await editor.client.request(path);
    expect(latest.json().text).toBe("First editor content");
    expect(latest.json().revision).toBe(1);
    const merged = await editor.client.post(
      path,
      {
        expectedRevision: latest.json().revision,
        title: "Merged title",
        body: document("First editor content + Second editor content"),
      },
      "PATCH",
    );
    expect(merged.statusCode).toBe(200);
    expect(merged.json().revision).toBe(2);
  });
  it("rejects cross-tenant space/parent IDs at the API and composite foreign-key layer", async () => {
    const otherOrg = await owner.client.post("/api/v1/organizations", {
      name: "Other tenant",
    });
    const otherId = otherOrg.json().id;
    const otherSpace = await owner.client.post(
      `/api/v1/organizations/${otherId}/spaces`,
      { name: "Other space" },
    );
    const otherSpaceId = otherSpace.json().id;
    expect(
      (
        await owner.client.post(url("/pages"), {
          spaceId: otherSpaceId,
          title: "Forged scope",
        })
      ).statusCode,
    ).toBe(404);
    const root = await page("Foreign parent", null, spaceId);
    const localSpace = await owner.client.post(url("/spaces"), {
      name: "Same org different space",
    });
    expect(
      (
        await owner.client.post(url("/pages"), {
          spaceId: localSpace.json().id,
          parentId: root.id,
          title: "Forged parent",
        })
      ).statusCode,
    ).toBe(404);
    await expect(
      harness.db.page.create({
        data: {
          organizationId: orgId,
          spaceId: otherSpaceId,
          creatorId: owner.userId,
        },
      }),
    ).rejects.toThrow();
    await expect(
      harness.db.page.create({
        data: {
          organizationId: orgId,
          spaceId: localSpace.json().id,
          parentId: root.id,
          creatorId: owner.userId,
        },
      }),
    ).rejects.toThrow();
    expect(
      (
        await reader.client.request(
          `/api/v1/organizations/${otherId}/spaces/${otherSpaceId}/tree`,
        )
      ).statusCode,
    ).toBe(404);
  });
  it("bounds nesting, rejects cycles/cross-space moves and checks structural revisions", async () => {
    const first = await page("Tree root");
    const child = await page("Tree child", first.id);
    expect(
      (
        await owner.client.post(url(`/pages/${first.id}/move`), {
          expectedRevision: 0,
          parentId: child.id,
        })
      ).statusCode,
    ).toBe(409);
    const moved = await owner.client.post(url(`/pages/${child.id}/move`), {
      expectedRevision: 0,
      parentId: null,
    });
    expect(moved.statusCode).toBe(200);
    expect(
      (
        await owner.client.post(url(`/pages/${child.id}/move`), {
          expectedRevision: 0,
          parentId: first.id,
        })
      ).statusCode,
    ).toBe(409);
    let last = first.id;
    for (let depth = 2; depth <= 10; depth++)
      last = (await page(`Depth ${depth}`, last)).id;
    expect(
      (
        await owner.client.post(url("/pages"), {
          spaceId,
          parentId: last,
          title: "Too deep",
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await owner.client.post(url(`/pages/${child.id}/move`), {
          expectedRevision: 1,
          parentId: last,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await owner.client.post(url(`/pages/${first.id}/move`), {
          expectedRevision: 0,
          parentId: child.id,
        })
      ).statusCode,
    ).toBe(409);
    const tree = await owner.client.request(
      url(`/spaces/${spaceId}/tree?parentId=${first.id}&limit=1`),
    );
    expect(tree.json().items).toHaveLength(1);
    expect(tree.json().items[0].parentId).toBe(first.id);
  });
  it("updates spaces with optimistic concurrency and permits Editor authoring", async () => {
    const path = url(`/spaces/${spaceId}`);
    const current = await editor.client.request(path);
    expect(current.statusCode).toBe(200);
    const next = await editor.client.post(
      path,
      {
        name: "Updated technical notes",
        description: "Updated safely",
        expectedRevision: current.json().revision,
      },
      "PATCH",
    );
    expect(next.statusCode).toBe(200);
    expect(
      (
        await owner.client.post(
          path,
          { name: "Stale rename", expectedRevision: current.json().revision },
          "PATCH",
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await reader.client.post(
          path,
          { name: "Forbidden rename", expectedRevision: next.json().revision },
          "PATCH",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await editor.client.post(url("/pages"), {
          spaceId,
          title: "Editor-authored page",
        })
      ).statusCode,
    ).toBe(201);
    expect((await owner.client.request(path)).json().name).toBe(
      "Updated technical notes",
    );
  });
  it("rejects malicious rich content and never changes a draft on invalid input", async () => {
    const draft = await page("Validation");
    const path = url(`/pages/${draft.id}/draft`);
    for (const body of [
      { type: "doc", content: [{ type: "image", attrs: { src: "x" } }] },
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bad",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
      document("x".repeat(100001)),
    ]) {
      const result = await owner.client.post(
        path,
        { expectedRevision: 0, title: "Bad", body },
        "PATCH",
      );
      expect(result.statusCode).toBe(400);
    }
    expect((await owner.client.request(path)).json().revision).toBe(0);
    expect(
      (await new AuthClient(app).request(url(`/pages/${randomUUID()}/draft`)))
        .statusCode,
    ).toBe(401);
  });
});
