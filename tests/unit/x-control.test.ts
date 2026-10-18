import { describe, it, expect } from "vitest";
import {
  MemoryControlStore,
  BudgetGuard,
  quotaFromHeaders,
  retryAfter,
} from "../../packages/connectors/x/control";
import { FakeClock } from "../fixtures/x/test-tools";
const policy = { daily: "20", monthly: "20", warningPercent: 80, features: {} };
const pricing = {
  currency: "USD" as const,
  request: "1",
  post: "0",
  user: "0",
  verifiedAt: "2026-01-15T00:00:00.000Z",
};
describe("Budget exact et atomique", () => {
  it("n’autorise que vingt réservations concurrentes pour un plafond de vingt", async () => {
    const store = new MemoryControlStore(),
      guard = new BudgetGuard(store, new FakeClock(), policy, pricing);
    const results = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        guard.reserve("r" + i, "watch", 0, 0),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect([...store.balances.values()]).toEqual([20n, 20n]);
  });
  it("conserve l’exactitude au-delà de 2^53 et empêche un double remboursement", async () => {
    const store = new MemoryControlStore(),
      clock = new FakeClock();
    const guard = new BudgetGuard(
      store,
      clock,
      {
        ...policy,
        daily: "100000000000000000000",
        monthly: "100000000000000000000",
      },
      { ...pricing, request: "9007199254740993" },
    );
    await guard.reserve("a", "watch", 0, 0);
    await guard.settle("a", "9007199254740992");
    await guard.settle("a", "9007199254740992");
    expect([...store.balances.values()]).toEqual([
      9007199254740992n,
      9007199254740992n,
    ]);
    await expect(guard.settle("a", "1")).rejects.toMatchObject({
      code: "STORE_UNAVAILABLE",
    });
  });
  it("applique limites de fonctionnalité, avertissement et changement de jour/mois", async () => {
    const clock = new FakeClock(),
      store = new MemoryControlStore(),
      guard = new BudgetGuard(
        store,
        clock,
        {
          daily: "10",
          monthly: "15",
          warningPercent: 80,
          features: { people: { daily: "4", monthly: "4" } },
        },
        { ...pricing, request: "4" },
      );
    expect((await guard.reserve("p", "people", 0, 0)).warning).toBe(true);
    await expect(guard.reserve("p2", "people", 0, 0)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect((await guard.reserve("w", "watch", 0, 0)).warning).toBe(true);
    clock.time += 86400000;
    await guard.reserve("w2", "watch", 0, 0);
    await expect(guard.reserve("w3", "watch", 0, 0)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    clock.time = Date.parse("2026-02-01T00:00:00Z");
    await expect(guard.reserve("w4", "watch", 0, 0)).resolves.toBeDefined();
  });
  it("ne libère jamais spontanément une réservation interrompue", async () => {
    const store = new MemoryControlStore(),
      clock = new FakeClock(),
      guard = new BudgetGuard(
        store,
        clock,
        { daily: "1", monthly: "1", warningPercent: 80, features: {} },
        pricing,
      );
    await guard.reserve("crash", "watch", 0, 0);
    await expect(guard.reserve("next", "watch", 0, 0)).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
  });
  it("rejette tarification inconnue, coûts négatifs et règlement supérieur", async () => {
    const store = new MemoryControlStore(),
      clock = new FakeClock();
    expect(
      () => new BudgetGuard(store, clock, policy, { ...pricing, post: "-1" }),
    ).toThrow();
    expect(
      () => new BudgetGuard(store, clock, { ...policy, daily: "x" }, pricing),
    ).toThrow();
    const guard = new BudgetGuard(store, clock, policy, pricing);
    await expect(
      new BudgetGuard(store, clock, null, pricing).reserve("a", "watch", 0, 0),
    ).rejects.toMatchObject({ code: "PRICING_UNKNOWN" });
    await guard.reserve("a", "watch", 0, 0);
    await expect(guard.settle("a", "2")).rejects.toMatchObject({
      code: "STORE_UNAVAILABLE",
    });
    await expect(guard.settle("a", "-1")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(guard.reserve("a", "watch", 0, 0)).rejects.toMatchObject({
      code: "STORE_UNAVAILABLE",
    });
  });
});
describe("Registre de limites et circuit", () => {
  it("distingue données inconnues et zéro, et ignore valeurs impossibles", () => {
    const now = 100000;
    expect(quotaFromHeaders({}, now)).toMatchObject({
      limit: null,
      remaining: null,
      resetAt: null,
    });
    expect(
      quotaFromHeaders(
        { "x-rate-limit-remaining": "0", "x-rate-limit-reset": "123" },
        now,
      ),
    ).toMatchObject({ remaining: 0, resetAt: 123000 });
    expect(
      quotaFromHeaders({ "x-rate-limit-limit": "900719925474099999999" }, now)
        .limit,
    ).toBeNull();
    expect(retryAfter({ "retry-after": "2" }, now)).toBe(2000);
    expect(
      retryAfter({ "retry-after": new Date(now + 10000).toUTCString() }, now),
    ).toBe(10000);
    expect(retryAfter({ "retry-after": "invalid" }, now)).toBe(0);
  });
  it("ne remonte pas un restant lors de réponses concurrentes du même bucket", async () => {
    const store = new MemoryControlStore();
    await store.updateQuota("recent", {
      limit: 10,
      remaining: 3,
      resetAt: 2000,
      observedAt: 0,
    });
    await store.updateQuota("recent", {
      limit: 10,
      remaining: 8,
      resetAt: 2000,
      observedAt: 1,
    });
    await store.updateQuota("recent", {
      limit: 10,
      remaining: 9,
      resetAt: 1000,
      observedAt: 2,
    });
    expect((await store.quota("recent"))?.remaining).toBe(3);
    await store.takeRate("recent", 100, 10);
    expect((await store.quota("recent"))?.remaining).toBe(2);
    await store.takeRate("recent", 2000, 10);
    expect(await store.quota("recent")).toBeNull();
  });
  it("réserve une seule sonde après cooldown et permet d’annuler avant réseau", async () => {
    const store = new MemoryControlStore(),
      p = { threshold: 1, cooldownMs: 10 };
    await store.finishCircuit("a", 0, "failure", p);
    await expect(store.enterCircuit("a", 5, p)).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
    });
    await store.enterCircuit("a", 11, p);
    await expect(store.enterCircuit("a", 11, p)).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
    });
    await store.finishCircuit("a", 11, "cancel", p);
    await store.enterCircuit("a", 12, p);
    await store.finishCircuit("a", 12, "success", p);
    await expect(store.enterCircuit("a", 12, p)).resolves.toBeUndefined();
  });
});
