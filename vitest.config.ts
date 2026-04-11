import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared/vitest.config.ts",
      "packages/server/vitest.config.ts",
      "packages/client/vitest.config.ts",
    ],
  },
});
