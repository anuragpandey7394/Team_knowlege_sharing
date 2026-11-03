import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const inventory = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);
if (inventory.status !== 0)
  throw new Error("Cannot inventory project files for secret scan");
const names = [...new Set(inventory.stdout.split("\0").filter(Boolean))].filter(
  (name) =>
    !name.startsWith(".codex/") &&
    !name.startsWith(".agents/") &&
    !/\.(png|jpg|pdf|dump)$/.test(name),
);
const findings = [];
for (const name of names) {
  const content = readFileSync(name, "utf8");
  if (
    /AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/.test(
      content,
    )
  )
    findings.push(name);
}
const audit = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  throw new Error("Dependency advisory lookup failed; no pass recorded");
}
const vulnerabilities = report.metadata?.vulnerabilities;
if (!vulnerabilities)
  throw new Error(
    "Advisory result missing vulnerability metadata; no pass recorded",
  );
const result = {
  timestamp: new Date().toISOString(),
  outcome: findings.length === 0 && audit.status === 0 ? "PASS" : "FAIL",
  scannedProjectFiles: names.length,
  secretPatternFiles: findings,
  vulnerabilities,
  limitations: [
    "Pattern scan of Git-tracked/new project text; excludes ignored env/cache/build files and unrelated .codex/.agents",
    "Advisory database snapshot at timestamp; not a proof of absence of unknown vulnerabilities",
  ],
};
writeFileSync(
  "docs/evidence/M09-security.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
if (findings.length || audit.status !== 0) process.exitCode = 1;
