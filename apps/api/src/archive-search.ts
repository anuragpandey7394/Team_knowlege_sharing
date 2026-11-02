import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "./database.js";
import { Prisma } from "./generated/prisma/client.js";
import {
  pageParamsSchema,
  spaceParamsSchema,
  organizationParamsSchema,
  revisionInputSchema,
  restorePageSchema,
  successSchema,
  errorSchema,
  paginationSchema,
  treeSchema,
  searchQuerySchema,
  searchResultSchema,
} from "../../../packages/contracts/src/index.js";
import { requireTenant } from "./tenant.js";
import { parentDepth, activeSpace } from "./knowledge.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";

export async function registerArchiveSearch(
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
  app.get(
    "/api/v1/organizations/:orgId/archived-pages",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: paginationSchema,
        response: { 200: treeSchema, ...errors },
      },
    },
    async (request) => {
      const orgId = request.params.orgId;
      await requireTenant(db, request, orgId, "edit");
      const where = { organizationId: orgId, archivedAt: { not: null } };
      const [rows, total] = await db.$transaction([
        db.page.findMany({
          where,
          orderBy: { id: "asc" },
          take: request.query.limit,
          skip: request.query.offset,
          include: { draft: { select: { title: true } } },
        }),
        db.page.count({ where }),
      ]);
      return {
        items: rows.map((p) => ({
          id: p.id,
          spaceId: p.spaceId,
          parentId: p.parentId,
          revision: p.revision,
          title: p.draft?.title ?? "Untitled",
          published: Boolean(p.publishedVersionId),
        })),
        total,
      };
    },
  );
  for (const restore of [false, true]) {
    app.post(
      `/api/v1/organizations/:orgId/spaces/:spaceId/${restore ? "restore" : "archive"}`,
      {
        schema: {
          params: spaceParamsSchema,
          body: revisionInputSchema,
          response: { 200: successSchema, ...errors },
        },
      },
      async (request) =>
        transaction(db, async (tx) => {
          const { orgId, spaceId } = request.params;
          const actor = await requireTenant(tx, request, orgId, "edit");
          const space = await tx.space.findFirst({
            where: { id: spaceId, organizationId: orgId },
          });
          if (!space) throw new ApiError(404, "NOT_FOUND", "Space not found");
          const changed = await tx.space.updateMany({
            where: {
              id: spaceId,
              organizationId: orgId,
              treeRevision: request.body.expectedRevision,
            },
            data: {
              archivedAt: restore ? null : new Date(),
              treeRevision: { increment: 1 },
            },
          });
          if (!changed.count)
            throw new ApiError(
              409,
              "REVISION_CONFLICT",
              "Space changed. Reload and retry.",
            );
          // Emit bounded batches; jobs are dispatched only in M07.
          let cursor: string | undefined;
          while (true) {
            const pages = await tx.page.findMany({
              where: {
                organizationId: orgId,
                spaceId,
                archivedAt: null,
                publishedVersionId: { not: null },
              },
              take: 100,
              orderBy: { id: "asc" },
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            for (const p of pages)
              await tx.outboxEvent.create({
                data: {
                  organizationId: orgId,
                  sourceType: "page",
                  sourceId: p.id,
                  sourceVersionId: p.publishedVersionId!,
                  kind: restore ? "page.restored" : "page.archived",
                  dedupeKey: `space:${spaceId}:${space.treeRevision + 1}:${p.id}`,
                },
              });
            if (pages.length < 100) break;
            cursor = pages.at(-1)!.id;
          }
          await tx.auditEvent.create({
            data: {
              organizationId: orgId,
              actorId: actor.user.id,
              action: restore ? "space.restored" : "space.archived",
              resourceId: spaceId,
              requestId: request.id,
            },
          });
          return { ok: true as const };
        }),
    );
    app.post(
      `/api/v1/organizations/:orgId/pages/:pageId/${restore ? "restore" : "archive"}`,
      {
        schema: {
          params: pageParamsSchema,
          body: restore ? restorePageSchema : revisionInputSchema,
          response: { 200: successSchema, ...errors },
        },
      },
      async (request) =>
        transaction(db, async (tx) => {
          const { orgId, pageId } = request.params;
          const actor = await requireTenant(tx, request, orgId, "edit");
          const page = await tx.page.findFirst({
            where: { id: pageId, organizationId: orgId },
          });
          if (!page) throw new ApiError(404, "NOT_FOUND", "Page not found");
          await activeSpace(tx, orgId, page.spaceId);
          await tx.space.update({
            where: { id: page.spaceId },
            data: { treeRevision: { increment: 1 } },
          });
          if (page.revision !== request.body.expectedRevision)
            throw new ApiError(
              409,
              "REVISION_CONFLICT",
              "Page changed. Reload and retry.",
            );
          if (restore) {
            const parentId =
              "parentId" in request.body &&
              (typeof request.body.parentId === "string" ||
                request.body.parentId === null)
                ? request.body.parentId
                : page.parentId;
            await parentDepth(tx, orgId, page.spaceId, parentId, pageId);
            if (parentId && page.publishedVersionId) {
              const parent = await tx.page.findUniqueOrThrow({
                where: { id: parentId },
              });
              if (!parent.publishedVersionId)
                throw new ApiError(
                  409,
                  "UNPUBLISHED_PARENT",
                  "Restore published pages below a published parent or at root",
                );
            }
            await tx.page.update({
              where: { id: pageId },
              data: { archivedAt: null, parentId, revision: { increment: 1 } },
            });
            if (page.publishedVersionId)
              await tx.outboxEvent.create({
                data: {
                  organizationId: orgId,
                  sourceType: "page",
                  sourceId: pageId,
                  sourceVersionId: page.publishedVersionId,
                  kind: "page.restored",
                  dedupeKey: `page:${pageId}:restore:${page.revision + 1}`,
                },
              });
          } else {
            // Recursive CTE locks are serialized by the space revision above.
            const descendants = await tx.$queryRaw<
              {
                id: string;
                publishedVersionId: string | null;
                revision: number;
              }[]
            >`
          WITH RECURSIVE subtree AS (
            SELECT id, "publishedVersionId", revision FROM "Page" WHERE id = ${pageId}::uuid AND "organizationId" = ${orgId}::uuid
            UNION ALL SELECT p.id, p."publishedVersionId", p.revision FROM "Page" p JOIN subtree s ON p."parentId" = s.id WHERE p."organizationId" = ${orgId}::uuid AND p."spaceId" = ${page.spaceId}::uuid
          ) SELECT * FROM subtree`;
            for (const p of descendants) {
              await tx.page.update({
                where: { id: p.id },
                data: { archivedAt: new Date(), revision: { increment: 1 } },
              });
              if (p.publishedVersionId)
                await tx.outboxEvent.create({
                  data: {
                    organizationId: orgId,
                    sourceType: "page",
                    sourceId: p.id,
                    sourceVersionId: p.publishedVersionId,
                    kind: "page.archived",
                    dedupeKey: `page:${p.id}:archive:${p.revision + 1}`,
                  },
                });
            }
          }
          await tx.auditEvent.create({
            data: {
              organizationId: orgId,
              actorId: actor.user.id,
              action: restore ? "page.restored" : "page.archived",
              resourceId: pageId,
              requestId: request.id,
            },
          });
          return { ok: true as const };
        }),
    );
  }
  app.get(
    "/api/v1/organizations/:orgId/search",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: searchQuerySchema,
        response: { 200: searchResultSchema, ...errors },
      },
    },
    async (request) => {
      const orgId = request.params.orgId;
      await requireTenant(db, request, orgId);
      if (request.query.spaceId)
        await activeSpace(db, orgId, request.query.spaceId);
      const { q, spaceId, limit, offset } = request.query;
      const scope = Prisma.sql`p."organizationId" = ${orgId}::uuid AND p."archivedAt" IS NULL AND s."archivedAt" IS NULL ${spaceId ? Prisma.sql`AND p."spaceId" = ${spaceId}::uuid` : Prisma.empty}
      AND to_tsvector('english', v.title || ' ' || v.text) @@ websearch_to_tsquery('english', ${q})`;
      const [items, counts] = await db.$transaction([
        db.$queryRaw<
          {
            pageId: string;
            versionId: string;
            title: string;
            snippet: string;
            spaceId: string;
          }[]
        >(Prisma.sql`SELECT p.id AS "pageId", v.id AS "versionId", v.title, p."spaceId", left(v.text, 240) AS snippet
        FROM "Page" p JOIN "Space" s ON s.id = p."spaceId" JOIN "PageVersion" v ON v.id = p."publishedVersionId" AND v."organizationId" = p."organizationId"
        WHERE ${scope} ORDER BY ts_rank(to_tsvector('english', v.title || ' ' || v.text), websearch_to_tsquery('english', ${q})) DESC, p.id LIMIT ${limit} OFFSET ${offset}`),
        db.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "Page" p JOIN "Space" s ON s.id = p."spaceId" JOIN "PageVersion" v ON v.id = p."publishedVersionId" AND v."organizationId" = p."organizationId" WHERE ${scope}`,
        ),
      ]);
      return { items, total: Number(counts[0]?.total ?? 0) };
    },
  );
}
