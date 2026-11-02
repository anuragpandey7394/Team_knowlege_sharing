import { z } from "zod";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import {
  indexSourceRequestSchema,
  indexSourceSchema,
  indexSourceParamsSchema,
  indexViewSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import { indexView, sourceSnapshot } from "./jobs.js";
import { requireTenant } from "./tenant.js";
import { transaction } from "./transaction.js";
import { ApiError } from "./errors.js";
export async function currentSource(
  db: Pick<Database, "page" | "comment">,
  organizationId: string,
  sourceType: "page" | "comment",
  sourceId: string,
  generation = 1,
) {
  if (sourceType === "page") {
    const page = await db.page.findFirst({
      where: { organizationId, id: sourceId },
    });
    if (!page?.publishedVersionId)
      throw new ApiError(404, "NOT_FOUND", "Published source not found");
    return {
      organizationId,
      sourceType,
      sourceId,
      sourceVersionId: page.publishedVersionId,
      generation,
    };
  }
  const comment = await db.comment.findFirst({
    where: { organizationId, id: sourceId },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } },
  });
  if (!comment?.revisions[0])
    throw new ApiError(404, "NOT_FOUND", "Comment source not found");
  return {
    organizationId,
    sourceType,
    sourceId,
    sourceVersionId: comment.revisions[0].id,
    generation,
  };
}
export async function registerIndexRoutes(
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
    503: errorSchema,
  };
  const base = "/api/v1/organizations/:orgId/index/:sourceType/:sourceId";
  app.get(
    base,
    {
      schema: {
        params: indexSourceParamsSchema,
        response: { 200: indexViewSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, sourceType, sourceId } = request.params;
      await requireTenant(db, request, orgId);
      return indexView(
        db,
        await currentSource(
          db,
          orgId,
          sourceType,
          sourceId,
          env.INDEX_GENERATION,
        ),
      );
    },
  );
  app.post(
    `${base}/retry`,
    {
      schema: {
        params: indexSourceParamsSchema,
        body: z.strictObject({}),
        response: { 200: indexViewSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        const { orgId, sourceType, sourceId } = request.params;
        await requireTenant(tx, request, orgId, "edit");
        const source = await currentSource(
          tx,
          orgId,
          sourceType,
          sourceId,
          env.INDEX_GENERATION,
        );
        const snapshot = await sourceSnapshot(tx, source);
        if (!snapshot?.current)
          throw new ApiError(
            409,
            "SOURCE_EXCLUDED",
            "Archived, removed or superseded source cannot be retried",
          );
        await tx.outboxEvent.create({
          data: {
            organizationId: orgId,
            sourceType,
            sourceId,
            sourceVersionId: source.sourceVersionId,
            kind: "index.retry",
            dedupeKey: `index.retry:${randomUUID()}`,
          },
        });
        return {
          status: "awaiting_provider" as const,
          generation: env.INDEX_GENERATION,
          simulated: false,
          safeError: null,
          eligible: false,
        };
      }),
  );
  app.post(
    "/internal/v1/index-source",
    {
      schema: {
        body: indexSourceRequestSchema,
        response: { 200: indexSourceSchema, ...errors },
      },
    },
    async (request) => {
      const configured = env.AI_SERVICE_TOKEN;
      const header = request.headers.authorization;
      const hash = (value: string) =>
        createHash("sha256").update(value).digest();
      if (
        request.headers.cookie ||
        !configured ||
        !header?.startsWith("Bearer ") ||
        !timingSafeEqual(hash(header.slice(7)), hash(configured))
      )
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Service authentication required",
        );
      const { userId, ...source } = request.body;
      if (source.generation !== env.INDEX_GENERATION)
        throw new ApiError(
          409,
          "STALE_GENERATION",
          "Source generation changed",
        );
      const member = await db.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: source.organizationId,
            userId,
          },
        },
        include: { user: true },
      });
      if (!member?.user.verifiedAt)
        throw new ApiError(404, "NOT_FOUND", "Source not found");
      const snapshot = await sourceSnapshot(db, source);
      if (!snapshot?.current)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Current eligible source not found",
        );
      return snapshot;
    },
  );
}
