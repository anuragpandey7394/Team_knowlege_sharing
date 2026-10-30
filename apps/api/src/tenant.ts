import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Database } from "./database.js";
import { ApiError } from "./errors.js";
import { can, type Capability } from "./policy.js";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function requireActor(
  db: Pick<Database, "session">,
  request: FastifyRequest,
) {
  const token = request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("tka_session="))
    ?.slice("tka_session=".length);
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date())
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return { user: session.user, session };
}
export async function requireTenant(
  db: Pick<Database, "session" | "membership" | "organization">,
  request: FastifyRequest,
  organizationId: string,
  capability: Capability = "read",
) {
  const actor = await requireActor(db, request);
  if (!actor.user.verifiedAt)
    throw new ApiError(403, "EMAIL_UNVERIFIED", "Verify your email first");
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId: actor.user.id } },
  });
  if (!membership) throw new ApiError(404, "NOT_FOUND", "Resource not found");
  if (!can(membership.role, capability))
    throw new ApiError(403, "FORBIDDEN", "Insufficient permission");
  return { ...actor, membership, organizationId };
}
export async function getTenantOrganization(
  db: Pick<Database, "session" | "membership" | "organization">,
  request: FastifyRequest,
  organizationId: string,
) {
  const tenant = await requireTenant(db, request, organizationId);
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) throw new ApiError(404, "NOT_FOUND", "Resource not found");
  return { ...organization, role: tenant.membership.role };
}

export async function requireVerifiedActor(
  db: Pick<Database, "session">,
  request: FastifyRequest,
) {
  const actor = await requireActor(db, request);
  if (!actor.user.verifiedAt)
    throw new ApiError(403, "EMAIL_UNVERIFIED", "Verify your email first");
  return actor;
}
