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
    AnswerRequest: answerRequestSchema,
    AnswerEvent: answerEventSchema,
    AnswerResult: answerResultSchema,
    Citation: citationSchema,
  }))
    expect(stub.components.schemas[name]).toEqual(z.toJSONSchema(schema));
});
