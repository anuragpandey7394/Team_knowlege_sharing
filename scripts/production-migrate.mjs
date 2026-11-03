import { spawnSync } from "node:child_process";
import pg from "pg";
const migrated = spawnSync(
  process.execPath,
  ["scripts/prisma.mjs", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await db.query('REVOKE ALL ON TABLE "_prisma_migrations" FROM tka_app');
} finally {
  await db.end();
}
