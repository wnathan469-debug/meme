import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "tests/integration/v2-database.test.ts",
      "tests/integration/x-collection.test.ts",
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
        "packages/db/x-collection-repository.ts",
        "packages/collection/search-service.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
