import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Prisma } from "./generated/prisma/client.js";
import type { Database } from "./database.js";
import {
  spaceParamsSchema,
  pageParamsSchema,
  organizationParamsSchema,
  spaceInputSchema,
  spaceSchema,
  spacesSchema,
  archiveQuerySchema,
  treeQuerySchema,
  treeSchema,
  pageCreateSchema,
  pageSummarySchema,
  draftInputSchema,
  draftSchema,
  movePageSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import {
  emptyDocument,
  validateDocument,
} from "../../../packages/contracts/src/rich-text.js";
import { requireTenant } from "./tenant.js";
import { can } from "./policy.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";
import { z } from "zod";
type Tx = Prisma.TransactionClient;
export async function activeSpace(
  db: Pick<Database, "space">,
  orgId: string,
  spaceId: string,
) {
  const space = await db.space.findFirst({
    where: { id: spaceId, organizationId: orgId, archivedAt: null },
  });
  if (!space) throw new ApiError(404, "NOT_FOUND", "Space not found");
  return space;
}
export async function activePage(
  db: Pick<Database, "page">,
  orgId: string,
  pageId: string,
) {
  const page = await db.page.findFirst({
    where: {
      id: pageId,
      organizationId: orgId,
      archivedAt: null,
      space: { archivedAt: null },
    },
  });
  if (!page) throw new ApiError(404, "NOT_FOUND", "Page not found");
  return page;
}
export async function parentDepth(
  tx: Tx,
  orgId: string,
  spaceId: string,
  parentId: string | null,
  excluded?: string,
  publishedAncestors = false,
) {
  let depth = 1;
  let next = parentId;
  while (next) {
    if (next === excluded)
      throw new ApiError(
        409,
        "TREE_CYCLE",
        "A page cannot be its own ancestor",
      );
    const parent = await tx.page.findFirst({
      where: { id: next, organizationId: orgId, spaceId, archivedAt: null },
    });
    if (!parent) throw new ApiError(404, "NOT_FOUND", "Parent page not found");
    if (publishedAncestors && !parent.publishedVersionId)
      throw new ApiError(
        409,
        "UNPUBLISHED_PARENT",
        "Published pages require published ancestors",
      );
    if (++depth > 10)
      throw new ApiError(409, "TREE_DEPTH", "Maximum page depth is ten");
    next = parent.parentId;
  }
  return depth;
}
async function subtreeHeight(
  tx: Tx,
  orgId: string,
  spaceId: string,
  id: string,
) {
  let frontier = [id];
  let height = 0;
  while (frontier.length) {
    if (++height > 10)
      throw new ApiError(409, "TREE_DEPTH", "Invalid page hierarchy");
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += 100) {
      let cursor: string | undefined;
      while (true) {
        const children = await tx.page.findMany({
          where: {
            organizationId: orgId,
            spaceId,
            parentId: { in: frontier.slice(i, i + 100) },
          },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true },
        });
        next.push(...children.map((row) => row.id));
        if (children.length < 100) break;
        cursor = children.at(-1)!.id;
      }
    }
    frontier = next;
  }
  return height;
}
async function readDraft(
  db: Pick<Database, "page">,
  orgId: string,
  pageId: string,
) {
  const page = await db.page.findFirst({
    where: {
      id: pageId,
      organizationId: orgId,
      archivedAt: null,
      space: { archivedAt: null },
    },
    include: { draft: true, creator: { select: { displayName: true } } },
  });
  if (!page?.draft) throw new ApiError(404, "NOT_FOUND", "Draft not found");
  return {
    page: {
      id: page.id,
      spaceId: page.spaceId,
      parentId: page.parentId,
      title: page.draft.title,
      revision: page.revision,
      published: Boolean(page.publishedVersionId),
    },
    title: page.draft.title,
    body: page.draft.body,
    text: page.draft.text,
    revision: page.draft.revision,
    creator: page.creator.displayName,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.draft.updatedAt.toISOString(),
  };
}
export async function registerKnowledge(
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
  const spaceDto = (space: {
    id: string;
    name: string;
    description: string;
    treeRevision: number;
  }) => ({
    id: space.id,
    name: space.name,
    description: space.description,
    revision: space.treeRevision,
  });
  app.get(
    "/api/v1/organizations/:orgId/spaces",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: archiveQuerySchema,
        response: { 200: spacesSchema, ...errors },
      },
    },
    async (request) => {
      await requireTenant(
        db,
        request,
        request.params.orgId,
        request.query.archived === "true" ? "edit" : "read",
      );
      const where = {
        organizationId: request.params.orgId,
        archivedAt: request.query.archived === "true" ? { not: null } : null,
      };
      const [rows, total] = await db.$transaction([
        db.space.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: request.query.limit,
          skip: request.query.offset,
        }),
        db.space.count({ where }),
      ]);
      return { items: rows.map(spaceDto), total };
    },
  );
  app.post(
    "/api/v1/organizations/:orgId/spaces",
    {
      schema: {
        params: organizationParamsSchema,
        body: spaceInputSchema,
        response: { 201: spaceSchema, ...errors },
      },
    },
    async (request, reply) => {
      const space = await transaction(db, async (tx) => {
        await requireTenant(tx, request, request.params.orgId, "edit");
        return tx.space.create({
          data: { ...request.body, organizationId: request.params.orgId },
        });
      });
      return reply.code(201).send(spaceDto(space));
    },
  );
  app.get(
    "/api/v1/organizations/:orgId/spaces/:spaceId",
    {
      schema: {
        params: spaceParamsSchema,
        response: { 200: spaceSchema, ...errors },
      },
    },
    async (request) => {
      await requireTenant(db, request, request.params.orgId);
      return spaceDto(
        await activeSpace(db, request.params.orgId, request.params.spaceId),
      );
    },
  );
  app.patch(
    "/api/v1/organizations/:orgId/spaces/:spaceId",
    {
      schema: {
        params: spaceParamsSchema,
        body: spaceInputSchema.extend({
          expectedRevision: z.number().int().min(0),
        }),
        response: { 200: spaceSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        await requireTenant(tx, request, request.params.orgId, "edit");
        await activeSpace(tx, request.params.orgId, request.params.spaceId);
        const changed = await tx.space.updateMany({
          where: {
            id: request.params.spaceId,
            organizationId: request.params.orgId,
            treeRevision: request.body.expectedRevision,
          },
          data: {
            name: request.body.name,
            description: request.body.description,
            treeRevision: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "Space changed. Reload and retry.",
          );
        return spaceDto(
          await activeSpace(tx, request.params.orgId, request.params.spaceId),
        );
      }),
  );
  app.get(
    "/api/v1/organizations/:orgId/spaces/:spaceId/tree",
    {
      schema: {
        params: spaceParamsSchema,
        querystring: treeQuerySchema,
        response: { 200: treeSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, spaceId } = request.params;
      const actor = await requireTenant(db, request, orgId);
      const edit = can(actor.membership.role, "edit");
      await activeSpace(db, orgId, spaceId);
      if (request.query.parentId) {
        const parent = await activePage(db, orgId, request.query.parentId);
        if (parent.spaceId !== spaceId || (!edit && !parent.publishedVersionId))
          throw new ApiError(404, "NOT_FOUND", "Parent not found");
      }
      const where = {
        organizationId: orgId,
        spaceId,
        parentId: request.query.parentId ?? null,
        archivedAt: null,
        ...(!edit ? { publishedVersionId: { not: null } } : {}),
      };
      const [rows, total] = await db.$transaction([
        db.page.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: request.query.limit,
          skip: request.query.offset,
          include: {
            draft: { select: { title: true } },
            publishedVersion: { select: { title: true } },
          },
        }),
        db.page.count({ where }),
      ]);
      return {
        items: rows.map((page) => ({
          id: page.id,
          spaceId,
          parentId: page.parentId,
          title:
            (edit ? page.draft?.title : page.publishedVersion?.title) ??
            "Untitled",
          revision: page.revision,
          published: Boolean(page.publishedVersionId),
        })),
        total,
      };
    },
  );
  app.post(
    "/api/v1/organizations/:orgId/pages",
    {
      schema: {
        params: organizationParamsSchema,
        body: pageCreateSchema,
        response: { 201: pageSummarySchema, ...errors },
      },
    },
    async (request, reply) => {
      const orgId = request.params.orgId;
      const page = await transaction(db, async (tx) => {
        const actor = await requireTenant(tx, request, orgId, "edit");
        await activeSpace(tx, orgId, request.body.spaceId);
        await tx.space.update({
          where: { id: request.body.spaceId },
          data: { treeRevision: { increment: 1 } },
        });
        await parentDepth(
          tx,
          orgId,
          request.body.spaceId,
          request.body.parentId,
        );
        return tx.page.create({
          data: {
            organizationId: orgId,
            spaceId: request.body.spaceId,
            parentId: request.body.parentId,
            creatorId: actor.user.id,
            draft: {
              create: {
                title: request.body.title,
                body: emptyDocument as Prisma.InputJsonValue,
                text: "",
                updatedById: actor.user.id,
              },
            },
          },
        });
      });
      return reply.code(201).send({
        id: page.id,
        spaceId: page.spaceId,
        parentId: page.parentId,
        title: request.body.title,
        revision: page.revision,
        published: false,
      });
    },
  );
  app.get(
    "/api/v1/organizations/:orgId/pages/:pageId/draft",
    {
      schema: {
        params: pageParamsSchema,
        response: { 200: draftSchema, ...errors },
      },
    },
    async (request) => {
      await requireTenant(db, request, request.params.orgId, "edit");
      return readDraft(db, request.params.orgId, request.params.pageId);
    },
  );
  app.patch(
    "/api/v1/organizations/:orgId/pages/:pageId/draft",
    {
      schema: {
        params: pageParamsSchema,
        body: draftInputSchema,
        response: { 200: draftSchema, ...errors },
      },
    },
    async (request) => {
      let normalized: ReturnType<typeof validateDocument>;
      try {
        normalized = validateDocument(request.body.body);
      } catch {
        throw new ApiError(
          400,
          "INVALID_DOCUMENT",
          "Unsupported or unsafe editor content",
        );
      }
      return transaction(db, async (tx) => {
        const { orgId, pageId } = request.params;
        const actor = await requireTenant(tx, request, orgId, "edit");
        await activePage(tx, orgId, pageId);
        const changed = await tx.pageDraft.updateMany({
          where: {
            pageId,
            organizationId: orgId,
            revision: request.body.expectedRevision,
          },
          data: {
            title: request.body.title,
            body: normalized.document as Prisma.InputJsonValue,
            text: normalized.text,
            revision: { increment: 1 },
            updatedById: actor.user.id,
          },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "Draft changed. Keep your edits and load the latest revision to compare.",
          );
        await tx.page.update({
          where: { id: pageId },
          data: { updatedAt: new Date() },
        });
        return readDraft(tx, orgId, pageId);
      });
    },
  );
  app.post(
    "/api/v1/organizations/:orgId/pages/:pageId/move",
    {
      schema: {
        params: pageParamsSchema,
        body: movePageSchema,
        response: { 200: pageSummarySchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        const { orgId, pageId } = request.params;
        await requireTenant(tx, request, orgId, "edit");
        const page = await activePage(tx, orgId, pageId);
        await tx.space.update({
          where: { id: page.spaceId },
          data: { treeRevision: { increment: 1 } },
        });
        const depth = await parentDepth(
          tx,
          orgId,
          page.spaceId,
          request.body.parentId,
          pageId,
          Boolean(page.publishedVersionId),
        );
        if (
          depth + (await subtreeHeight(tx, orgId, page.spaceId, pageId)) - 1 >
          10
        )
          throw new ApiError(
            409,
            "TREE_DEPTH",
            "Move would exceed maximum depth ten",
          );
        const changed = await tx.page.updateMany({
          where: {
            id: pageId,
            organizationId: orgId,
            revision: request.body.expectedRevision,
          },
          data: { parentId: request.body.parentId, revision: { increment: 1 } },
        });
        if (!changed.count)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "Page moved. Reload its location and retry.",
          );
        return (await readDraft(tx, orgId, pageId)).page;
      }),
  );
}
