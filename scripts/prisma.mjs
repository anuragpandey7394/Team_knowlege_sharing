import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const cache = process.env.XDG_CACHE_HOME ?? resolve(".cache");
mkdirSync(cache, { recursive: true });
const temporaryDirectory = resolve(".cache/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, XDG_CACHE_HOME: cache, TMPDIR: temporaryDirectory },
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
