import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { createServer } from "../../apps/api/src/server";
import { createDatabase } from "../../apps/api/src/database";
import { requireTenant } from "../../apps/api/src/tenant";
import type { FastifyRequest } from "fastify";
import { createMailAdapter } from "../../apps/api/src/mail";
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
describe("real PostgreSQL API bootstrap", () => {
  it("is live and ready with no model configured", async () => {
    expect((await app.inject("/health/live")).json()).toEqual({ status: "ok" });
    expect((await app.inject("/health/ready")).statusCode).toBe(200);
  });
  it("fails readiness for an unavailable DB but remains live", async () => {
    const unavailable = new URL(harness.env.TEST_DATABASE_URL);
    unavailable.port = "1";
    const other = await createServer(
      createDatabase(unavailable.href),
      harness.env,
      false,
    );
    try {
      expect((await other.inject("/health/ready")).statusCode).toBe(503);
      expect((await other.inject("/health/live")).statusCode).toBe(200);
    } finally {
      await other.close();
    }
    expect((await app.inject("/health/ready")).statusCode).toBe(200);
  });
  it("serves generated OpenAPI with shared schemas", async () => {
    const response = await app.inject("/api/v1/openapi.json");
    expect(response.statusCode).toBe(200);
    expect(
      response.json().paths["/api/v1/organizations/{orgId}"].get.responses[
        "200"
      ],
    ).toBeDefined();
  });
  it("does not trust user or role headers and rechecks memberships", async () => {
    const first = await harness.fixture("READER");
    const second = await harness.fixture();
    const own = await app.inject({
      url: `/api/v1/organizations/${first.org.id}`,
      headers: { cookie: first.cookie },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toEqual({ id: first.org.id, name: first.org.name });
    const forged = await app.inject({
      url: `/api/v1/organizations/${second.org.id}`,
      headers: {
        cookie: first.cookie,
        "x-user-id": second.user.id,
        "x-role": "ADMIN",
      },
    });
    expect(forged.statusCode).toBe(404);
    expect(
      (
        await app.inject({
          url: `/api/v1/organizations/${first.org.id}`,
          headers: { "x-user-id": first.user.id },
        })
      ).statusCode,
    ).toBe(401);
    const request = { headers: { cookie: first.cookie } } as FastifyRequest;
    await expect(
      requireTenant(harness.db, request, first.org.id, "admin"),
    ).rejects.toMatchObject({ status: 403 });
    await harness.db.membership.delete({
      where: {
        organizationId_userId: {
          organizationId: first.org.id,
          userId: first.user.id,
        },
      },
    });
    expect(
      (
        await app.inject({
          url: `/api/v1/organizations/${first.org.id}`,
          headers: { cookie: first.cookie },
        })
      ).statusCode,
    ).toBe(404);
  });
  it("rejects malformed IDs, unknown query params and disallowed origins", async () => {
    expect(
      (await app.inject("/api/v1/organizations/not-a-uuid")).statusCode,
    ).toBe(400);
    expect(
      (await app.inject(`/api/v1/organizations/${randomUUID()}?role=ADMIN`))
        .statusCode,
    ).toBe(400);
    const response = await app.inject({
      url: "/health/live",
      headers: { origin: "https://evil.example" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "ORIGIN_REJECTED",
      requestId: expect.any(String),
    });
    expect(response.headers["x-request-id"]).toBe(response.json().requestId);
  });
  it("enforces normalized email, unique membership and tenant foreign keys in PostgreSQL", async () => {
    await expect(
      harness.db.user.create({
        data: {
          email: "Upper@Example.test",
          displayName: "Bad",
          passwordHash: "fixture",
        },
      }),
    ).rejects.toThrow();
    const f = await harness.fixture();
    await expect(
      harness.db.membership.create({
        data: { organizationId: f.org.id, userId: f.user.id, role: "ADMIN" },
      }),
    ).rejects.toThrow();
    await expect(
      harness.db.membership.create({
        data: {
          organizationId: randomUUID(),
          userId: f.user.id,
          role: "ADMIN",
        },
      }),
    ).rejects.toThrow();
  });
  it("redacts credentials and token-bearing query strings from logs", async () => {
    let logs = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    });
    const logged = await createServer(
      createDatabase(harness.env.TEST_DATABASE_URL, harness.schema),
      harness.env,
      true,
      stream,
    );
    try {
      await logged.inject({
        url: "/health/live?token=secret-query-fixture",
        headers: {
          cookie: "tka_session=secret-cookie-fixture",
          authorization: "Bearer secret-bearer-fixture",
          "x-csrf-token": "secret-csrf-fixture",
        },
      });
      expect(logs).toContain("/health/live");
      for (const secret of [
        "secret-query-fixture",
        "secret-cookie-fixture",
        "secret-bearer-fixture",
        "secret-csrf-fixture",
      ])
        expect(logs).not.toContain(secret);
    } finally {
      await logged.close();
    }
  });
  it("rejects oversized request bodies consistently", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/missing",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ text: "x".repeat(300000) }),
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      requestId: expect.any(String),
    });
  });
  it("delivers actual SMTP mail to Mailpit", async () => {
    const subject = `M01-${randomUUID()}`;
    const mail = createMailAdapter(
      harness.env.SMTP_HOST,
      harness.env.SMTP_PORT,
    );
    try {
      await mail.send(
        "synthetic@example.test",
        subject,
        "Synthetic bootstrap mail; no token.",
      );
      const inbox = (await fetch("http://127.0.0.1:8025/api/v1/messages").then(
        (r) => r.json(),
      )) as { messages: { Subject: string }[] };
      expect(
        inbox.messages.some((message) => message.Subject === subject),
      ).toBe(true);
    } finally {
      mail.close();
    }
  });
});
