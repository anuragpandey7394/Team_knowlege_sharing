import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
export function createDatabase(connectionString: string, schema = "public") {
  if (!/^[a-z][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid database schema");
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        options: `-c search_path=${schema}`,
        max: 5,
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 1000,
      },
      { schema },
    ),
  });
}
export type Database = ReturnType<typeof createDatabase>;
