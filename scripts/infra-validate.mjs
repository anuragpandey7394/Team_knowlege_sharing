import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  chmodSync,
} from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error(
    "Pinned offline infrastructure verification currently requires Linux x64; no check skipped",
  );
const directory = resolve(".cache/terraform"),
  temporary = resolve(".cache/tmp"),
  plugins = resolve(directory, "plugins");
for (const p of [directory, temporary, plugins])
  mkdirSync(p, { recursive: true });
const archive = resolve(directory, "terraform.zip"),
  binary = resolve(directory, "terraform"),
  expected = "4638628058e71a55212b1c563712eac03b902128f40740f3dc8174df12135061";
if (!existsSync(archive)) {
  const response = await globalThis.fetch(
    "https://releases.hashicorp.com/terraform/1.17.1/terraform_1.17.1_linux_amd64.zip",
    { signal: globalThis.AbortSignal.timeout(60000) },
  );
  if (!response.ok)
    throw new Error(`Terraform download HTTP ${response.status}`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
}
if (
  createHash("sha256").update(readFileSync(archive)).digest("hex") !== expected
)
  throw new Error("Terraform archive checksum mismatch");
const unpacked = spawnSync(
  "unzip",
  ["-o", archive, "terraform", "-d", directory],
  { stdio: "inherit" },
);
if (unpacked.status !== 0) throw new Error("Terraform extraction failed");
chmodSync(binary, 0o755);
const config = resolve(directory, "cli.tfrc");
writeFileSync(config, "disable_checkpoint = true\n");
const env = { ...process.env };
for (const key of Object.keys(env))
  if (
    key.startsWith("AWS_") ||
    key.startsWith("TF_TOKEN_") ||
    key.startsWith("TF_CLI_ARGS") ||
    key.startsWith("TF_CLOUD_") ||
    key === "TFE_TOKEN"
  )
    delete env[key];
Object.assign(env, {
  TMPDIR: temporary,
  TF_DATA_DIR: resolve("infra/terraform/.terraform"),
  TF_PLUGIN_CACHE_DIR: plugins,
  TF_CLI_CONFIG_FILE: config,
  CHECKPOINT_DISABLE: "1",
  TF_IN_AUTOMATION: "1",
  TF_INPUT: "0",
  AWS_EC2_METADATA_DISABLED: "true",
  AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
  AWS_CONFIG_FILE: "/dev/null",
});
const names = readdirSync("infra/terraform");
if (names.some((x) => x.endsWith(".tf.json")))
  throw new Error(
    "Review JSON Terraform configs in offline policy before adding them",
  );
const source = names
  .filter((x) => x.endsWith(".tf"))
  .map((x) => readFileSync(`infra/terraform/${x}`, "utf8"))
  .join("\n");
const types = [...source.matchAll(/^\s*resource\s+"([^"]+)"\s+"/gm)].map(
  (m) => m[1],
);
const allowed = [
  "aws_vpc",
  "aws_subnet",
  "aws_internet_gateway",
  "aws_route_table",
  "aws_route_table_association",
  "aws_security_group",
  "aws_instance",
];
if (
  types.length !== allowed.length ||
  allowed.some((type) => types.filter((x) => x === type).length !== 1) ||
  /^\s*(module|data|provisioner)\s+"/m.test(source)
)
  throw new Error(
    "Offline policy forbids extra resources/modules/lookups/provisioners, including NAT/LB/RDS/Kubernetes",
  );
function run(args) {
  const result = spawnSync(binary, ["-chdir=infra/terraform", ...args], {
    env,
    stdio: "inherit",
  });
  if (result.status !== 0)
    throw new Error(
      `Terraform ${args[0]} failed (exit ${result.status ?? "spawn error"})`,
    );
}
run(["fmt", "-check", "-recursive"]);
run([
  "init",
  "-backend=false",
  "-input=false",
  "-lockfile=readonly",
  "-no-color",
]);
run(["validate", "-no-color"]);
run(["test", "-no-color"]);
const result = {
  timestamp: new Date().toISOString(),
  outcome: "PASS",
  terraform: "1.17.1",
  awsProvider: "6.71.0",
  archiveSha256: expected,
  resources: types,
  checks: [
    "fmt",
    "init without backend",
    "validate",
    "mocked plan policies and negative public-CIDR case",
    "resource allowlist and single-instance shape",
  ],
  cloudResourcesCreated: false,
  limitations: [
    "AWS provider is mocked in all policy test runs",
    "No apply, real plan, AMI/account validation, price proof or real IAM/deployment test",
    "Compute shutdown is a safeguard, not disk teardown or a hard spending cap",
  ],
};
writeFileSync(
  "docs/evidence/M10-infra.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
