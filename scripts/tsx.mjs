import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const temporaryDirectory = resolve(".cache/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const child = spawn(
  process.execPath,
  ["--import", "tsx", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, TMPDIR: temporaryDirectory } },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => child.kill(signal));
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
