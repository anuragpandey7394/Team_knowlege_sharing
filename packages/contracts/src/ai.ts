import { z } from "zod";
export const sourceTypeSchema = z.enum(["page", "comment"]);
export const indexStatusSchema = z.enum([
  "awaiting_provider",
  "queued",
  "processing",
  "ready",
  "failed",
  "superseded",
  "excluded",
]);
export const sourceIdentitySchema = z.strictObject({
  organizationId: z.uuid(),
  sourceType: sourceTypeSchema,
  sourceId: z.uuid(),
  sourceVersionId: z.uuid(),
  generation: z.number().int().positive(),
});
export const indexSourceSchema = sourceIdentitySchema.extend({
  requestId: z.uuid(),
  pageId: z.uuid(),
  pageVersionId: z.uuid(),
  spaceId: z.uuid(),
  title: z.string().max(200),
  text: z.string().max(100000),
  author: z.string(),
  publishedAt: z.iso.datetime(),
  current: z.boolean(),
});
export const citationSchema = sourceIdentitySchema
  .extend({
    pageId: z.uuid(),
    pageVersionId: z.uuid(),
    title: z.string(),
    commentId: z.uuid().optional(),
    commentRevisionId: z.uuid().optional(),
    author: z.string().max(100).optional(),
    publishedAt: z.iso.datetime().optional(),
    locator: z
      .strictObject({
        start: z.number().int().min(0),
        end: z.number().int().min(1),
      })
      .refine((v) => v.end > v.start),
    quote: z.string().min(1).max(2000),
  })
  .superRefine((value, ctx) => {
    if (
      value.sourceType === "comment" &&
      (value.commentId !== value.sourceId ||
        value.commentRevisionId !== value.sourceVersionId ||
        !value.author ||
        !value.publishedAt)
    )
      ctx.addIssue({
        code: "custom",
        message: "Comment citations require exact revision, author and date",
      });
  });
export const retrieveSchema = z.strictObject({
  organizationId: z.uuid(),
  userId: z.uuid(),
  spaceId: z.uuid().optional(),
  query: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(20).default(5),
});
export const retrieveResultSchema = z.strictObject({
  requestId: z.uuid(),
  sources: z
    .array(
      z.strictObject({
        citation: citationSchema,
        excerpt: z.string().min(1).max(4000),
        signal: z.enum(["lexical", "semantic", "simulation"]),
        rawScore: z.number().finite().optional(),
      }),
    )
    .max(20),
  warnings: z.array(z.string().max(500)).max(20),
});
export const answerRequestSchema = z.strictObject({
  requestId: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  conversationId: z.uuid(),
  spaceId: z.uuid().optional(),
  question: z.string().min(1).max(4000),
  priorTurns: z
    .array(
      z.strictObject({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(12)
    .default([]),
});
export const answerResultSchema = z.strictObject({
  requestId: z.uuid(),
  providerMode: z.enum(["disabled", "mock"]),
  content: z.string().max(20000),
  citations: z.array(citationSchema).max(20),
  simulated: z.boolean(),
  evidenceStatus: z
    .enum(["supported", "partial", "insufficient", "conflicting"])
    .default("insufficient"),
  warnings: z.array(z.string().max(500)).max(20).default([]),
  usage: z
    .strictObject({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
  durationMs: z.number().nonnegative().optional(),
});
export const answerEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("started"), requestId: z.uuid() }),
  z.strictObject({
    type: z.literal("progress"),
    requestId: z.uuid(),
    stage: z.enum(["validating_sources", "simulating"]),
  }),
  z.strictObject({
    type: z.literal("citation"),
    requestId: z.uuid(),
    citation: citationSchema,
  }),
  z.strictObject({
    type: z.literal("delta"),
    requestId: z.uuid(),
    text: z.string(),
  }),
  z.strictObject({ type: z.literal("result"), result: answerResultSchema }),
  z.strictObject({
    type: z.literal("error"),
    requestId: z.uuid(),
    code: z.enum(["PROVIDER_DISABLED", "CANCELLED", "PROVIDER_UNAVAILABLE"]),
  }),
]);
export const indexViewSchema = z.object({
  status: indexStatusSchema,
  generation: z.number().int(),
  simulated: z.boolean(),
  safeError: z.string().nullable(),
  eligible: z.boolean(),
});
export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;
export type IndexSource = z.infer<typeof indexSourceSchema>;
export type Citation = z.infer<typeof citationSchema>;
export const indexSourceRequestSchema = sourceIdentitySchema.extend({
  userId: z.uuid(),
});
export const indexSourceParamsSchema = z.strictObject({
  orgId: z.uuid(),
  sourceType: sourceTypeSchema,
  sourceId: z.uuid(),
});
