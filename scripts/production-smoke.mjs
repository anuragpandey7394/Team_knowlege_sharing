import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync, readFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import https from "node:https";
const project = `tka-smoke-${randomUUID().slice(0, 8)}`,
  directory = resolve(".cache", project);
mkdirSync(directory, { recursive: true });
const cert = resolve(directory, "cert.pem"),
  key = resolve(directory, "key.pem");
const generated = spawnSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-days",
    "1",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { encoding: "utf8" },
);
if (generated.status !== 0)
  throw new Error("Local TLS fixture generation failed");
chmodSync(key, 0o600);
const env = {
  ...process.env,
  DOCKER_CONFIG: resolve(".cache/docker"),
  TMPDIR: resolve(".cache/tmp"),
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  APP_DATABASE_PASSWORD: randomBytes(24).toString("hex"),
  CSRF_SECRET: randomBytes(32).toString("hex"),
  WEB_ORIGIN: "https://localhost:8443",
  TKA_TLS_DIRECTORY: directory,
  TKA_HTTPS_PORT: "8443",
  TKA_WEB_UID: String(process.getuid?.() ?? 1000),
  TKA_WEB_GID: String(process.getgid?.() ?? 1000),
};
function compose(args) {
  const result = spawnSync(
    "docker",
    ["compose", "-p", project, "-f", "infra/production/compose.yml", ...args],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      `Production Compose ${args[0]} failed (exit ${result.status})`,
    );
}
const cookies = new Map();
let csrfToken = "";
async function request(path, method = "GET", body) {
  return new Promise((resolveRequest, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = https.request(
      {
        hostname: "127.0.0.1",
        servername: "localhost",
        port: 8443,
        path,
        method,
        ca: readFileSync(cert),
        headers: {
          host: "localhost:8443",
          origin: env.WEB_ORIGIN,
          cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(payload
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(payload),
                "x-csrf-token": csrfToken,
              }
            : {}),
        },
      },
      (response) => {
        let content = "";
        response.on("data", (chunk) => {
          content += chunk;
        });
        response.on("end", () => {
          for (const value of response.headers["set-cookie"] ?? []) {
            const pair = value.split(";")[0],
              index = pair.indexOf("=");
            cookies.set(pair.slice(0, index), pair.slice(index + 1));
          }
          resolveRequest({
            status: response.statusCode,
            headers: response.headers,
            content,
          });
        });
      },
    );
    request.on("error", reject);
    request.end(payload);
  });
}
let started = false;
try {
  started = true;
  compose(["up", "-d", "--build", "--wait", "--wait-timeout", "240"]);
  const ready = await request("/health/ready");
  if (ready.status !== 200)
    throw new Error("Production HTTPS readiness failed");
  const home = await request("/");
  if (
    home.status !== 200 ||
    !home.content.includes("/assets/") ||
    !home.headers["content-security-policy"]?.includes("script-src 'self'")
  )
    throw new Error("Production static/CSP smoke failed");
  const denied = await request("/internal/v1/index-source");
  if (denied.status !== 404)
    throw new Error("Private service boundary exposed by proxy");
  const csrf = await request("/api/v1/auth/csrf");
  if (csrf.status !== 200) throw new Error("Production CSRF bootstrap failed");
  const seedCookie = csrf.headers["set-cookie"]?.join(";") ?? "";
  if (!seedCookie.includes("Secure") || !seedCookie.includes("HttpOnly"))
    throw new Error("Hosted cookie flags missing");
  csrfToken = JSON.parse(csrf.content).csrfToken;
  const mutation = await request("/api/v1/auth/forgot-password", "POST", {
    email: "nonexistent-production-smoke@example.test",
  });
  if (mutation.status !== 202) throw new Error("Hosted CSRF mutation failed");
  for (const service of ["api", "worker", "web"]) {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "-p",
        project,
        "-f",
        "infra/production/compose.yml",
        "exec",
        "-T",
        service,
        "id",
        "-u",
      ],
      { env, encoding: "utf8" },
    );
    if (result.status !== 0 || result.stdout.trim() === "0")
      throw new Error(`Non-root ${service} assertion failed`);
  }
  const roleCheck = spawnSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "infra/production/compose.yml",
      "exec",
      "-T",
      "api",
      "node",
      "--input-type=module",
      "-e",
      "import pg from 'pg';const db=new pg.Pool({connectionString:process.env.DATABASE_URL});const r=(await db.query(\"SELECT rolsuper,rolcreatedb,rolcreaterole,has_schema_privilege(current_user,'public','CREATE') AS ddl,has_table_privilege(current_user,'public._prisma_migrations','UPDATE') AS migration_write FROM pg_roles WHERE rolname=current_user\")).rows[0];await db.end();if(Object.values(r).some(Boolean))process.exit(1);",
    ],
    { env, encoding: "utf8" },
  );
  if (roleCheck.status !== 0)
    throw new Error("Application database role exceeds DML privileges");
  const registered = await request("/api/v1/auth/register", "POST", {
    email: `smoke-${randomUUID()}@example.test`,
    displayName: "Synthetic hosted smoke",
    password: randomBytes(24).toString("hex"),
  });
  if (registered.status !== 202)
    throw new Error("Hosted registration mutation failed");
  const result = {
    timestamp: new Date().toISOString(),
    outcome: "PASS",
    project,
    https: true,
    certificateValidation: true,
    sameOriginStaticAndApi: true,
    secureHttpOnlyCsrfCookies: true,
    privateSourceProxyDenied: true,
    nonRootApiAndWorker: true,
    leastPrivilegeApplicationDatabaseRole: true,
    limitations: [
      "Local self-signed certificate explicitly trusted only by smoke client",
      "Synthetic local containers; not an AWS deployment or real mail delivery proof",
      "No cloud credentials or model calls",
    ],
  };
  writeFileSync(
    "docs/evidence/M10-container.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} catch (error) {
  const logs = spawnSync(
    "docker",
    [
      "compose",
      "-p",
      project,
      "-f",
      "infra/production/compose.yml",
      "logs",
      "--no-color",
    ],
    { env, encoding: "utf8" },
  );
  writeFileSync(resolve(directory, "containers.log"), logs.stdout ?? "");
  throw error;
} finally {
  if (started) compose(["down", "--volumes", "--remove-orphans"]);
}
