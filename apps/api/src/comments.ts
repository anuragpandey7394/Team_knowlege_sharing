import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
import {
  pageParamsSchema,
  commentParamsSchema,
  commentRevisionParamsSchema,
  commentInputSchema,
  commentEditSchema,
  commentSchema,
  commentsSchema,
  paginationSchema,
  revisionInputSchema,
  successSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import { requireTenant } from "./tenant.js";
import { activePage } from "./knowledge.js";
import { can } from "./policy.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";
type Tx = Prisma.TransactionClient;
const include = {
  author: true,
  pageVersion: true,
  revisions: { orderBy: { number: "desc" as const }, take: 1 },
};
async function dto(
  tx: Pick<Database, "membership">,
  comment: Prisma.CommentGetPayload<{ include: typeof include }>,
  revisionId?: string,
  memberIds?: Set<string>,
) {
  const revision = comment.revisions.find(
    (r) => !revisionId || r.id === revisionId,
  );
  if (!revision)
    throw new ApiError(404, "NOT_FOUND", "Comment revision not found");
  const member = memberIds
    ? memberIds.has(comment.authorId)
    : await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: comment.organizationId,
            userId: comment.authorId,
          },
        },
      });
  return {
    id: comment.id,
    authorId: comment.authorId,
    author: member ? comment.author.displayName : "Former member",
    pageVersionId: comment.pageVersionId,
    pageVersionNumber: comment.pageVersion.number,
    revision: revision.number,
    revisionId: revision.id,
    text: comment.tombstonedAt ? null : revision.text,
    tombstoned: Boolean(comment.tombstonedAt),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    revisionAt: revision.createdAt.toISOString(),
  };
}
async function commentEvent(
  tx: Tx,
  orgId: string,
  id: string,
  revisionId: string,
  kind: string,
  revision: number,
) {
  await tx.outboxEvent.create({
    data: {
      organizationId: orgId,
      sourceType: "comment",
      sourceId: id,
      sourceVersionId: revisionId,
      kind,
      dedupeKey: `${kind}:${id}:${revision}`,
    },
  });
}
export async function registerComments(
  instance: FastifyInstance,
  db: Database,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = "/api/v1/organizations/:orgId/pages/:pageId/comments";
  const errors = {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
  };
  app.get(
    base,
    {
      schema: {
        params: pageParamsSchema,
        querystring: paginationSchema,
        response: { 200: commentsSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, pageId } = request.params;
      await requireTenant(db, request, orgId);
      const page = await db.page.findFirst({
        where: {
          organizationId: orgId,
          id: pageId,
          publishedVersionId: { not: null },
        },
      });
      if (!page)
        throw new ApiError(404, "NOT_FOUND", "Published page not found");
      const [rows, total] = await db.$transaction([
        db.comment.findMany({
          where: { organizationId: orgId, pageId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: request.query.limit,
          skip: request.query.offset,
          include,
        }),
        db.comment.count({ where: { organizationId: orgId, pageId } }),
      ]);
      const memberships = await db.membership.findMany({
        where: {
          organizationId: orgId,
          userId: { in: rows.map((row) => row.authorId) },
        },
        select: { userId: true },
      });
      const memberIds = new Set(memberships.map((m) => m.userId));
      return {
        items: await Promise.all(
          rows.map((row) => dto(db, row, undefined, memberIds)),
        ),
        total,
      };
    },
  );
  app.get(
    `${base}/:commentId/revisions/:revisionId`,
    {
      schema: {
        params: commentRevisionParamsSchema,
        response: { 200: commentSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, pageId, commentId, revisionId } = request.params;
      await requireTenant(db, request, orgId);
      const comment = await db.comment.findFirst({
        where: { organizationId: orgId, pageId, id: commentId },
        include: { ...include, revisions: { where: { id: revisionId } } },
      });
      if (!comment) throw new ApiError(404, "NOT_FOUND", "Comment not found");
      return dto(db, comment, revisionId);
    },
  );
  app.post(
    base,
    {
      schema: {
        params: pageParamsSchema,
        body: commentInputSchema,
        response: { 201: commentSchema, ...errors },
      },
    },
    async (request, reply) => {
      const result = await transaction(db, async (tx) => {
        const { orgId, pageId } = request.params;
        const actor = await requireTenant(tx, request, orgId, "comment");
        const page = await activePage(tx, orgId, pageId);
        if (!page.publishedVersionId)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "Publish the page before commenting",
          );
        await tx.page.update({
          where: { id: pageId },
          data: { updatedAt: new Date() },
        });
        const comment = await tx.comment.create({
          data: {
            organizationId: orgId,
            pageId,
            pageVersionId: page.publishedVersionId,
            authorId: actor.user.id,
            revisions: { create: { number: 1, text: request.body.text } },
          },
          include,
        });
        await commentEvent(
          tx,
          orgId,
          comment.id,
          comment.revisions[0]!.id,
          "comment.created",
          1,
        );
        return dto(tx, comment);
      });
      return reply.code(201).send(result);
    },
  );
  for (const remove of [false, true]) {
    app.route({
      method: remove ? "DELETE" : "PATCH",
      url: `${base}/:commentId`,
      schema: {
        params: commentParamsSchema,
        body: remove ? revisionInputSchema : commentEditSchema,
        response: { 200: remove ? successSchema : commentSchema, ...errors },
      },
      handler: async (request) =>
        transaction(db, async (tx) => {
          const { orgId, pageId, commentId } = request.params;
          const actor = await requireTenant(tx, request, orgId, "comment");
          await activePage(tx, orgId, pageId);
          const comment = await tx.comment.findFirst({
            where: { organizationId: orgId, pageId, id: commentId },
            include,
          });
          if (!comment)
            throw new ApiError(404, "NOT_FOUND", "Comment not found");
          if (
            comment.authorId !== actor.user.id &&
            !(remove && can(actor.membership.role, "admin"))
          )
            throw new ApiError(
              403,
              "FORBIDDEN",
              "Only the author may edit; Admins may moderate by removing",
            );
          const changed = await tx.comment.updateMany({
            where: {
              id: commentId,
              organizationId: orgId,
              revision: request.body.expectedRevision,
              tombstonedAt: null,
            },
            data: {
              revision: { increment: 1 },
              ...(remove ? { tombstonedAt: new Date() } : {}),
            },
          });
          if (!changed.count)
            throw new ApiError(
              409,
              "REVISION_CONFLICT",
              "Comment changed or was removed. Reload before retrying.",
            );
          let revisionId = comment.revisions[0]!.id;
          if (!remove) {
            const parsed = commentEditSchema.parse(request.body);
            const revision = await tx.commentRevision.create({
              data: {
                organizationId: orgId,
                commentId,
                number: comment.revision + 1,
                text: parsed.text,
              },
            });
            revisionId = revision.id;
          }
          await commentEvent(
            tx,
            orgId,
            commentId,
            revisionId,
            remove ? "comment.deleted" : "comment.edited",
            comment.revision + 1,
          );
          if (remove) {
            await tx.auditEvent.create({
              data: {
                organizationId: orgId,
                actorId: actor.user.id,
                action:
                  comment.authorId === actor.user.id
                    ? "comment.deleted"
                    : "comment.moderated",
                resourceId: commentId,
                requestId: request.id,
              },
            });
            return { ok: true as const };
          }
          return dto(
            tx,
            await tx.comment.findUniqueOrThrow({
              where: { id: commentId },
              include,
            }),
          );
        }),
    });
  }
}
