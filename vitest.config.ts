import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared/vitest.config.ts",
      "packages/server/vitest.config.ts",
      "packages/client/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      include: [
        "packages/shared/src/**",
        "packages/server/src/**",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/__snapshots__/**",
        "**/__tests__/**",
        "**/test-setup.ts",
      ],
      all: true,
      thresholds: {
        "packages/shared/src/engine/**": {
          branches: 90,
        },
      },
    },
  },
});
