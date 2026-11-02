import { z } from "zod";
export const providerModeSchema = z.enum(["disabled", "mock"]);
export type ProviderMode = z.infer<typeof providerModeSchema>;
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});
export const paginationSchema = z.strictObject({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
});
export const organizationParamsSchema = z.strictObject({ orgId: z.uuid() });
export const healthSchema = z.object({ status: z.enum(["ok", "unavailable"]) });
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));
export const passwordSchema = z.string().min(12).max(128);
export const emailInputSchema = z.strictObject({ email: emailSchema });
export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2).max(100),
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const tokenInputSchema = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const resetPasswordSchema = tokenInputSchema.extend({
  password: passwordSchema,
});
export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  verified: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const roleSchema = z.enum(["READER", "REVIEWER", "EDITOR", "ADMIN"]);
export const organizationInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
});
export const organizationSummarySchema = organizationSchema.extend({
  role: roleSchema,
});
export const organizationsSchema = z.object({
  items: z.array(organizationSummarySchema),
  total: z.number().int(),
});
export const memberParamsSchema = organizationParamsSchema.extend({
  userId: z.uuid(),
});
export const memberSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  email: z.email(),
  role: roleSchema,
});
export const membersSchema = z.object({
  items: z.array(memberSchema),
  total: z.number().int(),
});
export const roleInputSchema = z.strictObject({ role: roleSchema });
export const inviteInputSchema = z.strictObject({
  email: emailSchema,
  role: roleSchema,
});
export const inviteParamsSchema = organizationParamsSchema.extend({
  inviteId: z.uuid(),
});
export const inviteSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleSchema,
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export const invitesSchema = z.object({
  items: z.array(inviteSchema),
  total: z.number().int(),
});
export const inviteInspectionSchema = z.object({
  organizationId: z.uuid(),
  organizationName: z.string(),
  role: roleSchema,
  expiresAt: z.string(),
});
export const spaceParamsSchema = organizationParamsSchema.extend({
  spaceId: z.uuid(),
});
export const pageParamsSchema = organizationParamsSchema.extend({
  pageId: z.uuid(),
});
export const spaceInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
});
export const spaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  revision: z.number().int(),
});
export const spacesSchema = z.object({
  items: z.array(spaceSchema),
  total: z.number().int(),
});
export const treeQuerySchema = paginationSchema.extend({
  parentId: z.uuid().optional(),
});
export const pageCreateSchema = z.strictObject({
  spaceId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  title: z.string().trim().min(1).max(200),
});
export const draftInputSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  title: z.string().trim().min(1).max(200),
  body: z.unknown(),
});
export const movePageSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  parentId: z.uuid().nullable(),
});
export const pageSummarySchema = z.object({
  id: z.uuid(),
  spaceId: z.uuid(),
  parentId: z.uuid().nullable(),
  title: z.string(),
  revision: z.number().int(),
  published: z.boolean(),
});
export const treeSchema = z.object({
  items: z.array(pageSummarySchema),
  total: z.number().int(),
});
export const draftSchema = z.object({
  page: pageSummarySchema,
  title: z.string(),
  body: z.unknown(),
  text: z.string(),
  revision: z.number().int(),
  creator: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const publishInputSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.uuid(),
});
export const publicationSchema = z.object({
  pageId: z.uuid(),
  versionId: z.uuid(),
  number: z.number().int().positive(),
  draftRevision: z.number().int(),
  title: z.string(),
  publishedAt: z.string(),
});
export const versionParamsSchema = pageParamsSchema.extend({
  versionId: z.uuid(),
});
export const publishedPageSchema = z.object({
  pageId: z.uuid(),
  spaceId: z.uuid(),
  parentId: z.uuid().nullable(),
  versionId: z.uuid(),
  currentVersionId: z.uuid(),
  number: z.number().int(),
  title: z.string(),
  body: z.unknown(),
  text: z.string(),
  creator: z.string(),
  publisher: z.string(),
  createdAt: z.string(),
  publishedAt: z.string(),
  archived: z.boolean(),
  changed: z.boolean(),
  indexStatus: z.literal("awaiting-provider"),
});
export const historySchema = z.object({
  items: z.array(publicationSchema.extend({ publisher: z.string() })),
  total: z.number().int(),
});
export const archiveQuerySchema = paginationSchema.extend({
  archived: z.enum(["true", "false"]).default("false"),
});
export const revisionInputSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
});
export const restorePageSchema = revisionInputSchema.extend({
  parentId: z.uuid().nullable().optional(),
});
export const searchQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200),
  spaceId: z.uuid().optional(),
});
export const searchResultSchema = z.object({
  items: z.array(
    z.object({
      pageId: z.uuid(),
      versionId: z.uuid(),
      title: z.string(),
      snippet: z.string(),
      spaceId: z.uuid(),
    }),
  ),
  total: z.number().int(),
});

export const successSchema = z.object({ ok: z.literal(true) });
export const commentInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(5000),
});
export const commentEditSchema = commentInputSchema.extend({
  expectedRevision: z.number().int().min(1),
});
export const commentParamsSchema = pageParamsSchema.extend({
  commentId: z.uuid(),
});
export const commentRevisionParamsSchema = commentParamsSchema.extend({
  revisionId: z.uuid(),
});
export const commentSchema = z.object({
  id: z.uuid(),
  authorId: z.uuid(),
  author: z.string(),
  pageVersionId: z.uuid(),
  pageVersionNumber: z.number().int(),
  revision: z.number().int(),
  revisionId: z.uuid(),
  text: z.string().nullable(),
  tombstoned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revisionAt: z.string(),
});
export const commentsSchema = z.object({
  items: z.array(commentSchema),
  total: z.number().int(),
});
