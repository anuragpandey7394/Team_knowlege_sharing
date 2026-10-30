import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
export async function transaction<T>(
  db: Database,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: "Serializable",
      });
    } catch (error) {
      if (
        attempt < 3 &&
        error instanceof Error &&
        "code" in error &&
        error.code === "P2034"
      )
        continue;
      throw error;
    }
  }
}
