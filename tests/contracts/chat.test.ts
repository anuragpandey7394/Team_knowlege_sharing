import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  conversationInputSchema,
  messageInputSchema,
  messageSchema,
} from "../../packages/contracts/src/index";
it("keeps owner/tenant context out of browser chat inputs", () => {
  expect(conversationInputSchema.parse({})).toEqual({
    title: "New conversation",
    spaceId: null,
  });
  expect(
    conversationInputSchema.safeParse({ ownerId: randomUUID(), spaceId: null })
      .success,
  ).toBe(false);
  const request = { requestId: randomUUID(), question: "Synthetic question" };
  expect(messageInputSchema.safeParse(request).success).toBe(true);
  for (const input of [
    { ...request, organizationId: randomUUID() },
    { ...request, question: " " },
    { ...request, requestId: "retry-latest" },
    { ...request, question: "x".repeat(4001) },
  ])
    expect(messageInputSchema.safeParse(input).success).toBe(false);
});
it("requires explicit message state/provider and exact structured citations", () => {
  const message = {
    id: randomUUID(),
    requestId: randomUUID(),
    role: "ASSISTANT",
    content: "",
    state: "FAILED",
    providerMode: "disabled",
    citations: [],
    createdAt: new Date().toISOString(),
  };
  expect(messageSchema.safeParse(message).success).toBe(true);
  expect(
    messageSchema.safeParse({ ...message, providerMode: "bedrock" }).success,
  ).toBe(false);
  expect(
    messageSchema.safeParse({ ...message, citations: [{ url: "latest-page" }] })
      .success,
  ).toBe(false);
});
