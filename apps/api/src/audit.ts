import type { FastifyRequest } from "fastify";
import type { Prisma } from "./generated/prisma/client.js";
export async function audit(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  organizationId: string,
  actorId: string,
  action: string,
  resourceId: string,
) {
  await tx.auditEvent.create({
    data: {
      organizationId,
      actorId,
      action,
      resourceId,
      requestId: request.id,
    },
  });
}
