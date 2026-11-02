import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
import {
  pageParamsSchema,
  versionParamsSchema,
  publishedPageSchema,
  historySchema,
  paginationSchema,
  publishInputSchema,
  publicationSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import { requireTenant } from "./tenant.js";
import { activePage, parentDepth } from "./knowledge.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";
import { validateDocument } from "../../../packages/contracts/src/rich-text.js";

export async function registerPublication(
  instance: FastifyInstance,
  db: Database,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const errors = {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
  };
  for (const historical of [false, true]) {
    app.get(
      `/api/v1/organizations/:orgId/pages/:pageId${historical ? "/versions/:versionId" : ""}`,
      {
        schema: {
          params: historical ? versionParamsSchema : pageParamsSchema,
          response: { 200: publishedPageSchema, ...errors },
        },
      },
      async (request) => {
        const { orgId, pageId } = request.params;
        await requireTenant(db, request, orgId);
        const page = await db.page.findFirst({
          where: { organizationId: orgId, id: pageId },
          include: { creator: true, space: true },
        });
        if (!page?.publishedVersionId)
          throw new ApiError(404, "NOT_FOUND", "Published page not found");
        const archived = Boolean(page.archivedAt || page.space.archivedAt);
        if (archived && !historical)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "Page archived. Open an exact historical version.",
          );
        const versionId =
          "versionId" in request.params &&
          typeof request.params.versionId === "string"
            ? request.params.versionId
            : page.publishedVersionId;
        const version = await db.pageVersion.findFirst({
          where: { organizationId: orgId, pageId, id: versionId },
          include: { publisher: true },
        });
        if (!version) throw new ApiError(404, "NOT_FOUND", "Version not found");
        const memberships = await db.membership.findMany({
          where: {
            organizationId: orgId,
            userId: { in: [page.creatorId, version.publisherId] },
          },
          select: { userId: true },
        });
        const name = (id: string, displayName: string) =>
          memberships.some((m) => m.userId === id)
            ? displayName
            : "Former member";
        return {
          pageId,
          spaceId: version.spaceId,
          parentId: version.parentId,
          versionId: version.id,
          currentVersionId: page.publishedVersionId,
          number: version.number,
          title: version.title,
          body: version.body,
          text: version.text,
          creator: name(page.creatorId, page.creator.displayName),
          publisher: name(version.publisherId, version.publisher.displayName),
          createdAt: page.createdAt.toISOString(),
          publishedAt: version.createdAt.toISOString(),
          archived,
          changed: version.id !== page.publishedVersionId,
          indexStatus: "awaiting-provider" as const,
        };
      },
    );
  }
  app.get(
    "/api/v1/organizations/:orgId/pages/:pageId/versions",
    {
      schema: {
        params: pageParamsSchema,
        querystring: paginationSchema,
        response: { 200: historySchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, pageId } = request.params;
      await requireTenant(db, request, orgId);
      const page = await db.page.findFirst({
        where: {
          id: pageId,
          organizationId: orgId,
          publishedVersionId: { not: null },
        },
      });
      if (!page)
        throw new ApiError(404, "NOT_FOUND", "Published page not found");
      const [rows, total] = await db.$transaction([
        db.pageVersion.findMany({
          where: { organizationId: orgId, pageId },
          orderBy: { number: "desc" },
          take: request.query.limit,
          skip: request.query.offset,
          include: {
            publisher: {
              include: {
                memberships: {
                  where: { organizationId: orgId },
                  select: { userId: true },
                },
              },
            },
          },
        }),
        db.pageVersion.count({ where: { organizationId: orgId, pageId } }),
      ]);
      return {
        items: rows.map((v) => ({
          pageId,
          versionId: v.id,
          number: v.number,
          draftRevision: v.draftRevision,
          title: v.title,
          publishedAt: v.createdAt.toISOString(),
          publisher: v.publisher.memberships.length
            ? v.publisher.displayName
            : "Former member",
        })),
        total,
      };
    },
  );
  app.post(
    "/api/v1/organizations/:orgId/pages/:pageId/publish",
    {
      schema: {
        params: pageParamsSchema,
        body: publishInputSchema,
        response: {
          200: publicationSchema,
          400: errorSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        const { orgId, pageId } = request.params;
        const actor = await requireTenant(tx, request, orgId, "edit");
        const page = await activePage(tx, orgId, pageId);
        // Serialize structural changes with publication, then save with publication.
        await tx.space.update({
          where: { id: page.spaceId },
          data: { treeRevision: { increment: 1 } },
        });
        await tx.page.update({
          where: { id: pageId },
          data: { updatedAt: new Date() },
        });
        const prior = await tx.pageVersion.findUnique({
          where: {
            organizationId_pageId_idempotencyKey: {
              organizationId: orgId,
              pageId,
              idempotencyKey: request.body.idempotencyKey,
            },
          },
        });
        const dto = (v: {
          id: string;
          number: number;
          draftRevision: number;
          title: string;
          createdAt: Date;
        }) => ({
          pageId,
          versionId: v.id,
          number: v.number,
          draftRevision: v.draftRevision,
          title: v.title,
          publishedAt: v.createdAt.toISOString(),
        });
        if (prior) {
          if (prior.draftRevision !== request.body.expectedRevision)
            throw new ApiError(
              409,
              "IDEMPOTENCY_CONFLICT",
              "Use a new publication key for a different revision",
            );
          return dto(prior);
        }
        const draft = await tx.pageDraft.findUnique({ where: { pageId } });
        if (!draft || draft.revision !== request.body.expectedRevision)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "Draft changed. Save and review the latest revision before publishing.",
          );
        const normalized = validateDocument(draft.body);
        if (!draft.title.trim() || !normalized.text.trim())
          throw new ApiError(
            400,
            "EMPTY_PUBLICATION",
            "A published page needs a title and body",
          );
        await parentDepth(tx, orgId, page.spaceId, page.parentId, pageId);
        // Read-only navigation must not hide a published child behind a draft ancestor.
        let parentId = page.parentId;
        while (parentId) {
          const parent = await activePage(tx, orgId, parentId);
          if (!parent.publishedVersionId)
            throw new ApiError(
              409,
              "UNPUBLISHED_PARENT",
              "Publish ancestor pages first",
            );
          parentId = parent.parentId;
        }
        const last = await tx.pageVersion.aggregate({
          where: { organizationId: orgId, pageId },
          _max: { number: true },
        });
        const version = await tx.pageVersion.create({
          data: {
            organizationId: orgId,
            pageId,
            number: (last._max.number ?? 0) + 1,
            draftRevision: draft.revision,
            idempotencyKey: request.body.idempotencyKey,
            title: draft.title,
            body: normalized.document as Prisma.InputJsonValue,
            text: normalized.text,
            parentId: page.parentId,
            spaceId: page.spaceId,
            publisherId: actor.user.id,
          },
        });
        await tx.page.update({
          where: { id: pageId },
          data: { publishedVersionId: version.id },
        });
        await tx.outboxEvent.create({
          data: {
            organizationId: orgId,
            sourceType: "page",
            sourceId: pageId,
            sourceVersionId: version.id,
            kind: "page.published",
            dedupeKey: `page.published:${version.id}`,
          },
        });
        await tx.auditEvent.create({
          data: {
            organizationId: orgId,
            actorId: actor.user.id,
            action: "page.published",
            resourceId: pageId,
            requestId: request.id,
          },
        });
        return dto(version);
      }),
  );
}
