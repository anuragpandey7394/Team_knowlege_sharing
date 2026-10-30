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
