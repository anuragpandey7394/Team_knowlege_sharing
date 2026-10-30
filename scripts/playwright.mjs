import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const browsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(".cache/ms-playwright");
const temporaryDirectory = resolve(".cache/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PLAYWRIGHT_BROWSERS_PATH: browsers,
      TMPDIR: temporaryDirectory,
    },
  },
);
process.exitCode = result.status ?? 1;
