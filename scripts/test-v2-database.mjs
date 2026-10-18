import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const name = `memeradar-v2-db-${randomUUID()}`;
const redisName = name + "-redis";
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
try {
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e",
    "POSTGRES_DB=memeradar_test",
    "postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4",
  );
  const port = docker("port", name, "5432/tcp").split(":").at(-1);
  docker(
    "run",
    "-d",
    "--name",
    redisName,
    "-p",
    "127.0.0.1::6379",
    "redis:7.2-alpine@sha256:29e8589c3f9ba699b5f7aa4b3c7733c58852a3626439e619aa0ee78de08c6ca0",
  );
  const redisPort = docker("port", redisName, "6379/tcp").split(":").at(-1);
  execFileSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.db.config.ts",
      "--coverage",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: `postgres://postgres@127.0.0.1:${port}/memeradar_test`,
        TEST_DB_CONTAINER: name,
        TEST_REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      },
    },
  );
} finally {
  docker("rm", "-f", "-v", name);
  docker("rm", "-f", "-v", redisName);
}
