import "dotenv/config";
import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import pg from "pg";
import { assertSeedTarget } from "../apps/api/src/seed.js";
const input = { ...parse(readFileSync(".env.example")), ...process.env };
const url = new URL(input.TEST_DATABASE_URL!);
assertSeedTarget(url.href, input.NODE_ENV ?? "test");
if (url.pathname !== "/tka_test" || url.search)
  throw new Error(
    "Upgrade proof requires dedicated local tka_test without schema override",
  );
const schema = `upgrade_${randomUUID().replaceAll("-", "")}`,
  directory = resolve(".cache", schema);
mkdirSync(`${directory}/migrations`, { recursive: true });
const oldSchema = spawnSync(
  "git",
  [
    "show",
    "4ce186718e87ad0e14934884e9c4fddbb9616daf:apps/api/prisma/schema.prisma",
  ],
  { encoding: "utf8" },
);
if (oldSchema.status !== 0) throw new Error("M04 committed schema unavailable");
writeFileSync(`${directory}/schema.prisma`, oldSchema.stdout);
const migrations = readdirSync("apps/api/prisma/migrations").filter(
  (x) => /^2026/.test(x) && x <= "202611020001_knowledge",
);
for (const name of migrations) {
  mkdirSync(`${directory}/migrations/${name}`);
  copyFileSync(
    `apps/api/prisma/migrations/${name}/migration.sql`,
    `${directory}/migrations/${name}/migration.sql`,
  );
}
copyFileSync(
  "apps/api/prisma/migrations/migration_lock.toml",
  `${directory}/migrations/migration_lock.toml`,
);
writeFileSync(
  `${directory}/prisma.config.ts`,
  'import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:"schema.prisma",migrations:{path:"migrations"},datasource:{url:process.env.DATABASE_URL!}});\n',
);
const migrationUrl = new URL(url);
migrationUrl.searchParams.set("schema", schema);
const pool = new pg.Pool({
  connectionString: url.href,
  max: 1,
  options: `-c search_path=${schema}`,
});
const user = randomUUID(),
  org = randomUUID(),
  space = randomUUID(),
  page = randomUUID(),
  version = randomUUID();
function migrate(config: string) {
  const result = spawnSync(
    process.execPath,
    ["scripts/prisma.mjs", "migrate", "deploy", "--config", config],
    {
      env: { ...process.env, DATABASE_URL: migrationUrl.href },
      encoding: "utf8",
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Migration fixture failed (exit ${result.status ?? "spawn error"})`,
    );
}
try {
  migrate(`${directory}/prisma.config.ts`);
  await pool.query(`SET search_path TO "${schema}"`);
  await pool.query(
    'INSERT INTO "User" (id,email,"displayName","passwordHash","verifiedAt") VALUES ($1,$2,$3,$4,now())',
    [
      user,
      "upgrade-only@example.test",
      "Synthetic upgrade fixture",
      "not-a-login-hash",
    ],
  );
  await pool.query(
    'INSERT INTO "Organization" (id,name,"creatorId") VALUES ($1,$2,$3)',
    [org, "Synthetic prior-schema fixture", user],
  );
  await pool.query(
    'INSERT INTO "Membership" ("organizationId","userId",role) VALUES ($1,$2,$3)',
    [org, user, "ADMIN"],
  );
  await pool.query(
    'INSERT INTO "Space" (id,"organizationId",name,"updatedAt") VALUES ($1,$2,$3,now())',
    [space, org, "Preserved space"],
  );
  await pool.query(
    'INSERT INTO "Page" (id,"organizationId","spaceId","creatorId","updatedAt") VALUES ($1,$2,$3,$4,now())',
    [page, org, space, user],
  );
  const body = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Synthetic prior-schema content" }],
      },
    ],
  };
  await pool.query(
    'INSERT INTO "PageVersion" (id,"organizationId","pageId",number,title,body,text,"publisherId") VALUES ($1,$2,$3,1,$4,$5,$6,$7)',
    [
      version,
      org,
      page,
      "Preserved immutable version",
      body,
      "Synthetic prior-schema content",
      user,
    ],
  );
  await pool.query('UPDATE "Page" SET "publishedVersionId"=$1 WHERE id=$2', [
    version,
    page,
  ]);
  migrate(resolve("prisma.config.ts"));
  const preserved = (
    await pool.query(
      'SELECT v.*,p."publishedVersionId",m.role FROM "PageVersion" v JOIN "Page" p ON p.id=v."pageId" JOIN "Membership" m ON m."organizationId"=v."organizationId" WHERE v.id=$1',
      [version],
    )
  ).rows[0];
  if (
    preserved.text !== "Synthetic prior-schema content" ||
    preserved.spaceId !== space ||
    preserved.idempotencyKey !== version ||
    preserved.publishedVersionId !== version ||
    preserved.role !== "ADMIN"
  )
    throw new Error("Upgrade did not preserve versions/membership/backfill");
  let immutable = false;
  try {
    await pool.query('UPDATE "PageVersion" SET title=title WHERE id=$1', [
      version,
    ]);
  } catch (error) {
    immutable =
      error instanceof Error && "code" in error && error.code === "P0001";
  }
  if (!immutable) throw new Error("Upgrade lost immutable-version trigger");
  const applied = Number(
    (
      await pool.query(
        'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
      )
    ).rows[0].count,
  );
  console.log(
    JSON.stringify({
      migrationUpgrade: "PASS",
      priorMilestone: "M04",
      priorMigrations: migrations.length,
      appliedMigrations: applied,
      preservedVersion: true,
      preservedMembership: true,
      immutableTrigger: true,
      fixture: "generated disposable schema in tka_test",
    }),
  );
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
