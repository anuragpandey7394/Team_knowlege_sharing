import { defineConfig, configDefaults } from "vitest/config";
export default defineConfig({
  test: {
    maxWorkers: 2,
    testTimeout: 15000,
    exclude: [...configDefaults.exclude, "**/.cache/**"],
  },
});
