import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/database";
import { assertSeedTarget, seedDemo, demoId } from "../../apps/api/src/seed";
let h: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  h = await createTestDatabase();
}, 60000);
afterAll(async () => {
  await h?.close();
});
it("seeds two isolated organizations, 20 memberships, 200 rich published pages and preserved repeat runs", async () => {
  expect(await seedDemo(h.db)).toMatchObject({
    createdOrganizations: 2,
    publishedPages: 200,
  });
  const before = await h.db.pageVersion.count();
  expect(await seedDemo(h.db)).toMatchObject({ createdOrganizations: 0 });
  expect(await h.db.pageVersion.count()).toBe(before);
  for (const name of ["atlas", "boreal"]) {
    const organizationId = demoId(`${name}:org`);
    expect(await h.db.membership.count({ where: { organizationId } })).toBe(10);
    expect(
      await h.db.page.count({
        where: { organizationId, publishedVersionId: { not: null } },
      }),
    ).toBe(100);
    expect(await h.db.comment.count({ where: { organizationId } })).toBe(10);
    const page = await h.db.page.findFirstOrThrow({
      where: { organizationId },
      include: { draft: true },
    });
    expect(JSON.stringify(page.draft!.body)).toContain('"table"');
    expect(page.draft!.text).toContain("Synthetic");
  }
  expect(await h.db.user.count()).toBe(20);
  expect(await h.db.membership.groupBy({ by: ["role"] })).toHaveLength(4);
}, 60000);
it("rejects non-local and production seed targets", () => {
  for (const [url, mode] of [
    ["postgresql://example.test/tka_dev", "development"],
    ["postgresql://127.0.0.1/employer", "development"],
    ["postgresql://127.0.0.1/tka_dev", "production"],
  ])
    expect(() => assertSeedTarget(url!, mode!)).toThrow();
});
