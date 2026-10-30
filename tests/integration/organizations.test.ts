import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "../helpers/database";
import { AuthClient, mailToken, newEmail, password } from "../helpers/auth";
import { createServer } from "../../apps/api/src/server";
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
async function account(verified = true) {
  const client = new AuthClient(app);
  const email = newEmail();
  expect(
    (
      await client.post("/api/v1/auth/register", {
        email,
        password,
        displayName: "Org Synthetic User",
      })
    ).statusCode,
  ).toBe(202);
  if (verified) {
    expect(
      (
        await client.post("/api/v1/auth/verify-email", {
          token: await mailToken(email, "Verify your email"),
        })
      ).statusCode,
    ).toBe(200);
  }
  const login = await client.post("/api/v1/auth/login", { email, password });
  expect(login.statusCode).toBe(200);
  return { client, email, userId: login.json().id as string };
}
async function organization(
  client: AuthClient,
  name = "Synthetic Organization",
) {
  const response = await client.post("/api/v1/organizations", { name });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; name: string };
}
describe("organizations with real authenticated users", () => {
  it("atomically installs first Admin, lists only own organizations and rejects forged/unknown IDs alike", async () => {
    const owner = await account();
    const stranger = await account();
    const unverified = await account(false);
    expect(
      (
        await unverified.client.post("/api/v1/organizations", {
          name: "Forbidden unverified org",
        })
      ).statusCode,
    ).toBe(403);
    const first = await organization(owner.client, "First synthetic org");
    const second = await organization(owner.client, "Second synthetic org");
    for (const org of [first, second])
      expect(
        await harness.db.membership.count({
          where: {
            organizationId: org.id,
            userId: owner.userId,
            role: "ADMIN",
          },
        }),
      ).toBe(1);
    const list = await owner.client.request("/api/v1/organizations");
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(2);
    expect(
      list.json().items.every((org: { role: string }) => org.role === "ADMIN"),
    ).toBe(true);
    expect(
      (await stranger.client.request("/api/v1/organizations")).json().total,
    ).toBe(0);
    const inaccessible = await stranger.client.request(
      `/api/v1/organizations/${first.id}`,
      "GET",
      undefined,
      { "x-role": "ADMIN", "x-user-id": owner.userId },
    );
    const missing = await stranger.client.request(
      `/api/v1/organizations/${randomUUID()}`,
    );
    expect(inaccessible.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(inaccessible.json().code).toBe(missing.json().code);
    expect(
      (await owner.client.request("/api/v1/organizations?limit=101"))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await owner.client.post(
          `/api/v1/organizations/${first.id}`,
          { name: "Renamed org" },
          "PATCH",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await owner.client.request(`/api/v1/organizations/${first.id}`)).json()
        .name,
    ).toBe("Renamed org");
  }, 30000);
  it("invites by exact verified email, resends safely, preserves role and prevents replay/duplicate membership", async () => {
    const owner = await account();
    const invited = await account();
    const stranger = await account();
    const org = await organization(owner.client);
    const invite = await owner.client.post(
      `/api/v1/organizations/${org.id}/invitations`,
      { email: invited.email, role: "REVIEWER" },
    );
    expect(invite.statusCode).toBe(201);
    const first = await mailToken(invited.email, "Organization invitation");
    const mismatch = await stranger.client.post("/api/v1/invitations/inspect", {
      token: first,
    });
    expect(mismatch.statusCode).toBe(404);
    expect(mismatch.body).not.toContain(org.name);
    expect(
      (
        await owner.client.post(
          `/api/v1/organizations/${org.id}/invitations/${invite.json().id}/resend`,
          {},
        )
      ).statusCode,
    ).toBe(201);
    const token = await mailToken(invited.email, "Organization invitation", [
      first,
    ]);
    expect(
      (
        await invited.client.post("/api/v1/invitations/accept", {
          token: first,
        })
      ).statusCode,
    ).toBe(404);
    const inspect = await invited.client.post("/api/v1/invitations/inspect", {
      token,
    });
    expect(inspect.statusCode).toBe(200);
    expect(inspect.json().role).toBe("REVIEWER");
    const results = await Promise.all([
      invited.client.post("/api/v1/invitations/accept", { token }),
      new AuthClientWithCookies(invited.client).post(
        "/api/v1/invitations/accept",
        { token },
      ),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    expect(
      await harness.db.membership.count({
        where: { organizationId: org.id, userId: invited.userId },
      }),
    ).toBe(1);
    expect(
      (await invited.client.request(`/api/v1/organizations/${org.id}`)).json()
        .role,
    ).toBe("REVIEWER");
    const directory = await invited.client.request(
      `/api/v1/organizations/${org.id}/members`,
    );
    expect(directory.statusCode).toBe(200);
    expect(directory.body).not.toContain(token);
    expect(directory.body).not.toContain("tokenHash");
    expect(
      (
        await invited.client.request(
          `/api/v1/organizations/${org.id}/invitations`,
        )
      ).statusCode,
    ).toBe(403);
    const adminList = await owner.client.request(
      `/api/v1/organizations/${org.id}/invitations`,
    );
    expect(adminList.statusCode).toBe(200);
    expect(adminList.body).not.toContain("tokenHash");
    expect(adminList.body).not.toContain(token);
    expect(
      (
        await owner.client.post(`/api/v1/organizations/${org.id}/invitations`, {
          email: invited.email,
          role: "ADMIN",
        })
      ).statusCode,
    ).toBe(409);
  }, 30000);
  it("rejects expired/revoked tokens, cross-org invite IDs and non-admin mail actions", async () => {
    const owner = await account();
    const invited = await account();
    const org = await organization(owner.client);
    const other = await organization(owner.client, "Other scope");
    const first = await owner.client.post(
      `/api/v1/organizations/${org.id}/invitations`,
      { email: invited.email, role: "READER" },
    );
    expect(first.statusCode).toBe(201);
    const expired = await mailToken(invited.email, "Organization invitation");
    await harness.db.invitation.update({
      where: { tokenHash: hashToken(expired) },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await invited.client.post("/api/v1/invitations/accept", {
          token: expired,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await owner.client.post(
          `/api/v1/organizations/${other.id}/invitations/${first.json().id}`,
          {},
          "DELETE",
        )
      ).statusCode,
    ).toBe(404);
    const resend = await owner.client.post(
      `/api/v1/organizations/${org.id}/invitations/${first.json().id}/resend`,
      {},
    );
    expect(resend.statusCode).toBe(201);
    const token = await mailToken(invited.email, "Organization invitation", [
      expired,
    ]);
    expect(
      (
        await owner.client.post(
          `/api/v1/organizations/${org.id}/invitations/${resend.json().id}`,
          {},
          "DELETE",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await invited.client.post("/api/v1/invitations/inspect", { token }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await invited.client.post(
          `/api/v1/organizations/${org.id}/invitations`,
          { email: newEmail(), role: "ADMIN" },
        )
      ).statusCode,
    ).toBe(404);
  }, 30000);
  it("serializes concurrent last-Admin changes, isolates roles across organizations and revokes membership immediately", async () => {
    const first = await account();
    const second = await account();
    const org = await organization(first.client);
    expect(
      (
        await first.client.post(`/api/v1/organizations/${org.id}/invitations`, {
          email: second.email,
          role: "ADMIN",
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await second.client.post("/api/v1/invitations/accept", {
          token: await mailToken(second.email, "Organization invitation"),
        })
      ).statusCode,
    ).toBe(200);
    const results = await Promise.all([
      first.client.post(
        `/api/v1/organizations/${org.id}/members/${first.userId}`,
        { role: "READER" },
        "PATCH",
      ),
      second.client.post(
        `/api/v1/organizations/${org.id}/members/${second.userId}`,
        { role: "READER" },
        "PATCH",
      ),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const membership = await harness.db.membership.findFirstOrThrow({
      where: { organizationId: org.id, role: "ADMIN" },
    });
    const survivor = membership.userId === first.userId ? first : second;
    const reader = membership.userId === first.userId ? second : first;
    expect(
      (
        await survivor.client.post(
          `/api/v1/organizations/${org.id}/members/${survivor.userId}`,
          {},
          "DELETE",
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await reader.client.post(
          `/api/v1/organizations/${org.id}/members/${survivor.userId}`,
          { role: "READER" },
          "PATCH",
        )
      ).statusCode,
    ).toBe(403);
    const independent = await organization(reader.client, "Independent role");
    const roles = (await reader.client.request("/api/v1/organizations")).json()
      .items as { id: string; role: string }[];
    expect(roles.find((item) => item.id === org.id)?.role).toBe("READER");
    expect(roles.find((item) => item.id === independent.id)?.role).toBe(
      "ADMIN",
    );
    expect(
      (
        await survivor.client.post(
          `/api/v1/organizations/${org.id}/members/${reader.userId}`,
          {},
          "DELETE",
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await reader.client.request(`/api/v1/organizations/${org.id}`))
        .statusCode,
    ).toBe(404);
    expect(
      (await reader.client.request(`/api/v1/organizations/${independent.id}`))
        .statusCode,
    ).toBe(200);
  }, 30000);
});
class AuthClientWithCookies extends AuthClient {
  constructor(source: AuthClient) {
    super(source.app, source.origin);
    this.cookies = new Map(source.cookies);
    this.ip = source.ip;
  }
}
