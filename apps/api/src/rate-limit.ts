import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import { hashToken } from "./tenant.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";
async function limit(
  db: Database,
  env: Environment,
  key: string,
  maximum: number,
) {
  const now = new Date();
  const count = await transaction(db, async (tx) => {
    const record = await tx.rateLimit.findUnique({ where: { key } });
    if (!record || record.resetsAt <= now) {
      await tx.rateLimit.upsert({
        where: { key },
        create: {
          key,
          attempts: 1,
          resetsAt: new Date(
            now.getTime() + env.AUTH_RATE_WINDOW_SECONDS * 1000,
          ),
        },
        update: {
          attempts: 1,
          resetsAt: new Date(
            now.getTime() + env.AUTH_RATE_WINDOW_SECONDS * 1000,
          ),
        },
      });
      return 1;
    }
    return (
      await tx.rateLimit.update({
        where: { key },
        data: { attempts: { increment: 1 } },
      })
    ).attempts;
  });
  if (count > maximum)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Try again later.",
    );
}
export async function rateLimit(
  db: Database,
  env: Environment,
  kind: string,
  ip: string,
  identity: string,
  maximum: number,
) {
  await limit(db, env, `${kind}:ip:${hashToken(ip)}`, maximum * 10);
  await limit(db, env, `${kind}:identity:${hashToken(identity)}`, maximum);
}
