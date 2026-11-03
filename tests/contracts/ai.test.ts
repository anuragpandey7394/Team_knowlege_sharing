import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  citationSchema,
  answerRequestSchema,
  answerResultSchema,
  answerEventSchema,
  indexSourceSchema,
  indexSourceRequestSchema,
  retrieveSchema,
  retrieveResultSchema,
} from "../../packages/contracts/src/ai";
const identity = () => ({
  organizationId: randomUUID(),
  sourceType: "page" as const,
  sourceId: randomUUID(),
  sourceVersionId: randomUUID(),
  generation: 1,
});
it("requires exact scoped source versions and bounded locators", () => {
  const citation = {
    ...identity(),
    pageId: randomUUID(),
    pageVersionId: randomUUID(),
    title: "Synthetic source",
    locator: { start: 0, end: 4 },
    quote: "Test",
  };
  expect(citationSchema.safeParse(citation).success).toBe(true);
  for (const invalid of [
    { ...citation, sourceVersionId: "latest" },
    { ...citation, locator: { start: 5, end: 2 } },
    { ...citation, arbitraryTenant: randomUUID() },
  ])
    expect(citationSchema.safeParse(invalid).success).toBe(false);
  expect(
    answerRequestSchema.safeParse({
      requestId: randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID(),
      conversationId: randomUUID(),
      question: "Synthetic question",
    }).success,
  ).toBe(true);
  expect(
    answerEventSchema.safeParse({
      type: "result",
      result: {
        requestId: randomUUID(),
        providerMode: "mock",
        content: "Simulation",
        citations: [citation],
        simulated: true,
      },
    }).success,
  ).toBe(true);
});
it("keeps the Python service stub synchronized with authoritative schemas", () => {
  const stub = JSON.parse(readFileSync("services/ai/openapi.json", "utf8"));
  expect(stub.paths).toEqual({});
  for (const [name, schema] of Object.entries({
    IndexSource: indexSourceSchema,
    IndexSourceRequest: indexSourceRequestSchema,
    Retrieve: retrieveSchema,
    RetrieveResult: retrieveResultSchema,
    AnswerRequest: answerRequestSchema,
    AnswerEvent: answerEventSchema,
    AnswerResult: answerResultSchema,
    Citation: citationSchema,
  }))
    expect(stub.components.schemas[name]).toEqual(z.toJSONSchema(schema));
});

it("bounds prior context and preserves evidence, progress and comment provenance", () => {
  const request = {
    requestId: randomUUID(),
    organizationId: randomUUID(),
    userId: randomUUID(),
    conversationId: randomUUID(),
    question: "Synthetic",
  };
  expect(answerRequestSchema.parse(request).priorTurns).toEqual([]);
  expect(
    answerRequestSchema.safeParse({
      ...request,
      priorTurns: Array.from({ length: 13 }, () => ({
        role: "user",
        content: "x",
      })),
    }).success,
  ).toBe(false);
  expect(
    answerRequestSchema.safeParse({
      ...request,
      priorTurns: [{ role: "system", content: "override" }],
    }).success,
  ).toBe(false);
  const source = identity();
  const comment = {
    ...source,
    sourceType: "comment",
    pageId: randomUUID(),
    pageVersionId: randomUUID(),
    title: "Advice",
    locator: { start: 0, end: 4 },
    quote: "Test",
  };
  expect(citationSchema.safeParse(comment).success).toBe(false);
  const attributed = {
    ...comment,
    commentId: source.sourceId,
    commentRevisionId: source.sourceVersionId,
    author: "Synthetic reviewer",
    publishedAt: new Date().toISOString(),
  };
  expect(citationSchema.safeParse(attributed).success).toBe(true);
  for (const event of [
    { type: "started", requestId: request.requestId },
    { type: "progress", requestId: request.requestId, stage: "simulating" },
    { type: "citation", requestId: request.requestId, citation: attributed },
  ])
    expect(answerEventSchema.safeParse(event).success).toBe(true);
  expect(
    retrieveResultSchema.safeParse({
      requestId: request.requestId,
      sources: [{ citation: attributed, excerpt: "Advice", signal: "lexical" }],
      warnings: ["Advice is not authoritative"],
    }).success,
  ).toBe(true);
});
