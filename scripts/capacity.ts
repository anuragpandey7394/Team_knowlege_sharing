import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { cpus, totalmem, freemem, platform, arch } from "node:os";
import { parse } from "dotenv";
import { parseEnvironment } from "../packages/config/src/index.js";
import { createDatabase } from "../apps/api/src/database.js";
import { createServer } from "../apps/api/src/server.js";
import {
  assertSeedTarget,
  demoId,
  demoPassword,
} from "../apps/api/src/seed.js";
const env = parseEnvironment({
  ...parse(readFileSync(".env.example")),
  ...process.env,
  NODE_ENV: "test",
});
assertSeedTarget(env.DATABASE_URL, env.NODE_ENV);
const db = createDatabase(env.DATABASE_URL);
const app = await createServer(db, env, false);
const address = await app.listen({ port: 0, host: "127.0.0.1" });
const org = demoId("atlas:org"),
  space = demoId("atlas:space:0"),
  page = demoId("atlas:page:0");
class Client {
  cookies = new Map<string, string>();
  csrf = "";
  async request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(address + path, {
      method,
      headers: {
        origin: env.WEB_ORIGIN,
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(method !== "GET"
          ? { "content-type": "application/json", "x-csrf-token": this.csrf }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const value of response.headers.getSetCookie()) {
      const [pair] = value.split(";");
      const index = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, index), pair!.slice(index + 1));
    }
    return response;
  }
  async post(path: string, body: unknown) {
    const bootstrap = await this.request("/api/v1/auth/csrf");
    if (!bootstrap.ok) throw new Error("Capacity CSRF bootstrap failed");
    this.csrf = ((await bootstrap.json()) as { csrfToken: string }).csrfToken;
    return this.request(path, "POST", body);
  }
}
const clients = Array.from({ length: 5 }, () => new Client());
try {
  if (
    (await db.page.count({
      where: { organizationId: org, publishedVersionId: { not: null } },
    })) !== 100
  )
    throw new Error("Capacity fixture missing: run db:seed");
  for (const [index, client] of clients.entries()) {
    const login = await client.post("/api/v1/auth/login", {
      email: `demo-atlas-${index + 3}@example.test`,
      password: demoPassword,
    });
    if (!login.ok) throw new Error("Synthetic capacity login failed");
  }
  const routes = [
    `/spaces?limit=100`,
    `/spaces/${space}/tree?limit=100`,
    `/pages/${page}`,
    `/search?q=synthetic&limit=20`,
    `/pages/${page}/comments`,
  ];
  const durations: number[] = [];
  let errors = 0;
  const started = performance.now();
  await Promise.all(
    clients.map(async (client) => {
      for (let i = 0; i < 25; i++) {
        const start = performance.now();
        const response = await client.request(
          `/api/v1/organizations/${org}${routes[i % routes.length]}`,
        );
        const body = await response.text();
        durations.push(performance.now() - start);
        if (!response.ok || body.includes("Synthetic boreal")) errors++;
      }
    }),
  );
  const elapsed = performance.now() - started;
  durations.sort((a, b) => a - b);
  const percentile = (value: number) =>
    Number(
      durations[
        Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)
      ]!.toFixed(2),
    );
  const plan = await db.$queryRaw<
    [{ "QUERY PLAN": unknown }]
  >`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT v.id FROM "PageVersion" v JOIN "Page" p ON p."publishedVersionId"=v.id WHERE p."organizationId"=${org}::uuid AND p."archivedAt" IS NULL AND to_tsvector('english',v.title||' '||v.text) @@ websearch_to_tsquery('english','synthetic')`;
  const report = {
    timestamp: new Date().toISOString(),
    outcome: errors === 0 ? "PASS" : "FAIL",
    kind: "ordinary authenticated API, not AI concurrency",
    concurrentClients: 5,
    requests: durations.length,
    errors,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: percentile(1),
    totalMs: Number(elapsed.toFixed(2)),
    dataset: { organizations: 2, memberships: 20, publishedPages: 200 },
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryAtEndBytes: freemem(),
      processRssBytes: process.memoryUsage().rss,
      workerConcurrency: 1,
      testWorkers: 2,
    },
    routes,
    queryPlan: plan[0]["QUERY PLAN"],
    limitations: [
      "Local loopback API and PostgreSQL; small synthetic dataset; no external network latency",
      "One short warm local run; not an SLA, load limit or AI throughput benchmark",
      "No actual AI provider, embeddings or semantic retrieval",
    ],
  };
  writeFileSync(
    "docs/evidence/M09-capacity.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      ...report,
      queryPlan: "recorded in docs/evidence/M09-capacity.json",
    }),
  );
  if (errors) process.exitCode = 1;
} finally {
  for (const client of clients)
    if (client.cookies.has("tka_session"))
      await client.post("/api/v1/auth/logout", {});
  await app.close();
}
