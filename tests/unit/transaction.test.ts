import { expect, it } from "vitest";
import { isSerializationConflict } from "../../apps/api/src/transaction";
it("recognizes the observed raw adapter serialization conflict without treating ordinary errors as retryable", () => {
  const commit = new Error("commit rejected", {
    cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
  });
  commit.name = "DriverAdapterError";
  expect(isSerializationConflict(commit)).toBe(true);
  const wrapped = Object.assign(new Error("wrapped conflict"), {
    code: "P2034",
  });
  expect(isSerializationConflict(wrapped)).toBe(true);
  expect(isSerializationConflict(new Error("40001"))).toBe(false);
  expect(
    isSerializationConflict(
      Object.assign(new Error("duplicate"), { code: "P2002" }),
    ),
  ).toBe(false);
  expect(
    isSerializationConflict(
      new Error("adapter connection failure", {
        cause: { kind: "ConnectionClosed" },
      }),
    ),
  ).toBe(false);
});
