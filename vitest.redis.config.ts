import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        "tests/unit/**/*.test.ts",
        "tests/contract/**/*.test.ts",
        "tests/integration/x-redis.test.ts",
      ],
      testTimeout: 10000,
    },
  }),
);
