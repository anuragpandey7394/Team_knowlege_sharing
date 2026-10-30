import { describe, it, expect } from "vitest";
import { can, capabilities } from "../../apps/api/src/policy";
import { assertSafeTestDatabase } from "../helpers/database";
describe("capability policy", () => {
  const matrix = {
    READER: [true, false, false, false],
    REVIEWER: [true, true, false, false],
    EDITOR: [true, true, true, false],
    ADMIN: [true, true, true, true],
  };
  for (const [role, allowed] of Object.entries(matrix)) {
    it(`enforces ${role}`, () =>
      expect(capabilities.map((capability) => can(role, capability))).toEqual(
        allowed,
      ));
  }
  it("denies unknown and prototype roles", () => {
    for (const role of ["SUPERADMIN", "toString", "__proto__", "reader", ""])
      expect(capabilities.every((capability) => !can(role, capability))).toBe(
        true,
      );
  });
});
describe("test DB guard", () => {
  const dev = "postgresql://localhost:55432/tka_dev";
  it("permits a separate explicit test DB", () =>
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://localhost:55432/tka_test",
        dev,
        "test",
      ),
    ).not.toThrow());
  it("rejects missing test mode, shared DB, non-test name and preset schema", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://localhost:55432/tka_test",
        dev,
        "production",
      ),
    ).toThrow();
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://localhost:55432/tka_dev",
        dev,
        "test",
      ),
    ).toThrow();
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://localhost:55432/tka_test",
        "postgresql://127.0.0.1:55432/tka_test",
        "test",
      ),
    ).toThrow();
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://localhost:55432/tka_test?schema=public",
        dev,
        "test",
      ),
    ).toThrow();
  });
});
