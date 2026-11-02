import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { AuthClient, newEmail, mailToken, password } from "./auth";
export async function authenticatedUser(app: FastifyInstance) {
  const client = new AuthClient(app);
  const email = newEmail();
  expect(
    (
      await client.post("/api/v1/auth/register", {
        email,
        password,
        displayName: "Synthetic Knowledge User",
      })
    ).statusCode,
  ).toBe(202);
  expect(
    (
      await client.post("/api/v1/auth/verify-email", {
        token: await mailToken(email, "Verify your email"),
      })
    ).statusCode,
  ).toBe(200);
  const login = await client.post("/api/v1/auth/login", { email, password });
  expect(login.statusCode).toBe(200);
  return { client, email, userId: login.json().id as string };
}
