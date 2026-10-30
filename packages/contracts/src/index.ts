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
