import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const action = process.argv[2];
if (!["up", "down"].includes(action)) throw new Error("Expected up or down");
const profile = process.argv.includes("--full") ? "full" : "host";
const args = [
  "compose",
  "-f",
  "infra/compose/compose.yml",
  "-f",
  `infra/compose/${profile}.yml`,
  action,
  ...(action === "up"
    ? ["-d", "--wait", ...(profile === "full" ? ["--build"] : [])]
    : []),
];
const dockerConfig = process.env.DOCKER_CONFIG ?? resolve(".cache/docker");
mkdirSync(dockerConfig, { recursive: true });
const temporaryDirectory = resolve(".cache/tmp");
mkdirSync(temporaryDirectory, { recursive: true });
const result = spawnSync("docker", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DOCKER_CONFIG: dockerConfig,
    TMPDIR: temporaryDirectory,
  },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
