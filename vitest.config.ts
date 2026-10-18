import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "packages/core/domain.ts",
        "apps/desktop/preferences-v2.cjs",
        "packages/connectors/x/{client,contracts,control,stream-client}.ts",
        "packages/collection/{collector,contracts,feed,query}.ts",
        "packages/people/*.ts",
        "packages/conversations/model.ts",
        "packages/shared/*.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
