import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import {
  organizationInputSchema,
  organizationParamsSchema,
  organizationSchema,
  organizationsSchema,
  paginationSchema,
  memberParamsSchema,
  membersSchema,
  roleInputSchema,
  inviteInputSchema,
  inviteParamsSchema,
  invitesSchema,
  inviteSchema,
  tokenInputSchema,
  inviteInspectionSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import { requireTenant, requireVerifiedActor, hashToken } from "./tenant.js";
import { transaction } from "./transaction.js";
import { can } from "./policy.js";
import { ApiError } from "./errors.js";
import { createMailAdapter } from "./mail.js";
import { rateLimit } from "./rate-limit.js";

export async function registerOrganizations(
  instance: FastifyInstance,
  db: Database,
  env: Environment,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const errors = {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    429: errorSchema,
  };
  const messageSchema = z.object({ message: z.string() });
  const mail = createMailAdapter(env.SMTP_HOST, env.SMTP_PORT);
  app.addHook("onClose", async () => mail.close());
  app.get(
    "/api/v1/organizations",
    {
      schema: {
        querystring: paginationSchema,
        response: { 200: organizationsSchema, ...errors },
      },
    },
    async (request) => {
      const actor = await requireVerifiedActor(db, request);
      const where = { memberships: { some: { userId: actor.user.id } } };
      const [items, total] = await db.$transaction([
        db.organization.findMany({
          where,
          skip: request.query.offset,
          take: request.query.limit,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            memberships: {
              where: { userId: actor.user.id },
              select: { role: true },
            },
          },
        }),
        db.organization.count({ where }),
      ]);
      return {
        items: items.map((org) => ({
          id: org.id,
          name: org.name,
          role: org.memberships[0]!.role,
        })),
        total,
      };
    },
  );
  app.post(
    "/api/v1/organizations",
    {
      schema: {
        body: organizationInputSchema,
        response: { 201: organizationSchema, ...errors },
      },
    },
    async (request, reply) => {
      const organization = await transaction(db, async (tx) => {
        const actor = await requireVerifiedActor(tx, request);
        return tx.organization.create({
          data: {
            name: request.body.name,
            creatorId: actor.user.id,
            memberships: { create: { userId: actor.user.id, role: "ADMIN" } },
          },
          select: { id: true, name: true },
        });
      });
      return reply.code(201).send(organization);
    },
  );
  app.patch(
    "/api/v1/organizations/:orgId",
    {
      schema: {
        params: organizationParamsSchema,
        body: organizationInputSchema,
        response: { 200: organizationSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        await requireTenant(tx, request, request.params.orgId, "admin");
        return tx.organization.update({
          where: { id: request.params.orgId },
          data: request.body,
          select: { id: true, name: true },
        });
      }),
  );
  app.get(
    "/api/v1/organizations/:orgId/members",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: paginationSchema,
        response: { 200: membersSchema, ...errors },
      },
    },
    async (request) => {
      await requireTenant(db, request, request.params.orgId);
      const where = { organizationId: request.params.orgId };
      const [items, total] = await db.$transaction([
        db.membership.findMany({
          where,
          skip: request.query.offset,
          take: request.query.limit,
          orderBy: { userId: "asc" },
          select: {
            userId: true,
            role: true,
            user: { select: { displayName: true, email: true } },
          },
        }),
        db.membership.count({ where }),
      ]);
      return {
        items: items.map(({ user, ...membership }) => ({
          ...membership,
          ...user,
        })),
        total,
      };
    },
  );
  for (const method of ["PATCH", "DELETE"] as const) {
    app.route({
      method,
      url: "/api/v1/organizations/:orgId/members/:userId",
      schema: {
        params: memberParamsSchema,
        ...(method === "PATCH" ? { body: roleInputSchema } : {}),
        response: { 200: messageSchema, ...errors },
      },
      handler: async (request) =>
        transaction(db, async (tx) => {
          const { orgId, userId } = request.params;
          await requireTenant(tx, request, orgId, "admin");
          // Every membership change writes this common row, serializing final-Admin checks.
          await tx.organization.update({
            where: { id: orgId },
            data: { membershipRevision: { increment: 1 } },
          });
          const membership = await tx.membership.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId } },
          });
          if (!membership)
            throw new ApiError(404, "NOT_FOUND", "Resource not found");
          const role =
            method === "PATCH"
              ? roleInputSchema.parse(request.body).role
              : null;
          if (
            can(membership.role, "admin") &&
            (role === null || !can(role, "admin")) &&
            (await tx.membership.count({
              where: { organizationId: orgId, role: "ADMIN" },
            })) <= 1
          )
            throw new ApiError(
              409,
              "LAST_ADMIN",
              "Keep at least one Admin in this organization",
            );
          if (role)
            await tx.membership.update({
              where: {
                organizationId_userId: { organizationId: orgId, userId },
              },
              data: { role },
            });
          else
            await tx.membership.delete({
              where: {
                organizationId_userId: { organizationId: orgId, userId },
              },
            });
          return { message: "Membership updated." };
        }),
    });
  }
  app.get(
    "/api/v1/organizations/:orgId/invitations",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: paginationSchema,
        response: { 200: invitesSchema, ...errors },
      },
    },
    async (request) => {
      await requireTenant(db, request, request.params.orgId, "admin");
      const where = { organizationId: request.params.orgId };
      const [rows, total] = await db.$transaction([
        db.invitation.findMany({
          where,
          skip: request.query.offset,
          take: request.query.limit,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        }),
        db.invitation.count({ where }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          expiresAt: row.expiresAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
        })),
        total,
      };
    },
  );
  for (const resend of [false, true]) {
    app.post(
      resend
        ? "/api/v1/organizations/:orgId/invitations/:inviteId/resend"
        : "/api/v1/organizations/:orgId/invitations",
      {
        schema: {
          params: resend ? inviteParamsSchema : organizationParamsSchema,
          body: resend ? z.strictObject({}) : inviteInputSchema,
          response: { 201: inviteSchema, ...errors },
        },
      },
      async (request, reply) => {
        const orgId = request.params.orgId;
        const actor = await requireTenant(db, request, orgId, "admin");
        await rateLimit(
          db,
          env,
          "invite-mail",
          request.ip,
          actor.user.id,
          env.AUTH_MAIL_LIMIT,
        );
        const raw = randomBytes(32).toString("hex");
        const result = await transaction(db, async (tx) => {
          const current = await requireTenant(tx, request, orgId, "admin");
          await tx.organization.update({
            where: { id: orgId },
            data: { membershipRevision: { increment: 1 } },
          });
          const previous = resend
            ? await tx.invitation.findFirst({
                where: {
                  id: inviteParamsSchema.parse(request.params).inviteId,
                  organizationId: orgId,
                },
              })
            : null;
          if (
            resend &&
            (!previous || previous.acceptedAt || previous.revokedAt)
          )
            throw new ApiError(404, "NOT_FOUND", "Invitation not available");
          const data = resend
            ? previous!
            : inviteInputSchema.parse(request.body);
          const existing = await tx.membership.findFirst({
            where: { organizationId: orgId, user: { email: data.email } },
          });
          if (existing)
            throw new ApiError(
              409,
              "ALREADY_MEMBER",
              "This email is already a member",
            );
          await tx.invitation.updateMany({
            where: {
              organizationId: orgId,
              email: data.email,
              acceptedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: new Date() },
          });
          const invitation = await tx.invitation.create({
            data: {
              organizationId: orgId,
              inviterId: current.user.id,
              email: data.email,
              role: data.role,
              tokenHash: hashToken(raw),
              expiresAt: new Date(Date.now() + 7 * 86400000),
            },
          });
          const org = await tx.organization.findUniqueOrThrow({
            where: { id: orgId },
            select: { name: true },
          });
          return { invitation, name: org.name };
        });
        try {
          await mail.send(
            result.invitation.email,
            "Organization invitation",
            `You are invited to ${result.name}.\n${env.WEB_ORIGIN}/invite#token=${raw}\nSign in with the exact verified invited email. Expires in seven days.`,
          );
        } catch {
          app.log.error(
            { code: "MAIL_DELIVERY_FAILED" },
            "Invitation delivery failed; resend can be retried",
          );
        }
        return reply.code(201).send({
          id: result.invitation.id,
          email: result.invitation.email,
          role: result.invitation.role,
          expiresAt: result.invitation.expiresAt.toISOString(),
          acceptedAt: null,
          revokedAt: null,
        });
      },
    );
  }
  app.delete(
    "/api/v1/organizations/:orgId/invitations/:inviteId",
    {
      schema: {
        params: inviteParamsSchema,
        response: { 200: messageSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        await requireTenant(tx, request, request.params.orgId, "admin");
        await tx.organization.update({
          where: { id: request.params.orgId },
          data: { membershipRevision: { increment: 1 } },
        });
        const updated = await tx.invitation.updateMany({
          where: {
            id: request.params.inviteId,
            organizationId: request.params.orgId,
            acceptedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        if (!updated.count)
          throw new ApiError(404, "NOT_FOUND", "Invitation not available");
        return { message: "Invitation revoked." };
      }),
  );
  for (const accept of [false, true]) {
    app.post(
      `/api/v1/invitations/${accept ? "accept" : "inspect"}`,
      {
        schema: {
          body: tokenInputSchema,
          response: { 200: inviteInspectionSchema, ...errors },
        },
      },
      async (request) => {
        await rateLimit(db, env, "invite-token", request.ip, request.ip, 30);
        return transaction(db, async (tx) => {
          const actor = await requireVerifiedActor(tx, request);
          const invitation = await tx.invitation.findUnique({
            where: { tokenHash: hashToken(request.body.token) },
            include: { organization: true },
          });
          if (
            !invitation ||
            invitation.email !== actor.user.email ||
            invitation.acceptedAt ||
            invitation.revokedAt ||
            invitation.expiresAt <= new Date()
          )
            throw new ApiError(
              404,
              "NOT_FOUND",
              "Invitation not available for this account",
            );
          if (accept) {
            await tx.organization.update({
              where: { id: invitation.organizationId },
              data: { membershipRevision: { increment: 1 } },
            });
            const consumed = await tx.invitation.updateMany({
              where: {
                id: invitation.id,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
              data: { acceptedAt: new Date() },
            });
            if (!consumed.count)
              throw new ApiError(
                404,
                "NOT_FOUND",
                "Invitation not available for this account",
              );
            await tx.membership.upsert({
              where: {
                organizationId_userId: {
                  organizationId: invitation.organizationId,
                  userId: actor.user.id,
                },
              },
              create: {
                organizationId: invitation.organizationId,
                userId: actor.user.id,
                role: invitation.role,
              },
              update: {},
            });
          }
          return {
            organizationId: invitation.organizationId,
            organizationName: invitation.organization.name,
            role: invitation.role,
            expiresAt: invitation.expiresAt.toISOString(),
          };
        });
      },
    );
  }
}
