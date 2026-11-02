import type { z } from "zod";
import {
  answerRequestSchema,
  citationSchema,
  answerEventSchema,
  type Citation,
} from "../../../packages/contracts/src/ai.js";
import type { Environment } from "../../../packages/config/src/index.js";
import type { Database } from "./database.js";
import { sourceSnapshot } from "./jobs.js";
export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export type AnswerEvent = z.infer<typeof answerEventSchema>;
export async function* answer(
  db: Database,
  env: Environment,
  input: AnswerRequest,
  signal: AbortSignal,
  fixtures: Citation[] = [],
): AsyncGenerator<AnswerEvent> {
  const request = answerRequestSchema.parse(input);
  if (signal.aborted) {
    yield { type: "error", requestId: request.requestId, code: "CANCELLED" };
    return;
  }
  if (env.AI_PROVIDER === "disabled") {
    yield {
      type: "error",
      requestId: request.requestId,
      code: "PROVIDER_DISABLED",
    };
    return;
  }
  if (env.NODE_ENV === "production")
    throw new Error("Mock AI forbidden in hosted production");
  const member = await db.membership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: request.organizationId,
        userId: request.userId,
      },
    },
    include: { user: true },
  });
  if (!member?.user.verifiedAt) throw new Error("Mock scope unavailable");
  for (const fixture of fixtures) {
    const citation = citationSchema.parse(fixture);
    const source = await sourceSnapshot(db, citation);
    if (
      citation.organizationId !== request.organizationId ||
      citation.generation !== env.INDEX_GENERATION ||
      !source?.current ||
      source.pageId !== citation.pageId ||
      source.pageVersionId !== citation.pageVersionId ||
      (request.spaceId && request.spaceId !== source.spaceId) ||
      citation.locator.end > source.text.length ||
      source.text.slice(citation.locator.start, citation.locator.end) !==
        citation.quote
    )
      throw new Error("Invalid mock citation scope");
  }
  const content =
    "Simulation only: AI is not connected. This deterministic response tests chat plumbing and makes no factual claim about your knowledge.";
  for (const text of [content.slice(0, 60), content.slice(60)]) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 500);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      }
      signal.addEventListener("abort", done, { once: true });
      if (signal.aborted) done();
    });
    if (signal.aborted) {
      yield { type: "error", requestId: request.requestId, code: "CANCELLED" };
      return;
    }
    yield { type: "delta", requestId: request.requestId, text };
  }
  yield {
    type: "result",
    result: {
      requestId: request.requestId,
      providerMode: "mock",
      content,
      citations: fixtures,
      simulated: true,
    },
  };
}
