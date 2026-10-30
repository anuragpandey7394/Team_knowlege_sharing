import { rateLimit } from "./rate-limit.js";
import { randomBytes } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import {
  authUserSchema,
  registerSchema,
  loginSchema,
  emailInputSchema,
  resetPasswordSchema,
  tokenInputSchema,
  errorSchema,
} from "../../../packages/contracts/src/index.js";
import { ApiError } from "./errors.js";
import { hashToken, requireActor } from "./tenant.js";
import { cookie, csrfBootstrap } from "./csrf.js";
import { createMailAdapter } from "./mail.js";
import { transaction } from "./transaction.js";

const publicUser = (user: {
  id: string;
  email: string;
  displayName: string;
  verifiedAt: Date | null;
}) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  verified: user.verifiedAt !== null,
});
const accepted = {
  message:
    "If this request is eligible, an email will arrive with the next step.",
};
const acceptedSchema = z.object({ message: z.string() });
const responses = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  429: errorSchema,
};
export async function registerAuth(
  appInstance: FastifyInstance,
  db: Database,
  env: Environment,
) {
  const passwordOptions = {
    algorithm: Algorithm.Argon2id,
    memoryCost: env.ARGON2_MEMORY_KIB,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: 1,
    outputLen: 32,
  };
  const app = appInstance.withTypeProvider<ZodTypeProvider>();
  const mail = createMailAdapter(env.SMTP_HOST, env.SMTP_PORT);
  app.addHook("onClose", async () => mail.close());
  const dummyHash = await hash(
    "synthetic-password-timing-equalizer",
    passwordOptions,
  );
  async function rate(
    kind: string,
    ip: string,
    identity: string,
    maximum: number,
  ) {
    await rateLimit(db, env, kind, ip, identity, maximum);
  }
  async function issue(
    userId: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    email: string,
  ) {
    const raw = randomBytes(32).toString("hex");
    const now = new Date();
    await transaction(db, async (tx) => {
      // A real user row write serializes issue/consume races for the same account.
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.user.update({
        where: { id: userId },
        data: { displayName: user.displayName },
      });
      await tx.authToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.authToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(raw),
          expiresAt: new Date(
            now.getTime() +
              (purpose === "VERIFY_EMAIL"
                ? env.AUTH_VERIFY_HOURS * 3600000
                : env.AUTH_RESET_MINUTES * 60000),
          ),
        },
      });
    });
    const route =
      purpose === "VERIFY_EMAIL" ? "/verify-email" : "/reset-password";
    // Fragment avoids sending action tokens in request URLs or referrers.
    try {
      await mail.send(
        email,
        purpose === "VERIFY_EMAIL"
          ? "Verify your email"
          : "Reset your password",
        `${env.WEB_ORIGIN}${route}#token=${raw}\nThis link expires and can be used once.`,
      );
    } catch {
      app.log.error(
        { code: "MAIL_DELIVERY_FAILED" },
        "Local mail delivery failed; request can be retried",
      );
    }
  }
  app.get(
    "/api/v1/auth/csrf",
    { schema: { response: { 200: z.object({ csrfToken: z.string() }) } } },
    (request, reply) => csrfBootstrap(db, request, reply, env),
  );
  app.post(
    "/api/v1/auth/register",
    {
      schema: {
        body: registerSchema,
        response: { 202: acceptedSchema, ...responses },
      },
    },
    async (request, reply) => {
      const { email, password, displayName } = request.body;
      await rate("register", request.ip, email, env.AUTH_MAIL_LIMIT);
      const passwordHash = await hash(password, passwordOptions);
      let user;
      try {
        user = await db.user.create({
          data: { email, displayName, passwordHash },
        });
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "P2002"
        ))
          throw error;
      }
      if (user) await issue(user.id, "VERIFY_EMAIL", email);
      return reply.code(202).send(accepted);
    },
  );
  for (const [route, purpose] of [
    ["resend-verification", "VERIFY_EMAIL"],
    ["forgot-password", "RESET_PASSWORD"],
  ] as const) {
    app.post(
      `/api/v1/auth/${route}`,
      {
        schema: {
          body: emailInputSchema,
          response: { 202: acceptedSchema, ...responses },
        },
      },
      async (request, reply) => {
        await rate(route, request.ip, request.body.email, env.AUTH_MAIL_LIMIT);
        const user = await db.user.findUnique({
          where: { email: request.body.email },
        });
        if (user && (purpose === "RESET_PASSWORD" || !user.verifiedAt))
          await issue(user.id, purpose, user.email);
        return reply.code(202).send(accepted);
      },
    );
  }
  app.post(
    "/api/v1/auth/verify-email",
    {
      schema: {
        body: tokenInputSchema,
        response: { 200: acceptedSchema, ...responses },
      },
    },
    async (request) => {
      await rate("verify", request.ip, request.ip, 30);
      await transaction(db, async (tx) => {
        const token = await tx.authToken.findUnique({
          where: { tokenHash: hashToken(request.body.token) },
        });
        if (!token || token.purpose !== "VERIFY_EMAIL")
          throw new ApiError(
            400,
            "TOKEN_INVALID",
            "This link is invalid or expired",
          );
        const consumed = await tx.authToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (!consumed.count)
          throw new ApiError(
            400,
            "TOKEN_INVALID",
            "This link is invalid or expired",
          );
        await tx.user.update({
          where: { id: token.userId },
          data: { verifiedAt: new Date() },
        });
      });
      return { message: "Email verified. You can sign in." };
    },
  );
  app.post(
    "/api/v1/auth/login",
    {
      schema: {
        body: loginSchema,
        response: { 200: authUserSchema, ...responses },
      },
    },
    async (request, reply) => {
      await rate("login", request.ip, request.body.email, env.AUTH_RATE_LIMIT);
      const user = await db.user.findUnique({
        where: { email: request.body.email },
      });
      const correct = await verify(
        user?.passwordHash ?? dummyHash,
        request.body.password,
      ).catch(() => false);
      if (!user || !correct)
        throw new ApiError(
          401,
          "INVALID_CREDENTIALS",
          "Email or password is incorrect",
        );
      const token = randomBytes(32).toString("hex");
      await db.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          csrfHash: hashToken(randomBytes(32).toString("hex")),
          expiresAt: new Date(Date.now() + env.AUTH_SESSION_DAYS * 86400000),
        },
      });
      reply.header(
        "set-cookie",
        cookie("tka_session", token, env, env.AUTH_SESSION_DAYS * 86400),
      );
      return publicUser(user);
    },
  );
  app.get(
    "/api/v1/auth/me",
    { schema: { response: { 200: authUserSchema, ...responses } } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return publicUser((await requireActor(db, request)).user);
    },
  );
  app.post(
    "/api/v1/auth/logout",
    {
      schema: {
        body: z.strictObject({}),
        response: { 200: acceptedSchema, ...responses },
      },
    },
    async (request, reply) => {
      const actor = await requireActor(db, request);
      await db.session.update({
        where: { id: actor.session.id },
        data: { revokedAt: new Date() },
      });
      reply.header("set-cookie", cookie("tka_session", "", env, 0));
      return { message: "Signed out." };
    },
  );
  app.post(
    "/api/v1/auth/reset-password",
    {
      schema: {
        body: resetPasswordSchema,
        response: { 200: acceptedSchema, ...responses },
      },
    },
    async (request) => {
      await rate("reset", request.ip, request.ip, 30);
      const passwordHash = await hash(request.body.password, passwordOptions);
      await transaction(db, async (tx) => {
        const token = await tx.authToken.findUnique({
          where: { tokenHash: hashToken(request.body.token) },
        });
        if (!token || token.purpose !== "RESET_PASSWORD")
          throw new ApiError(
            400,
            "TOKEN_INVALID",
            "This link is invalid or expired",
          );
        const consumed = await tx.authToken.updateMany({
          where: {
            id: token.id,
            consumedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { consumedAt: new Date() },
        });
        if (!consumed.count)
          throw new ApiError(
            400,
            "TOKEN_INVALID",
            "This link is invalid or expired",
          );
        await tx.user.update({
          where: { id: token.userId },
          data: { passwordHash },
        });
        await tx.authToken.updateMany({
          where: {
            userId: token.userId,
            purpose: "RESET_PASSWORD",
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
        await tx.session.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
      return { message: "Password reset. Sign in with your new password." };
    },
  );
}
