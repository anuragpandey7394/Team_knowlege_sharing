import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "node_modules/.bin/tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:5174/health/ready",
    reuseExistingServer: false,
    timeout: 45000,
    env: { NODE_ENV: "test" },
    gracefulShutdown: { signal: "SIGTERM", timeout: 15000 },
  },
});
