import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { AuthClient, mailToken, newEmail, password } from "../helpers/auth";
import { createServer } from "../../apps/api/src/server";
import { createDatabase } from "../../apps/api/src/database";
import { hashToken } from "../../apps/api/src/tenant";
let harness: Awaited<ReturnType<typeof createTestDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
beforeAll(async () => {
  harness = await createTestDatabase();
  app = await createServer(harness.db, harness.env, false);
}, 30000);
afterAll(async () => {
  await app?.close();
  await harness?.close();
});
async function register(client: AuthClient, email = newEmail()) {
  expect(
    (
      await client.post("/api/v1/auth/register", {
        email,
        password,
        displayName: "Synthetic Person",
      })
    ).statusCode,
  ).toBe(202);
  return email;
}
async function verifiedAccount(client: AuthClient) {
  const email = await register(client);
  expect(
    (
      await client.post("/api/v1/auth/verify-email", {
        token: await mailToken(email, "Verify your email"),
      })
    ).statusCode,
  ).toBe(200);
  return email;
}
describe("real authentication and Mailpit flows", () => {
  it("normalizes registration, hashes passwords, avoids duplicate disclosure and denies unverified organization access", async () => {
    const client = new AuthClient(app);
    const mixed = newEmail().toUpperCase();
    const first = await client.post("/api/v1/auth/register", {
      email: mixed,
      password,
      displayName: "Synthetic Person",
    });
    expect(first.statusCode).toBe(202);
    const duplicate = await client.post("/api/v1/auth/register", {
      email: mixed.toLowerCase(),
      password,
      displayName: "Synthetic Person",
    });
    expect(duplicate.statusCode).toBe(202);
    expect(duplicate.json()).toEqual(first.json());
    const user = await harness.db.user.findUniqueOrThrow({
      where: { email: mixed.toLowerCase() },
    });
    expect(user.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user.passwordHash).not.toContain(password);
    const org = await harness.db.organization.create({
      data: {
        name: "Unverified fixture",
        creatorId: user.id,
        memberships: { create: { userId: user.id, role: "ADMIN" } },
      },
    });
    const login = await client.post("/api/v1/auth/login", {
      email: mixed.toLowerCase(),
      password,
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).not.toHaveProperty("passwordHash");
    expect(login.json().verified).toBe(false);
    expect(
      (await client.request(`/api/v1/organizations/${org.id}`)).statusCode,
    ).toBe(403);
    const cookie = login.headers["set-cookie"] as string;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("; Secure");
    expect(cookie).toContain("Max-Age=604800");
    const session = await harness.db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(client.cookies.get("tka_session")!) },
    });
    expect(session.tokenHash).not.toBe(client.cookies.get("tka_session"));
  });
  it("invalidates earlier verification tokens, rejects expiry/reuse and consumes once under concurrency", async () => {
    const client = new AuthClient(app);
    const email = await register(client);
    const first = await mailToken(email, "Verify your email");
    expect(
      (await client.post("/api/v1/auth/resend-verification", { email }))
        .statusCode,
    ).toBe(202);
    const second = await mailToken(email, "Verify your email", [first]);
    expect(second).not.toBe(first);
    expect(
      (await client.post("/api/v1/auth/verify-email", { token: first }))
        .statusCode,
    ).toBe(400);
    await harness.db.authToken.update({
      where: { tokenHash: hashToken(second) },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (await client.post("/api/v1/auth/verify-email", { token: second }))
        .statusCode,
    ).toBe(400);
    await client.post("/api/v1/auth/resend-verification", { email });
    const third = await mailToken(email, "Verify your email", [first, second]);
    const responses = await Promise.all([
      new AuthClient(app).post("/api/v1/auth/verify-email", { token: third }),
      new AuthClient(app).post("/api/v1/auth/verify-email", { token: third }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect(
      (await client.post("/api/v1/auth/verify-email", { token: third }))
        .statusCode,
    ).toBe(400);
  });
  it("handles wrong credentials, logout, expired sessions and fresh login", async () => {
    const client = new AuthClient(app);
    const email = await verifiedAccount(client);
    expect(
      (
        await client.post("/api/v1/auth/login", {
          email,
          password: "wrong password",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await client.post("/api/v1/auth/login", { email: newEmail(), password }))
        .statusCode,
    ).toBe(401);
    expect(
      (await client.post("/api/v1/auth/login", { email, password })).statusCode,
    ).toBe(200);
    expect((await client.request("/api/v1/auth/me")).statusCode).toBe(200);
    await harness.db.session.update({
      where: { tokenHash: hashToken(client.cookies.get("tka_session")!) },
      data: { expiresAt: new Date(0) },
    });
    expect((await client.request("/api/v1/auth/me")).statusCode).toBe(401);
    expect(
      (await client.post("/api/v1/auth/login", { email, password })).statusCode,
    ).toBe(200);
    expect((await client.post("/api/v1/auth/logout", {})).statusCode).toBe(200);
    expect((await client.request("/api/v1/auth/me")).statusCode).toBe(401);
  });
  it("keeps forgot responses generic, invalidates earlier reset tokens, enforces expiry/reuse and revokes every session", async () => {
    const client = new AuthClient(app);
    const email = await verifiedAccount(client);
    await client.post("/api/v1/auth/login", { email, password });
    const other = new AuthClient(app);
    await other.post("/api/v1/auth/login", { email, password });
    const existing = await client.post("/api/v1/auth/forgot-password", {
      email,
    });
    const missing = await client.post("/api/v1/auth/forgot-password", {
      email: newEmail(),
    });
    expect(existing.json()).toEqual(missing.json());
    expect(missing.statusCode).toBe(202);
    const first = await mailToken(email, "Reset your password");
    expect(
      (await client.post("/api/v1/auth/forgot-password", { email })).statusCode,
    ).toBe(202);
    const expired = await mailToken(email, "Reset your password", [first]);
    expect(
      (
        await client.post("/api/v1/auth/reset-password", {
          token: first,
          password,
        })
      ).statusCode,
    ).toBe(400);
    await harness.db.authToken.update({
      where: { tokenHash: hashToken(expired) },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await client.post("/api/v1/auth/reset-password", {
          token: expired,
          password,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await client.post("/api/v1/auth/forgot-password", { email })).statusCode,
    ).toBe(202);
    const final = await mailToken(email, "Reset your password", [
      first,
      expired,
    ]);
    const nextPassword = "Replacement synthetic passphrase 42";
    expect(
      (
        await client.post("/api/v1/auth/reset-password", {
          token: final,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(200);
    expect((await client.request("/api/v1/auth/me")).statusCode).toBe(401);
    expect((await other.request("/api/v1/auth/me")).statusCode).toBe(401);
    expect(
      (
        await client.post("/api/v1/auth/reset-password", {
          token: final,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await client.post("/api/v1/auth/login", { email, password })).statusCode,
    ).toBe(401);
    expect(
      (
        await client.post("/api/v1/auth/login", {
          email,
          password: nextPassword,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("rejects missing/forged CSRF, wrong origins and cross-session tokens", async () => {
    const client = new AuthClient(app);
    expect(
      (
        await client.request("/api/v1/auth/login", "POST", {
          email: newEmail(),
          password,
        })
      ).statusCode,
    ).toBe(403);
    const csrf = await client.request("/api/v1/auth/csrf");
    client.csrfToken = csrf.json().csrfToken;
    expect(
      (
        await client.request(
          "/api/v1/auth/login",
          "POST",
          { email: newEmail(), password },
          { origin: "https://evil.example" },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await client.request(
          "/api/v1/auth/login",
          "POST",
          { email: newEmail(), password },
          { "x-csrf-token": "forged" },
        )
      ).statusCode,
    ).toBe(403);
    const email = await verifiedAccount(client);
    await client.post("/api/v1/auth/login", { email, password });
    const other = new AuthClient(app);
    const unrelated = await other.request("/api/v1/auth/csrf");
    expect(
      (
        await client.request(
          "/api/v1/auth/logout",
          "POST",
          {},
          { "x-csrf-token": unrelated.json().csrfToken },
        )
      ).statusCode,
    ).toBe(403);
  });
  it("enforces rate limits across server instances", async () => {
    const env = { ...harness.env, AUTH_RATE_LIMIT: 2 };
    const first = await createServer(
      createDatabase(env.TEST_DATABASE_URL, harness.schema),
      env,
      false,
    );
    const second = await createServer(
      createDatabase(env.TEST_DATABASE_URL, harness.schema),
      env,
      false,
    );
    try {
      const email = newEmail();
      const client = new AuthClient(first);
      expect(
        (await client.post("/api/v1/auth/login", { email, password }))
          .statusCode,
      ).toBe(401);
      expect(
        (await client.post("/api/v1/auth/login", { email, password }))
          .statusCode,
      ).toBe(401);
      client.app = second;
      expect(
        (await client.post("/api/v1/auth/login", { email, password }))
          .statusCode,
      ).toBe(429);
    } finally {
      await first.close();
      await second.close();
    }
  });
  it("sets secure hosted cookies and keeps passwords/action tokens/session tokens out of logs", async () => {
    const env = {
      ...harness.env,
      NODE_ENV: "production" as const,
      WEB_ORIGIN: "https://example.test",
      CSRF_SECRET: randomBytes(32).toString("hex"),
    };
    let logs = "";
    const stream = new Writable({
      write(chunk, _encoding, done) {
        logs += chunk.toString();
        done();
      },
    });
    const logged = await createServer(
      createDatabase(env.TEST_DATABASE_URL, harness.schema),
      env,
      true,
      stream,
    );
    try {
      const client = new AuthClient(logged, env.WEB_ORIGIN);
      const email = await register(client);
      const token = await mailToken(email, "Verify your email");
      await client.post("/api/v1/auth/verify-email", { token });
      const login = await client.post("/api/v1/auth/login", {
        email,
        password,
      });
      expect(login.statusCode).toBe(200);
      expect(login.headers["set-cookie"]).toContain("; Secure");
      expect(logs).not.toContain(password);
      expect(logs).not.toContain(token);
      expect(logs).not.toContain(client.cookies.get("tka_session"));
    } finally {
      await logged.close();
    }
  });
});
