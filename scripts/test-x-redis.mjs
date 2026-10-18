import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const name = `memeradar-x-test-${randomUUID()}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
try {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::6379",
    "redis:7.2-alpine@sha256:29e8589c3f9ba699b5f7aa4b3c7733c58852a3626439e619aa0ee78de08c6ca0",
    "redis-server",
    "--appendonly",
    "yes",
  );
  const port = docker("port", name, "6379/tcp").split(":").at(-1);
  execFileSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.redis.config.ts",
      "--coverage",
      "--coverage.include=packages/connectors/x/*.ts",
      "--coverage.include=packages/shared/*.ts",
      "--coverage.include=packages/core/domain.ts",
    ],
    {
      stdio: "inherit",
      env: { ...process.env, TEST_REDIS_URL: `redis://127.0.0.1:${port}` },
    },
  );
} finally {
  docker("rm", "-f", "-v", name);
}
