import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Database } from "./database.js";
import type { Environment } from "../../../packages/config/src/index.js";
import { ApiError } from "./errors.js";
import { hashToken } from "./tenant.js";
export function cookieValue(request: FastifyRequest, name: string) {
  return request.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function cookie(
  name: string,
  value: string,
  env: Environment,
  maxAge: number,
) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function signature(nonce: string, binding: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${binding.length}!${binding}!${nonce}`)
    .digest("hex");
}
function valid(
  token: string | undefined,
  binding: string,
  secret: string,
): token is string {
  if (!token || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token)) return false;
  const [nonce, mac] = token.split(".") as [string, string];
  return timingSafeEqual(
    Buffer.from(mac, "hex"),
    Buffer.from(signature(nonce, binding, secret), "hex"),
  );
}
export async function csrfBootstrap(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  env: Environment,
) {
  let seed = cookieValue(request, "tka_csrf_seed");
  if (!seed || !/^[a-f0-9]{64}$/.test(seed))
    seed = randomBytes(32).toString("hex");
  const sessionToken = cookieValue(request, "tka_session");
  const binding = sessionToken ?? seed;
  let token = cookieValue(request, "tka_csrf");
  if (!valid(token, binding, env.CSRF_SECRET)) {
    const nonce = randomBytes(32).toString("hex");
    token = `${nonce}.${signature(nonce, binding, env.CSRF_SECRET)}`;
  }
  if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken))
    await db.session.updateMany({
      where: {
        tokenHash: hashToken(sessionToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { csrfHash: hashToken(token) },
    });
  reply.header("cache-control", "no-store");
  reply.header("set-cookie", [
    cookie("tka_csrf_seed", seed, env, 86400),
    cookie("tka_csrf", token, env, 86400),
  ]);
  return { csrfToken: token };
}
export async function requireCsrf(
  db: Database,
  request: FastifyRequest,
  env: Environment,
) {
  if (request.headers.origin !== env.WEB_ORIGIN)
    throw new ApiError(403, "ORIGIN_REJECTED", "Origin not allowed");
  const sessionToken = cookieValue(request, "tka_session");
  const seed = cookieValue(request, "tka_csrf_seed");
  const header = request.headers["x-csrf-token"];
  const binding = sessionToken ?? seed;
  if (
    !binding ||
    typeof header !== "string" ||
    !valid(header, binding, env.CSRF_SECRET) ||
    header !== cookieValue(request, "tka_csrf")
  )
    throw new ApiError(403, "CSRF_REJECTED", "Refresh this page and retry");
  if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
    });
    // Expired sessions can still submit a fresh login/reset after CSRF bootstrap.
    if (
      session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.csrfHash !== hashToken(header)
    )
      throw new ApiError(403, "CSRF_REJECTED", "Refresh this page and retry");
  }
}
