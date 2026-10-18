import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { RedisControlStore } from "../../packages/connectors/x/redis-control";
import type { Reservation } from "../../packages/connectors/x/control";
import { createXRuntime } from "../../apps/api/x-runtime";
import { config } from "../fixtures/x/test-tools";
import { Secret } from "../../packages/shared/runtime";
const url = process.env.TEST_REDIS_URL;
if (!url)
  throw new Error("Use npm run test:redis (isolated local Redis required)");
const clients = [
  new Redis(url, { lazyConnect: true }),
  new Redis(url, { lazyConnect: true }),
];
const namespace = randomUUID();
const stores = clients.map(
  (client) => new RedisControlStore(client, namespace),
);
const ticket = (id: string, amount = "1", limit = "20"): Reservation => ({
  id,
  amount,
  limits: [
    { key: "day", amount: limit },
    { key: "month", amount: limit },
  ],
  expiresAt: Date.now() + 60000,
  warningPercent: 80,
});
beforeAll(async () => {
  await Promise.all(clients.map((client) => client.connect()));
});
afterAll(() => clients.forEach((client) => client.disconnect()));
describe("actual Redis Lua shared controls, no X calls", () => {
  it("atomically admits only 20 of 40 requests from two clients", async () => {
    const result = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        stores[i % 2].reserve(ticket(`r${i}`)),
      ),
    );
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(
      result
        .filter((r) => r.status === "rejected")
        .every(
          (r) => r.status === "rejected" && r.reason.code === "BUDGET_EXCEEDED",
        ),
    ).toBe(true);
  });
  it("refunds exactly once and cannot settle above the reservation", async () => {
    await stores[0].settle("r0", "0");
    await stores[1].settle("r0", "0");
    await stores[1].reserve(ticket("after-refund"));
    await expect(stores[0].reserve(ticket("overflow"))).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    await expect(stores[0].settle("r0", "1")).rejects.toMatchObject({
      code: "STORE_UNAVAILABLE",
    });
  });
  it("keeps monetary arithmetic exact beyond IEEE754 integer precision", async () => {
    const store = new RedisControlStore(clients[0], randomUUID());
    const large = {
      ...ticket(
        "large",
        "900719925474099300000000",
        "900719925474099300000001",
      ),
    };
    await store.reserve(large);
    await store.reserve({ ...large, id: "one", amount: "1" });
    await expect(
      store.reserve({ ...large, id: "two", amount: "1" }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    await store.settle("large", "900719925474099299999999");
    await store.reserve({ ...large, id: "refunded", amount: "1" });
  });
  it("shares pacing, quota exhaustion and delayed 429 between processes", async () => {
    const now = Date.now();
    await stores[0].takeRate("recent", now, 100);
    await expect(stores[1].takeRate("recent", now, 100)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 100,
    });
    await stores[0].updateQuota("recent", {
      limit: 10,
      remaining: 0,
      resetAt: now + 1000,
      observedAt: now,
    });
    await stores[1].updateQuota("recent", {
      limit: 10,
      remaining: 5,
      resetAt: now + 1000,
      observedAt: now,
    });
    expect((await stores[0].quota("recent"))?.remaining).toBe(0);
    await expect(
      stores[1].takeRate("recent", now + 100, 1),
    ).rejects.toMatchObject({ retryAfterMs: 900 });
    await stores[0].deferRate("other", now + 2000);
    await expect(stores[1].takeRate("other", now, 1)).rejects.toMatchObject({
      retryAfterMs: 2000,
    });
  });
  it("permits one half-open probe across clients and shares capabilities", async () => {
    const policy = { threshold: 1, cooldownMs: 100 },
      now = Date.now();
    await stores[0].finishCircuit("probe", now, "failure", policy);
    await expect(
      stores[1].enterCircuit("probe", now, policy),
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    await stores[1].enterCircuit("probe", now + 101, policy);
    await expect(
      stores[0].enterCircuit("probe", now + 101, policy),
    ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    await stores[1].finishCircuit("probe", now + 101, "success", policy);
    await stores[0].enterCircuit("probe", now + 102, policy);
    const observation = {
      state: "unavailable" as const,
      reason: "denied" as const,
      observedAt: new Date(now).toISOString(),
      windowSeconds: null,
    };
    await stores[0].setCapability("archive", observation);
    expect(await stores[1].capability("archive")).toEqual(observation);
  });
  it("deduplicates sanitized usage and refuses unavailable Redis", async () => {
    const usage = {
      requestId: "usage1",
      endpoint: "recent",
      feature: "watch" as const,
      status: 200,
      posts: 1,
      users: 1,
      costMicros: "6",
      estimated: false,
      at: new Date().toISOString(),
    };
    await stores[0].appendUsage(usage);
    await stores[1].appendUsage(usage);
    expect(await stores[0].usage()).toEqual([usage]);
    const closed = new Redis(url!, {
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    closed.disconnect();
    await expect(
      new RedisControlStore(closed, "closed").reserve(ticket("closed")),
    ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
  });
});

it("composes the private runtime against actual Redis without probing X", async () => {
  const runtime = await createXRuntime(
    await config({ redisUrl: new Secret(url!) }),
  );
  try {
    expect(runtime.status).toBe("ready");
    expect((await runtime.provider!.capabilities()).recent.state).toBe(
      "untested",
    );
  } finally {
    await runtime.close();
  }
  await expect(
    createXRuntime(await config({ pricing: null })),
  ).rejects.toMatchObject({ code: "PRICING_UNKNOWN" });
  await expect(
    createXRuntime(await config({ redisUrl: null })),
  ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
  await expect(
    createXRuntime(
      await config({ redisUrl: new Secret("https://invalid.invalid") }),
    ),
  ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
});
