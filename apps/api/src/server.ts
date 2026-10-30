import type { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import {
  errorSchema,
  healthSchema,
  organizationParamsSchema,
  organizationSchema,
} from "../../../packages/contracts/src/index.js";
import type { Environment } from "../../../packages/config/src/index.js";
import type { Database } from "./database.js";
import { ApiError } from "./errors.js";
import { getTenantOrganization } from "./tenant.js";

export async function createServer(
  db: Database,
  env: Environment,
  logger = true,
  logStream?: Writable,
) {
  const app = Fastify({
    logger: logger
      ? {
          level: "info",
          ...(logStream ? { stream: logStream } : {}),
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            'req.headers["x-csrf-token"]',
            'res.headers["set-cookie"]',
            "password",
            "token",
            "passwordHash",
          ],
          serializers: {
            req: (req) => ({
              method: req.method,
              path: req.url?.split("?")[0],
            }),
          },
        }
      : false,
    bodyLimit: 256 * 1024,
    requestTimeout: 30000,
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(swagger, {
    openapi: { info: { title: "Team Knowledge Assistant", version: "1.0.0" } },
    transform: jsonSchemaTransform,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    if (request.headers.origin && request.headers.origin !== env.WEB_ORIGIN)
      throw new ApiError(403, "ORIGIN_REJECTED", "Origin not allowed");
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError)
      return reply.code(error.status).send({
        code: error.code,
        message: error.message,
        requestId: request.id,
      });
    const status =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    if (status >= 500)
      request.log.error(
        { code: "INTERNAL_ERROR", requestId: request.id },
        "Request failed",
      );
    return reply.code(status >= 400 && status < 500 ? status : 500).send({
      code:
        status === 413
          ? "PAYLOAD_TOO_LARGE"
          : status < 500
            ? "INVALID_INPUT"
            : "INTERNAL_ERROR",
      message: status < 500 ? "Invalid request" : "Internal server error",
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      code: "NOT_FOUND",
      message: "Resource not found",
      requestId: request.id,
    }),
  );
  app.get(
    "/health/live",
    { schema: { response: { 200: healthSchema } } },
    async () => ({ status: "ok" as const }),
  );
  app.get(
    "/health/ready",
    { schema: { response: { 200: healthSchema, 503: healthSchema } } },
    async (_request, reply) => {
      try {
        await db.$queryRaw`SELECT 1`;
        return { status: "ok" as const };
      } catch {
        return reply.code(503).send({ status: "unavailable" as const });
      }
    },
  );
  app.get("/api/v1/openapi.json", async () => app.swagger());
  app.get(
    "/api/v1/organizations/:orgId",
    {
      schema: {
        params: organizationParamsSchema,
        querystring: z.strictObject({}),
        response: {
          200: organizationSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request) => getTenantOrganization(db, request, request.params.orgId),
  );
  app.addHook("onClose", async () => db.$disconnect());
  await app.ready();
  return app;
}
