import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "apps/web/src/{navigation,watch-model,control-filters}.ts",
        "packages/core/domain.ts",
        "apps/desktop/preferences-v2.cjs",
        "packages/connectors/x/{client,contracts,control,stream-client}.ts",
        "packages/collection/{collector,contracts,feed,query}.ts",
        "packages/people/*.ts",
        "packages/conversations/model.ts",
        "packages/events/model.ts",
        "packages/social/*.ts",
        "packages/risks/{model,adapters,goplus}.ts",
        "packages/alerts/{model,engine}.ts",
        "packages/sources/{model,service,transport}.ts",
        "packages/charts/{decimal,model,service}.ts",
        "packages/connectors/market/*.ts",
        "packages/shared/*.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
