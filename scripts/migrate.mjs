import "dotenv/config";
import { spawnSync } from "node:child_process";
const url = new URL(
  process.env.DATABASE_URL ??
    "postgresql://tka:tka_local_only@127.0.0.1:55432/tka_dev",
);
if (
  !["tka_dev", "tka_test"].includes(url.pathname.slice(1)) ||
  !["127.0.0.1", "localhost", "postgres"].includes(url.hostname)
)
  throw new Error(
    "Migration command limited to dedicated local tka_dev/tka_test databases. Inspect configuration; hosted migrations require a separate runbook.",
  );
const result = spawnSync(
  process.execPath,
  ["scripts/prisma.mjs", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url.href },
  },
);
process.exitCode = result.status ?? 1;
