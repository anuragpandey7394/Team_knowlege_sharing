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
  pageId: z.uuid(),
  pageVersionId: z.uuid(),
  spaceId: z.uuid(),
  title: z.string().max(200),
  text: z.string().max(100000),
  author: z.string(),
  publishedAt: z.iso.datetime(),
  current: z.boolean(),
});
export const citationSchema = sourceIdentitySchema.extend({
  pageId: z.uuid(),
  pageVersionId: z.uuid(),
  title: z.string(),
  locator: z
    .strictObject({
      start: z.number().int().min(0),
      end: z.number().int().min(1),
    })
    .refine((v) => v.end > v.start),
  quote: z.string().min(1).max(2000),
});
export const retrieveSchema = z.strictObject({
  organizationId: z.uuid(),
  userId: z.uuid(),
  spaceId: z.uuid().optional(),
  query: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(20).default(5),
});
export const answerRequestSchema = z.strictObject({
  requestId: z.uuid(),
  organizationId: z.uuid(),
  userId: z.uuid(),
  conversationId: z.uuid(),
  spaceId: z.uuid().optional(),
  question: z.string().min(1).max(4000),
});
export const answerResultSchema = z.strictObject({
  requestId: z.uuid(),
  providerMode: z.enum(["disabled", "mock"]),
  content: z.string().max(20000),
  citations: z.array(citationSchema).max(20),
  simulated: z.boolean(),
});
export const answerEventSchema = z.discriminatedUnion("type", [
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
