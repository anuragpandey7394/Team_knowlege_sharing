import { registerSchema } from "../../packages/contracts/src/index";
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

it("normalizes identity and rejects malformed authentication input", () => {
  const base = {
    email: "  USER@Example.test  ",
    displayName: "  Example User  ",
    password: "A synthetic passphrase 42",
  };
  expect(registerSchema.parse(base)).toMatchObject({
    email: "user@example.test",
    displayName: "Example User",
  });
  for (const input of [
    { ...base, password: "short" },
    { ...base, password: "x".repeat(129) },
    { ...base, displayName: " " },
    { ...base, role: "ADMIN" },
  ])
    expect(registerSchema.safeParse(input).success).toBe(false);
});
