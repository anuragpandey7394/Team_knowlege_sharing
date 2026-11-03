import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { parse } from "dotenv";
import pg from "pg";
import { assertSeedTarget } from "../apps/api/src/seed.js";
const input = { ...parse(readFileSync(".env.example")), ...process.env };
const source = new URL(input.DATABASE_URL!);
assertSeedTarget(source.href, input.NODE_ENV ?? "development");
const restoredName = `tka_restore_${randomUUID().replaceAll("-", "")}_test`;
if (!/^tka_restore_[a-f0-9]{32}_test$/.test(restoredName))
  throw new Error("Unsafe restore identity");
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
const target = new URL(source);
target.pathname = `/${restoredName}`;
target.search = "";
const sourcePool = new pg.Pool({ connectionString: source.href, max: 1 });
const restoredPool = new pg.Pool({ connectionString: target.href, max: 1 });
const directory = resolve(".cache/backups");
mkdirSync(directory, { recursive: true });
const archive = resolve(directory, `${restoredName}.dump`);
const environment = {
  ...process.env,
  PGHOST: source.hostname,
  PGPORT: source.port || "5432",
  PGUSER: decodeURIComponent(source.username),
  PGPASSWORD: decodeURIComponent(source.password),
  PGDATABASE: source.pathname.slice(1),
};
const tables = [
  "User",
  "Organization",
  "Membership",
  "Space",
  "Page",
  "PageDraft",
  "PageVersion",
  "Comment",
  "CommentRevision",
  "OutboxEvent",
  "Job",
  "IndexState",
  "Conversation",
  "Message",
  "AuditEvent",
  "Session",
  "AuthToken",
  "Invitation",
  "RateLimit",
];
async function counts(pool: pg.Pool) {
  const result: Record<string, number> = {};
  for (const table of tables)
    result[table] = Number(
      (await pool.query(`SELECT count(*) FROM "${table}"`)).rows[0].count,
    );
  return result;
}
let created = false;
try {
  const container = process.env.TKA_POSTGRES_CONTAINER;
  const dumped = container
    ? spawnSync(
        "docker",
        [
          "exec",
          "--env",
          "PGPASSWORD",
          container,
          "pg_dump",
          "--username",
          environment.PGUSER,
          "--dbname",
          environment.PGDATABASE,
          "--format=custom",
          "--no-owner",
          "--no-privileges",
        ],
        { env: environment, maxBuffer: 32 * 1024 * 1024 },
      )
    : spawnSync(
        "pg_dump",
        ["--format=custom", "--no-owner", "--no-privileges", "--file", archive],
        { env: environment, encoding: "utf8" },
      );
  if (dumped.status !== 0)
    throw new Error(
      `pg_dump failed (exit ${dumped.status ?? "spawn error"}); backup not verified`,
    );
  if (container) writeFileSync(archive, dumped.stdout);
  await admin.query(`CREATE DATABASE "${restoredName}" TEMPLATE template0`);
  created = true;
  const restored = container
    ? spawnSync(
        "docker",
        [
          "exec",
          "-i",
          "--env",
          "PGPASSWORD",
          container,
          "pg_restore",
          "--username",
          environment.PGUSER,
          "--dbname",
          restoredName,
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
        ],
        {
          env: environment,
          input: readFileSync(archive),
          maxBuffer: 32 * 1024 * 1024,
        },
      )
    : spawnSync(
        "pg_restore",
        [
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
          "--dbname",
          restoredName,
          archive,
        ],
        { env: environment, encoding: "utf8" },
      );
  if (restored.status !== 0)
    throw new Error(
      `pg_restore failed (exit ${restored.status ?? "spawn error"}); restore not verified`,
    );
  const before = await counts(sourcePool),
    after = await counts(restoredPool);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Backup/restore row counts differ");
  const versions = await sourcePool.query(
    'SELECT id,title,text FROM "PageVersion" ORDER BY id',
  );
  const copied = await restoredPool.query(
    'SELECT id,title,text FROM "PageVersion" ORDER BY id',
  );
  if (JSON.stringify(versions.rows) !== JSON.stringify(copied.rows))
    throw new Error("Immutable version contents differ");
  const memberships = await sourcePool.query(
    'SELECT "organizationId","userId",role FROM "Membership" ORDER BY "organizationId","userId"',
  );
  const copiedMembers = await restoredPool.query(
    'SELECT "organizationId","userId",role FROM "Membership" ORDER BY "organizationId","userId"',
  );
  if (JSON.stringify(memberships.rows) !== JSON.stringify(copiedMembers.rows))
    throw new Error("Restored memberships differ");
  let immutable = false;
  if (copied.rows[0]) {
    try {
      await restoredPool.query(
        'UPDATE "PageVersion" SET title = title WHERE id = $1',
        [copied.rows[0].id],
      );
    } catch (error) {
      immutable =
        error instanceof Error && "code" in error && error.code === "P0001";
    }
  }
  if (!immutable)
    throw new Error(
      "Restored immutable-version protection missing or no version fixture",
    );
  console.log(
    JSON.stringify({
      backupRestore: "PASS",
      tables: tables.length,
      counts: after,
      versionContentEquality: true,
      membershipEquality: true,
      immutableTrigger: true,
      archiveSha256: createHash("sha256")
        .update(readFileSync(archive))
        .digest("hex"),
      archive: ".cache/backups/[disposable-name].dump",
      restoredDatabase: "generated disposable test DB",
    }),
  );
} finally {
  await sourcePool.end();
  await restoredPool.end();
  if (created) await admin.query(`DROP DATABASE "${restoredName}"`);
  await admin.end();
}
