import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
export function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ("code" in error && error.code === "P2034") return true;
  // Adapter commit failures can escape before Prisma wraps them as P2034.
  const cause = error.cause;
  return (
    error.name === "DriverAdapterError" &&
    typeof cause === "object" &&
    cause !== null &&
    "kind" in cause &&
    cause.kind === "TransactionWriteConflict"
  );
}
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
      if (attempt < 3 && isSerializationConflict(error)) continue;
      throw error;
    }
  }
}
