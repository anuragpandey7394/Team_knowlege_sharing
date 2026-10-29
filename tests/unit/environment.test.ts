import { describe, it, expect } from "vitest";
import { parseEnvironment } from "../../packages/config/src/index";
const database = {
  DATABASE_URL: "postgresql://localhost/tka_dev",
  TEST_DATABASE_URL: "postgresql://localhost/tka_test",
};
describe("environment boundaries", () => {
  it("defaults to disabled AI", () =>
    expect(parseEnvironment(database).AI_PROVIDER).toBe("disabled"));
  it("rejects production mock AI", () =>
    expect(() =>
      parseEnvironment({
        ...database,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://example.test",
        AI_PROVIDER: "mock",
      }),
    ).toThrow());
  it("rejects shared development/test DB", () =>
    expect(() =>
      parseEnvironment({
        ...database,
        TEST_DATABASE_URL: database.DATABASE_URL,
      }),
    ).toThrow());
  it("rejects malformed ports and missing database configuration", () => {
    expect(() => parseEnvironment({ ...database, API_PORT: 70000 })).toThrow();
    expect(() => parseEnvironment({})).toThrow();
  });
  it("requires HTTPS for hosted credentials", () =>
    expect(() =>
      parseEnvironment({ ...database, NODE_ENV: "production" }),
    ).toThrow());
});
