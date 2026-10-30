import { writeFileSync } from "node:fs";
import { createServer as createViteServer } from "vite";
import { createTestDatabase } from "../tests/helpers/database";
import { createServer } from "../apps/api/src/server";
const harness = await createTestDatabase();
const app = await createServer(
  harness.db,
  { ...harness.env, WEB_ORIGIN: "http://127.0.0.1:5174", API_PORT: 3002 },
  false,
);
process.env.API_PROXY_TARGET = "http://127.0.0.1:3002";
const web = await createViteServer({
  root: "apps/web",
  cacheDir: "../../.cache/vite-e2e",
  configFile: "apps/web/vite.config.ts",
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
});
writeFileSync(
  ".cache/e2e-schema.json",
  JSON.stringify({ schema: harness.schema }),
);
async function close() {
  await web.close();
  await app.close();
  await harness.close();
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
await app.listen({ port: 3002, host: "127.0.0.1" });
await web.listen();
console.log("Isolated E2E API and web ready");
