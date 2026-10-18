import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "packages/core/domain.ts",
        "apps/desktop/preferences-v2.cjs",
        "packages/connectors/x/{client,contracts,control}.ts",
        "packages/shared/*.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
