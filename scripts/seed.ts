import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { parseEnvironment } from "../packages/config/src/index.js";
import { createDatabase } from "../apps/api/src/database.js";
import { assertSeedTarget, seedDemo } from "../apps/api/src/seed.js";
const env = parseEnvironment({
  ...parse(readFileSync(".env.example")),
  ...process.env,
});
assertSeedTarget(env.DATABASE_URL, env.NODE_ENV);
const db = createDatabase(env.DATABASE_URL);
try {
  console.log(JSON.stringify(await seedDemo(db)));
} finally {
  await db.$disconnect();
}
