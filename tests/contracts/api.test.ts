import { describe, expect, it } from "vitest";
import {
  paginationSchema,
  errorSchema,
  organizationSchema,
} from "../../packages/contracts/src/index";
describe("public API schemas", () => {
  it("bounds pagination and rejects unknown input", () => {
    expect(paginationSchema.parse({})).toEqual({ offset: 0, limit: 20 });
    for (const input of [
      { limit: 101 },
      { offset: -1 },
      { limit: "bad" },
      { role: "ADMIN" },
    ])
      expect(paginationSchema.safeParse(input).success).toBe(false);
  });
  it("requires request IDs in errors and a valid organization identity", () => {
    expect(
      errorSchema.safeParse({ code: "BAD", message: "Invalid" }).success,
    ).toBe(false);
    expect(
      organizationSchema.safeParse({ id: "fake", name: "Bad" }).success,
    ).toBe(false);
  });
});
