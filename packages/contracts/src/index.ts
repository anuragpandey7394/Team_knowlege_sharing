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
