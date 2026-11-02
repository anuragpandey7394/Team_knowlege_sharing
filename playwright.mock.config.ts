import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "tests/e2e-mock",
  webServer: {
    ...(base.webServer as object),
    env: { NODE_ENV: "test", AI_PROVIDER: "mock" },
  },
});
