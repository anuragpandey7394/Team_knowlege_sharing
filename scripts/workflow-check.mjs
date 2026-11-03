import { Buffer } from "node:buffer";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Workflow verification currently requires Linux x64 actionlint; no check skipped",
  );
const directory = resolve(".cache/actionlint"),
  archive = resolve(directory, "actionlint.tar.gz");
const expected =
  "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8";
mkdirSync(directory, { recursive: true });
if (!existsSync(archive)) {
  const response = await globalThis.fetch(
    "https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz",
    { signal: globalThis.AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw new Error(`Actionlint download failed: HTTP ${response.status}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
}
if (
  createHash("sha256").update(readFileSync(archive)).digest("hex") !== expected
)
  throw new Error("Actionlint archive checksum mismatch");
const extracted = spawnSync(
  "tar",
  ["-xzf", archive, "-C", directory, "actionlint"],
  { stdio: "inherit" },
);
if (extracted.status !== 0) throw new Error("Actionlint extraction failed");
const binary = resolve(directory, "actionlint");
chmodSync(binary, 0o755);
const result = spawnSync(binary, [], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
