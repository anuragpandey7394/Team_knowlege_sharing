import { z } from "zod";
import { citationSchema } from "./ai.js";
export const conversationParamsSchema = z.strictObject({
  orgId: z.uuid(),
  conversationId: z.uuid(),
});
export const messageRequestParamsSchema = conversationParamsSchema.extend({
  requestId: z.uuid(),
});
export const conversationInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(100).default("New conversation"),
  spaceId: z.uuid().nullable().default(null),
});
export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  spaceId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const conversationsSchema = z.object({
  providerMode: z.enum(["disabled", "mock"]),
  items: z.array(conversationSchema),
  total: z.number().int(),
});
export const messageInputSchema = z.strictObject({
  requestId: z.uuid(),
  question: z.string().trim().min(1).max(4000),
});
export const messageSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string(),
  state: z.enum(["PENDING", "COMPLETE", "FAILED", "CANCELLED"]),
  providerMode: z.enum(["disabled", "mock"]),
  citations: z.array(citationSchema),
  createdAt: z.string(),
});
export const messagesSchema = z.object({
  items: z.array(messageSchema),
  total: z.number().int(),
  providerMode: z.enum(["disabled", "mock"]),
});
