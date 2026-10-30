import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import pg from "pg";
import { createDatabase } from "../../apps/api/src/database";
import { hashToken } from "../../apps/api/src/tenant";
import { parseEnvironment } from "../../packages/config/src/index";

export function testEnvironment() {
  return parseEnvironment({
    ...parse(readFileSync(".env.example")),
    ...process.env,
    NODE_ENV: "test",
  });
}
export function assertSafeTestDatabase(
  testUrl: string,
  devUrl: string,
  nodeEnv: string | undefined,
) {
  const test = new URL(testUrl);
  const dev = new URL(devUrl);
  const identity = (url: URL) =>
    `${url.hostname.replace("localhost", "127.0.0.1")}:${url.port || "5432"}${url.pathname}`;
  if (
    nodeEnv !== "test" ||
    !test.pathname.endsWith("_test") ||
    identity(test) === identity(dev) ||
    test.searchParams.has("schema")
  )
    throw new Error("Unsafe test database configuration");
}
export async function createTestDatabase() {
  const env = testEnvironment();
  assertSafeTestDatabase(
    env.TEST_DATABASE_URL,
    env.DATABASE_URL,
    process.env.NODE_ENV,
  );
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({
    connectionString: env.TEST_DATABASE_URL,
    max: 1,
  });
  const migrationUrl = new URL(env.TEST_DATABASE_URL);
  migrationUrl.searchParams.set("schema", schema);
  const migration = spawnSync(
    process.execPath,
    ["scripts/prisma.mjs", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: migrationUrl.href },
      encoding: "utf8",
    },
  );
  if (migration.status !== 0) {
    await admin.end();
    throw new Error(`Disposable schema migration failed: ${migration.stderr}`);
  }
  const db = createDatabase(env.TEST_DATABASE_URL, schema);
  return {
    env,
    db,
    schema,
    now: new Date("2026-10-29T12:00:00.000Z"),
    token: () => randomBytes(32).toString("hex"),
    async fixture(role: "READER" | "REVIEWER" | "EDITOR" | "ADMIN" = "ADMIN") {
      const user = await db.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          displayName: "Synthetic User",
          passwordHash: "fixture-not-a-real-password-hash",
          verifiedAt: new Date(),
        },
      });
      const org = await db.organization.create({
        data: {
          name: "Synthetic Organization",
          creatorId: user.id,
          memberships: { create: { userId: user.id, role } },
        },
      });
      const token = randomBytes(32).toString("hex");
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          csrfHash: hashToken(randomBytes(32).toString("hex")),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return { user, org, cookie: `tka_session=${token}` };
    },
    async close() {
      await db.$disconnect();
      // Identifier is generated above, never provided by an external caller.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    },
  };
}
