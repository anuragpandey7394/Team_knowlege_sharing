import "dotenv/config";
import { parseEnvironment } from "../../../packages/config/src/index.js";
import { createDatabase } from "./database.js";
import { createServer } from "./server.js";
const env = parseEnvironment(process.env);
const app = await createServer(createDatabase(env.DATABASE_URL), env);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
await app.listen({
  port: env.API_PORT,
  host: process.env.API_HOST ?? "127.0.0.1",
});
