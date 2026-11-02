import "dotenv/config";
import { parseEnvironment } from "../../../packages/config/src/index.js";
import { createDatabase } from "./database.js";
import { dispatch, runOne } from "./jobs.js";
const env = parseEnvironment(process.env);
const db = createDatabase(env.DATABASE_URL);
let stopping = false;
const abort = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stopping = true;
    abort.abort();
  });
try {
  while (!stopping) {
    await dispatch(db, new Date(), env.INDEX_GENERATION);
    const worked = await runOne(
      db,
      undefined,
      () => new Date(),
      env.INDEX_GENERATION,
    );
    if (!worked && !stopping)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, 500);
        function done() {
          clearTimeout(timer);
          abort.signal.removeEventListener("abort", done);
          resolve();
        }
        abort.signal.addEventListener("abort", done, { once: true });
      });
  }
} catch {
  console.error(
    "Worker stopped after a database failure; pending work remains durable",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
