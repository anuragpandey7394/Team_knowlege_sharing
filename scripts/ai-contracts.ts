import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  indexSourceSchema,
  indexSourceRequestSchema,
  retrieveSchema,
  retrieveResultSchema,
  answerRequestSchema,
  answerEventSchema,
  answerResultSchema,
  citationSchema,
} from "../packages/contracts/src/ai.js";
const schemas = Object.fromEntries(
  Object.entries({
    IndexSource: indexSourceSchema,
    IndexSourceRequest: indexSourceRequestSchema,
    Retrieve: retrieveSchema,
    RetrieveResult: retrieveResultSchema,
    AnswerRequest: answerRequestSchema,
    AnswerEvent: answerEventSchema,
    AnswerResult: answerResultSchema,
    Citation: citationSchema,
  }).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
);
writeFileSync(
  "services/ai/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "Deferred AI service contract (not implemented)",
        version: "1.0.0",
      },
      paths: {},
      components: { schemas },
    },
    null,
    2,
  ) + "\n",
);
