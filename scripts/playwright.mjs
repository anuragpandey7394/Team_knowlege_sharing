import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const browsers =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(".cache/ms-playwright");
const temporaryDirectory = resolve(".cache/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const args = process.argv.slice(2);
function run(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", ...args],
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
  return result.status ?? 1;
}
const first = run(args);
process.exitCode = first;
if (first === 0 && args.length === 1 && args[0] === "test")
  process.exitCode = run(["test", "--config", "playwright.mock.config.ts"]);
