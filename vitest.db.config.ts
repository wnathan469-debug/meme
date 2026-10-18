import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "tests/integration/v2-database.test.ts",
      "tests/integration/x-collection.test.ts",
      "tests/integration/people.test.ts",
      "tests/integration/conversations.test.ts",
      "tests/integration/events.test.ts",
      "tests/integration/social.test.ts",
      "tests/integration/charts.test.ts",
      "tests/integration/risks.test.ts",
      "tests/integration/alerts.test.ts",
      "tests/integration/sources.test.ts",
    ],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: [
        "packages/db/migrations.ts",
        "packages/db/x-control-store.ts",
        "packages/db/client.ts",
        "packages/db/people-repository.ts",
        "packages/db/conversation-repository.ts",
        "packages/db/event-repository.ts",
        "packages/db/social-repository.ts",
        "packages/db/chart-repository.ts",
        "packages/db/risk-repository.ts",
        "packages/db/alert-repository.ts",
        "packages/db/source-repository.ts",
        "packages/db/provider-budget-policy.ts",
        "packages/db/social-visibility.ts",
        // Pure graph/filter/coverage functions have their own unit coverage target.
        "packages/conversations/service.ts",
        "packages/people/{model,service,collector}.ts",
        "packages/db/x-collection-repository.ts",
        "packages/collection/search-service.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
