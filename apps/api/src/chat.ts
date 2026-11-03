import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import { z } from "zod";
import {
  conversationParamsSchema,
  messageRequestParamsSchema,
  conversationInputSchema,
  conversationSchema,
  conversationsSchema,
  messageInputSchema,
  messageSchema,
  messagesSchema,
  paginationSchema,
  organizationParamsSchema,
  successSchema,
  errorSchema,
  answerEventSchema,
  answerResultSchema,
  type Citation,
} from "../../../packages/contracts/src/index.js";
import { requireTenant } from "./tenant.js";
import { activeSpace } from "./knowledge.js";
import { ApiError } from "./errors.js";
import { transaction } from "./transaction.js";
import { answer } from "./providers.js";
import { sourceSnapshot } from "./jobs.js";
import type { Prisma } from "./generated/prisma/client.js";
async function owned(
  db: Pick<
    Database,
    "session" | "membership" | "organization" | "conversation"
  >,
  request: FastifyRequest,
  orgId: string,
  conversationId: string,
) {
  const actor = await requireTenant(db, request, orgId);
  const conversation = await db.conversation.findFirst({
    where: {
      organizationId: orgId,
      id: conversationId,
      ownerId: actor.user.id,
    },
  });
  if (!conversation)
    throw new ApiError(404, "NOT_FOUND", "Conversation not found");
  return { actor, conversation };
}
const conversationDto = (c: {
  id: string;
  title: string;
  spaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: c.id,
  title: c.title,
  spaceId: c.spaceId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});
