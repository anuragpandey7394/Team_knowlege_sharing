import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
export function createDatabase(connectionString: string, schema = "public") {
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        max: 5,
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 1000,
      },
      { schema },
    ),
  });
}
export type Database = ReturnType<typeof createDatabase>;
