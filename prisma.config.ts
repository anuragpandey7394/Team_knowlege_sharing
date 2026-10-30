import "dotenv/config";
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "apps/api/prisma/schema.prisma",
  migrations: { path: "apps/api/prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://tka:tka_local_only@127.0.0.1:55432/tka_dev",
  },
});
