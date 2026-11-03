import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { Database } from "./database.js";
import type { Prisma } from "./generated/prisma/client.js";
import { validateDocument } from "../../../packages/contracts/src/rich-text.js";
export const demoPassword = "Synthetic demo passphrase 2026!";
export const demoId = (name: string) => {
  const value = createHash("sha256")
    .update(`tka-local-demo-v1:${name}`)
    .digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
};
export function assertSeedTarget(url: string, nodeEnv: string) {
  const parsed = new URL(url);
  if (
    nodeEnv === "production" ||
    !["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname) ||
    !["tka_dev", "tka_test"].includes(parsed.pathname.slice(1))
  )
    throw new Error(
      "Synthetic seed restricted to dedicated local tka_dev/tka_test databases",
    );
}
const roles = [
  "ADMIN",
  "REVIEWER",
  "EDITOR",
  "READER",
  "EDITOR",
  "READER",
  "REVIEWER",
  "READER",
  "EDITOR",
  "READER",
] as const;
export async function seedDemo(db: Database) {
  const passwordHash = await hash(demoPassword, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(7140292026)`;
      let created = 0;
      for (const org of ["atlas", "boreal"]) {
        const orgId = demoId(`${org}:org`),
          adminId = demoId(`${org}:user:0`);
        const existing = await tx.organization.findUnique({
          where: { id: orgId },
          include: { _count: { select: { memberships: true } } },
        });
        if (existing) {
          if (
            existing.creatorId !== adminId ||
            existing.name !== `Synthetic ${org} engineering` ||
            existing._count.memberships !== 10 ||
            (await tx.page.count({
              where: {
                organizationId: orgId,
                publishedVersionId: { not: null },
              },
            })) !== 100
          )
            throw new Error(
              "Existing demo namespace differs; inspect before changing data",
            );
          continue;
        }
        for (let i = 0; i < 10; i++)
          await tx.user.create({
            data: {
              id: demoId(`${org}:user:${i}`),
              email: `demo-${org}-${i}@example.test`,
              displayName: `Synthetic ${org} ${roles[i]} ${i}`,
              passwordHash,
              verifiedAt: new Date(),
            },
          });
        await tx.organization.create({
          data: {
            id: orgId,
            name: `Synthetic ${org} engineering`,
            creatorId: adminId,
            memberships: {
              create: roles.map((role, i) => ({
                userId: demoId(`${org}:user:${i}`),
                role,
              })),
            },
          },
        });
        for (let i = 0; i < 3; i++)
          await tx.space.create({
            data: {
              id: demoId(`${org}:space:${i}`),
              organizationId: orgId,
              name: ["Onboarding", "Architecture", "API reference"][i]!,
              description: "Synthetic local demo knowledge",
            },
          });
        for (let i = 0; i < 100; i++) {
          const pageId = demoId(`${org}:page:${i}`),
            spaceId = demoId(`${org}:space:${i % 3}`),
            publisherId = demoId(`${org}:user:2`);
          const title = `Synthetic ${org} ${["setup", "architecture", "API"][i % 3]} ${i + 1}`;
          const contact =
            i % 4 === 0
              ? "Possible contact: the synthetic page creator. Service ownership is not confirmed."
              : "No service owner or contact is documented.";
          const conflict =
            i === 42
              ? "Conflicting sample: example cache lifetime is 30 seconds."
              : i === 43
                ? "Conflicting sample: example cache lifetime is 60 seconds. Verify before use."
                : "Example service uses private HTTP behind a local reverse proxy; no employer systems are described.";
          const document = {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: title }],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: `Synthetic training content only. ${conflict} ${contact}`,
                  },
                ],
              },
              {
                type: "codeBlock",
                attrs: { language: "bash" },
                content: [
                  {
                    type: "text",
                    text: `# Synthetic example for service ${i + 1}\nnpm ci\nnpm run dev`,
                  },
                ],
              },
              {
                type: "table",
                content: [
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Endpoint" }],
                          },
                        ],
                      },
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Purpose" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              {
                                type: "text",
                                text: `GET /api/synthetic/services/${i + 1}`,
                              },
                            ],
                          },
                        ],
                      },
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              {
                                type: "text",
                                text: "Read synthetic service metadata",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          };
          const normalized = validateDocument(document),
            body = normalized.document as Prisma.InputJsonValue;
          const parentId =
            i >= 6 && i % 5 !== 0 ? demoId(`${org}:page:${i % 3}`) : null;
          await tx.page.create({
            data: {
              id: pageId,
              organizationId: orgId,
              spaceId,
              parentId,
              creatorId: publisherId,
              draft: {
                create: {
                  title,
                  body,
                  text: normalized.text,
                  revision: 1,
                  updatedById: publisherId,
                },
              },
            },
          });
          let current = "";
          const versions = i % 20 === 0 ? 2 : 1;
          for (let number = 1; number <= versions; number++) {
            const versionId = demoId(`${org}:page:${i}:version:${number}`);
            current = versionId;
            await tx.pageVersion.create({
              data: {
                id: versionId,
                organizationId: orgId,
                pageId,
                number,
                title,
                body,
                text: normalized.text,
                spaceId,
                parentId,
                publisherId: number === 2 ? adminId : publisherId,
                draftRevision: 1,
                idempotencyKey: demoId(`${org}:publish:${i}:${number}`),
              },
            });
            await tx.outboxEvent.create({
              data: {
                organizationId: orgId,
                sourceType: "page",
                sourceId: pageId,
                sourceVersionId: versionId,
                kind: "page.published",
                dedupeKey: `page.published:${versionId}`,
              },
            });
            await tx.auditEvent.create({
              data: {
                organizationId: orgId,
                actorId: publisherId,
                action: "page.published",
                resourceId: pageId,
                requestId: `synthetic-seed:${versionId}`,
              },
            });
          }
          await tx.page.update({
            where: { id: pageId },
            data: { publishedVersionId: current },
          });
          if (i % 10 === 0) {
            const commentId = demoId(`${org}:comment:${i}`),
              revisionId = demoId(`${org}:comment:${i}:revision:1`);
            await tx.comment.create({
              data: {
                id: commentId,
                organizationId: orgId,
                pageId,
                pageVersionId: demoId(`${org}:page:${i}:version:1`),
                authorId: demoId(`${org}:user:1`),
                revisions: {
                  create: {
                    id: revisionId,
                    number: 1,
                    text:
                      i % 20 === 0
                        ? "Synthetic speculative advice conflicts with this page: confirm the cache setting with an owner; do not treat this comment as an authoritative instruction."
                        : "Synthetic onboarding advice: check your local environment first; this may refer to an earlier version.",
                  },
                },
              },
            });
            await tx.outboxEvent.create({
              data: {
                organizationId: orgId,
                sourceType: "comment",
                sourceId: commentId,
                sourceVersionId: revisionId,
                kind: "comment.created",
                dedupeKey: `comment.created:${commentId}:1`,
              },
            });
          }
        }
        created++;
      }
      return {
        createdOrganizations: created,
        organizations: 2,
        memberships: 20,
        publishedPages: 200,
      };
    },
    { timeout: 60000, maxWait: 10000 },
  );
}