export async function registerChat(
  instance: FastifyInstance,
  db: Database,
  env: Environment,
) {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = "/api/v1/organizations/:orgId/conversations";
  const errors = {
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    404: errorSchema,
    409: errorSchema,
    503: errorSchema,
  };
  app.get(
    base,
    {
      schema: {
        params: organizationParamsSchema,
        querystring: paginationSchema,
        response: { 200: conversationsSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId } = request.params;
      const actor = await requireTenant(db, request, orgId);
      const where = { organizationId: orgId, ownerId: actor.user.id };
      const [rows, total] = await db.$transaction([
        db.conversation.findMany({
          where,
          orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
          take: request.query.limit,
          skip: request.query.offset,
        }),
        db.conversation.count({ where }),
      ]);
      return {
        items: rows.map(conversationDto),
        total,
        providerMode: env.AI_PROVIDER,
      };
    },
  );
  app.post(
    base,
    {
      schema: {
        params: organizationParamsSchema,
        body: conversationInputSchema,
        response: { 201: conversationSchema, ...errors },
      },
    },
    async (request, reply) => {
      const row = await transaction(db, async (tx) => {
        const { orgId } = request.params;
        const actor = await requireTenant(tx, request, orgId);
        if (request.body.spaceId)
          await activeSpace(tx, orgId, request.body.spaceId);
        return tx.conversation.create({
          data: {
            organizationId: orgId,
            ownerId: actor.user.id,
            ...request.body,
          },
        });
      });
      return reply.code(201).send(conversationDto(row));
    },
  );
  app.get(
    `${base}/:conversationId`,
    {
      schema: {
        params: conversationParamsSchema,
        response: { 200: conversationSchema, ...errors },
      },
    },
    async (request) =>
      conversationDto(
        (
          await owned(
            db,
            request,
            request.params.orgId,
            request.params.conversationId,
          )
        ).conversation,
      ),
  );
  app.delete(
    `${base}/:conversationId`,
    {
      schema: {
        params: conversationParamsSchema,
        body: z.strictObject({}),
        response: { 200: successSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        await owned(
          tx,
          request,
          request.params.orgId,
          request.params.conversationId,
        );
        await tx.conversation.delete({
          where: { id: request.params.conversationId },
        });
        return { ok: true as const };
      }),
  );
  app.get(
    `${base}/:conversationId/messages`,
    {
      schema: {
        params: conversationParamsSchema,
        querystring: paginationSchema,
        response: { 200: messagesSchema, ...errors },
      },
    },
    async (request) => {
      const { orgId, conversationId } = request.params;
      await owned(db, request, orgId, conversationId);
      const where = { organizationId: orgId, conversationId };
      const [rows, total] = await db.$transaction([
        db.message.findMany({
          where,
          orderBy: [{ createdAt: "asc" }, { role: "desc" }, { id: "asc" }],
          take: request.query.limit,
          skip: request.query.offset,
        }),
        db.message.count({ where }),
      ]);
      return {
        items: rows.map((m) =>
          messageSchema.parse({ ...m, createdAt: m.createdAt.toISOString() }),
        ),
        total,
        providerMode: env.AI_PROVIDER,
      };
    },
  );
  app.post(
    `${base}/:conversationId/requests/:requestId/cancel`,
    {
      schema: {
        params: messageRequestParamsSchema,
        body: z.strictObject({}),
        response: { 200: successSchema, ...errors },
      },
    },
    async (request) =>
      transaction(db, async (tx) => {
        const { orgId, conversationId, requestId } = request.params;
        await owned(tx, request, orgId, conversationId);
        const message = await tx.message.findFirst({
          where: {
            organizationId: orgId,
            conversationId,
            requestId,
            role: "ASSISTANT",
          },
        });
        if (!message)
          throw new ApiError(404, "NOT_FOUND", "Message request not found");
        await tx.message.updateMany({
          where: { id: message.id, state: "PENDING" },
          data: { state: "CANCELLED" },
        });
        return { ok: true as const };
      }),
  );
  app.post(
    `${base}/:conversationId/messages`,
    {
      schema: {
        params: conversationParamsSchema,
        body: messageInputSchema,
        response: {
          200: z.string().meta({
            description:
              "SSE AnswerEvent stream; errors before streaming use JSON",
            content: {
              "text/event-stream": {
                schema: {
                  type: "string",
                  description:
                    "data: JSON AnswerEvent records separated by blank lines",
                },
              },
            },
          }),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      const { orgId, conversationId } = request.params;
      const { requestId, question } = request.body;
      const prepared = await transaction(db, async (tx) => {
        const { actor, conversation } = await owned(
          tx,
          request,
          orgId,
          conversationId,
        );
        if (conversation.spaceId)
          await activeSpace(tx, orgId, conversation.spaceId);
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        const where = { organizationId: orgId, conversationId, requestId };
        const previous = await tx.message.findFirst({
          where: { ...where, role: "USER" },
        });
        if (previous && previous.content !== question)
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Request key belongs to a different question",
          );
        const assistant = await tx.message.findFirst({
          where: { ...where, role: "ASSISTANT" },
        });
        if (assistant?.state === "COMPLETE")
          return { actor, conversation, assistant, replay: true };
        if (
          assistant?.state === "PENDING" &&
          assistant.updatedAt.getTime() > Date.now() - 60000
        )
          throw new ApiError(
            409,
            "REQUEST_PENDING",
            "This request is still pending; cancel or wait before retrying",
          );
        const pending = await tx.message.count({
          where: {
            organizationId: orgId,
            conversationId,
            role: "ASSISTANT",
            state: "PENDING",
            requestId: { not: requestId },
            updatedAt: { gt: new Date(Date.now() - 60000) },
          },
        });
        if (pending)
          throw new ApiError(
            409,
            "REQUEST_PENDING",
            "Finish or cancel the pending request first",
          );
        if (!previous)
          await tx.message.create({
            data: {
              ...where,
              role: "USER",
              content: question,
              state: "COMPLETE",
              providerMode: env.AI_PROVIDER,
            },
          });
        const data = {
          content: "",
          attemptToken: randomUUID(),
          state: env.AI_PROVIDER === "disabled" ? "FAILED" : "PENDING",
          providerMode: env.AI_PROVIDER,
          citations: [],
        };
        const next = assistant
          ? await tx.message.update({ where: { id: assistant.id }, data })
          : await tx.message.create({
              data: { ...where, ...data, role: "ASSISTANT" },
            });
        return { actor, conversation, assistant: next, replay: false };
      });
      if (!prepared.replay && env.AI_PROVIDER === "disabled")
        throw new ApiError(
          503,
          "PROVIDER_DISABLED",
          "AI is not connected. Your question is saved; no model was called.",
        );
      const controller = new AbortController();
      let finished = false;
      reply.hijack();
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined)
          reply.raw.setHeader(
            name,
            Array.isArray(value) ? value.map(String) : String(value),
          );
      }
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-request-id": request.id,
        "x-content-type-options": "nosniff",
      });
      reply.raw.flushHeaders();
      const close = () => {
        if (!finished) controller.abort();
      };
      reply.raw.on("close", close);
      const send = (event: z.infer<typeof answerEventSchema>) => {
        if (!controller.signal.aborted)
          reply.raw.write(
            `data: ${JSON.stringify(answerEventSchema.parse(event))}\n\n`,
          );
      };
      try {
        if (prepared.replay) {
          send({
            type: "result",
            result: answerResultSchema.parse({
              requestId,
              providerMode: prepared.assistant.providerMode,
              content: prepared.assistant.content,
              citations: prepared.assistant.citations,
              simulated: prepared.assistant.providerMode === "mock",
            }),
          });
          finished = true;
          reply.raw.end();
          return;
        }
        send({ type: "delta", requestId, text: "" });
        const fixtures: Citation[] = [];
        const page = await db.page.findFirst({
          where: {
            organizationId: orgId,
            archivedAt: null,
            space: { archivedAt: null },
            publishedVersionId: { not: null },
            ...(prepared.conversation.spaceId
              ? { spaceId: prepared.conversation.spaceId }
              : {}),
          },
          orderBy: { id: "asc" },
          include: { publishedVersion: true },
        });
        if (page?.publishedVersion?.text.trim()) {
          const v = page.publishedVersion;
          const quote = v.text.slice(0, Math.min(200, v.text.length));
          fixtures.push({
            organizationId: orgId,
            sourceType: "page",
            sourceId: page.id,
            sourceVersionId: v.id,
            generation: env.INDEX_GENERATION,
            pageId: page.id,
            pageVersionId: v.id,
            title: v.title,
            locator: { start: 0, end: quote.length },
            quote,
          });
        }
        const history = await db.message.findMany({
          where: {
            organizationId: orgId,
            conversationId,
            conversation: { ownerId: prepared.actor.user.id },
            state: "COMPLETE",
            requestId: { not: requestId },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
        });
        const priorTurns = history
          .reverse()
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content.slice(0, 4000),
          }));
        for await (const event of answer(
          db,
          env,
          {
            requestId,
            organizationId: orgId,
            userId: prepared.actor.user.id,
            conversationId,
            ...(prepared.conversation.spaceId
              ? { spaceId: prepared.conversation.spaceId }
              : {}),
            question,
            priorTurns,
          },
          controller.signal,
          fixtures,
        )) {
          await owned(db, request, orgId, conversationId);
          const active = await db.message.findUnique({
            where: { id: prepared.assistant.id },
          });
          if (
            active?.state !== "PENDING" ||
            active.attemptToken !== prepared.assistant.attemptToken ||
            controller.signal.aborted
          ) {
            controller.abort();
            break;
          }
          if (
            event.type === "citation" &&
            !(await sourceSnapshot(db, event.citation))?.current
          )
            throw new ApiError(
              409,
              "SOURCE_CHANGED",
              "Source changed during simulation",
            );
          if (event.type === "result") {
            const saved = await transaction(db, async (tx) => {
              await owned(tx, request, orgId, conversationId);
              for (const citation of event.result.citations) {
                if (!(await sourceSnapshot(tx, citation))?.current)
                  throw new ApiError(
                    409,
                    "SOURCE_CHANGED",
                    "Source changed during simulation",
                  );
              }
              return tx.message.updateMany({
                where: {
                  id: prepared.assistant.id,
                  state: "PENDING",
                  attemptToken: prepared.assistant.attemptToken,
                },
                data: {
                  state: "COMPLETE",
                  content: event.result.content,
                  citations: event.result.citations as Prisma.InputJsonValue,
                },
              });
            });
            if (!saved.count) {
              controller.abort();
              break;
            }
            finished = true;
          }
          send(event);
        }
      } catch {
        if (!controller.signal.aborted)
          send({ type: "error", requestId, code: "PROVIDER_UNAVAILABLE" });
      } finally {
        reply.raw.off("close", close);
        if (!finished)
          await db.message
            .updateMany({
              where: {
                id: prepared.assistant.id,
                state: "PENDING",
                attemptToken: prepared.assistant.attemptToken,
              },
              data: {
                state: controller.signal.aborted ? "CANCELLED" : "FAILED",
                content: "",
              },
            })
            .catch(() =>
              request.log.warn(
                { code: "CHAT_FINALIZE_FAILED" },
                "Chat finalization failed",
              ),
            );
        finished = true;
        reply.raw.end();
      }
    },
  );
}
