import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { migrate } from "../../packages/db/migrations";
import {
  PgSourceRepository,
  recordDiagnostic,
  publicAdmission,
} from "../../packages/db/source-repository";
import { DurableXControlStore } from "../../packages/db/x-control-store";
import {
  MemoryControlStore,
  type Reservation,
} from "../../packages/connectors/x/control";
import {
  defaultSettings,
  periodKeys,
  type ProviderDiagnostic,
  type ProviderSettings,
} from "../../packages/sources/model";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_sources";
const pool = new pg.Pool({ connectionString: url.toString(), max: 12 });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
let now = Date.parse("2026-10-18T15:00:00Z");
const repo = new PgSourceRepository(pool, owner, "DEMO", () => now),
  foreign = new PgSourceRepository(pool, other, "DEMO", () => now);
const settings = (): ProviderSettings => ({
  ...defaultSettings(),
  enabled: true,
  budget: { daily: "1000", monthly: "5000", warningPercent: 80, features: {} },
});
const store = (ns: string) =>
  new DurableXControlStore(pool, new MemoryControlStore(), ns, "DEMO");
const reservation = (
  amount: string,
  feature: Reservation["feature"] = "people",
): Reservation => {
  const k = periodKeys(new Date(now).toISOString());
  return {
    id: randomUUID(),
    amount,
    feature,
    endpoint: "username",
    limits: [
      { key: k.day, amount: "1000" },
      { key: k.month, amount: "5000" },
    ],
    expiresAt: now + 86400000,
    warningPercent: 80,
  };
};
const diag = (
  overrides: Partial<ProviderDiagnostic> = {},
): ProviderDiagnostic => ({
  id: randomUUID(),
  at: new Date(now).toISOString(),
  endpoint: "networks",
  status: 200,
  code: null,
  quota: null,
  retryAt: null,
  ...overrides,
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_sources");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','sources@example.invalid','$argon2id$fixture'),($2,'DEMO','other@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("initializes once, scopes management to owner/origin, and refuses stale writes", async () => {
  await repo.initialize("x", "account", settings());
  await repo.initialize("x", "account", defaultSettings());
  expect((await repo.read("x", "account")).settings.enabled).toBe(true);
  await expect(foreign.read("x", "account")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    foreign.initialize("x", "account", settings()),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    new PgSourceRepository(pool, owner, "REAL").read("x", "account"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.save("x", "account", settings(), 99)).rejects.toMatchObject(
    { code: "INVALID_INPUT" },
  );
  await expect(repo.read("x", "bad/ns")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await repo.save("x", "account", settings(), 1);
  expect((await repo.read("x", "account")).revision).toBe(2);
});
it("rejects caps below pending costs and applies edited caps to old worker configuration", async () => {
  const s = store("account"),
    r = reservation("600");
  await s.reserve(r);
  const low = settings();
  low.budget.daily = "599";
  await expect(repo.save("x", "account", low, 2)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  const high = settings();
  high.budget.daily = "1200";
  await repo.save("x", "account", high, 2);
  await s.reserve(reservation("600"));
  await expect(s.reserve(reservation("1"))).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  await s.settle(r.id, "300");
  const b = (await repo.read("x", "account")).balances;
  expect(b.find((b) => b.budget_key.startsWith("day:"))?.spent_micros).toBe(
    "900",
  );
});
it("seeds newly added feature caps with historical commitments and refunds pending settlements", async () => {
  const capped = settings();
  capped.budget.daily = "1200";
  capped.budget.features.people = { daily: "1000", monthly: "3000" };
  await repo.save("x", "account", capped, 3);
  await expect(
    store("account").reserve({ ...reservation("1"), feature: undefined }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  let b = (await repo.read("x", "account")).balances;
  expect(
    b.find((b) => b.budget_key.startsWith("feature:people:day:"))?.spent_micros,
  ).toBe("900");
  const pending = (
    await pool.query(
      "SELECT request_id FROM memeradar.x_cost_reservations WHERE namespace='account' AND settled_micros IS NULL",
    )
  ).rows[0].request_id;
  await store("account").settle(pending, "100");
  b = (await repo.read("x", "account")).balances;
  expect(
    b.find((b) => b.budget_key.startsWith("feature:people:day:"))?.spent_micros,
  ).toBe("400");
  const remove = settings();
  await expect(repo.save("x", "account", remove, 4)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const tight = structuredClone(capped);
  tight.budget.features.people!.daily = "399";
  await expect(repo.save("x", "account", tight, 4)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  const outcomes = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      store("account").reserve(reservation("100")),
    ),
  );
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(6);
  expect(
    outcomes
      .filter((r) => r.status === "rejected")
      .every(
        (r) => r.status === "rejected" && r.reason.code === "BUDGET_EXCEEDED",
      ),
  ).toBe(true);
});
it("requires an expiring single-use probe, cancels on settings changes and blocks exhausted budgets", async () => {
  await expect(repo.quote("x", "account", "1")).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  const current = await repo.read("x", "account");
  const high = structuredClone(current.settings);
  high.budget.features.people!.daily = "1100";
  await repo.save("x", "account", high, current.revision);
  const q = await repo.quote("x", "account", "10");
  await expect(
    foreign.consume("x", "account", q.id, q.ceiling),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repo.consume("x", "account", q.id, "11")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await repo.consume("x", "account", q.id, q.ceiling);
  await expect(
    repo.consume("x", "account", q.id, q.ceiling),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const expired = await repo.quote("x", "account", "10");
  now += 120001;
  await expect(
    repo.consume("x", "account", expired.id, expired.ceiling),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const cancelled = await repo.quote("x", "account", "10");
  const latest = await repo.read("x", "account");
  await repo.save("x", "account", latest.settings, latest.revision);
  await expect(
    repo.consume("x", "account", cancelled.id, cancelled.ceiling),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("disables actual worker admission and probe preparation without deleting audit balances", async () => {
  const c = await repo.read("x", "account"),
    disabled = { ...c.settings, enabled: false };
  await repo.save("x", "account", disabled, c.revision);
  await expect(
    store("account").reserve(reservation("1")),
  ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  await expect(repo.quote("x", "account", "1")).rejects.toMatchObject({
    code: "NETWORK_DISABLED",
  });
  await expect(
    repo.consume("x", "account", randomUUID(), "1"),
  ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  expect((await repo.read("x", "account")).balances.length).toBe(4);
});
it("aggregates the full X ledger separately from bounded sanitized diagnostic history", async () => {
  const s = store("account");
  const current = await repo.read("x", "account"),
    generous = structuredClone(current.settings);
  generous.enabled = true;
  generous.budget.daily = "100000";
  generous.budget.monthly = "100000";
  generous.budget.features.people = { daily: "100000", monthly: "100000" };
  await repo.save("x", "account", generous, current.revision);
  for (let i = 0; i < 52; i++) {
    const r = reservation("150");
    await s.reserve(r);
    await s.settle(r.id, "150");
    await s.appendUsage({
      requestId: r.id,
      endpoint: "username",
      feature: "people",
      status: i === 51 ? 429 : 200,
      posts: i === 0 ? null : 0,
      users: i === 0 ? null : 1,
      costMicros: "150",
      estimated: true,
      at: new Date(now - i * 1000).toISOString(),
      quota: {
        limit: 300,
        remaining: 0,
        resetAt: now + 60000,
        observedAt: now,
      },
    });
  }
  const c = await repo.read("x", "account");
  expect(c.day).toMatchObject({
    calls: "52",
    posts: "0",
    unknown_posts: "1",
    cost: "7800",
  });
  expect(c.diagnostics).toHaveLength(50);
  expect(c.partial).toBe(true);
  expect(c.lastSuccess).not.toBeNull();
  expect(c.lastError).not.toBeNull();
  expect(c.diagnostics.some((d) => d.quota?.limit === 300)).toBe(true);
  await expect(
    recordDiagnostic(pool, "DEMO", "x", "account", {
      ...diag(),
      message: "secret",
    } as ProviderDiagnostic),
  ).rejects.toThrow();
  await recordDiagnostic(pool, "DEMO", "x", "absent", diag());
});
it("shares public-provider disabling, Retry-After and one half-open circuit slot across workers", async () => {
  await repo.initialize("gecko", "default", defaultSettings());
  await expect(
    publicAdmission(pool, "DEMO", "gecko", "default", now),
  ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  const enabled = defaultSettings();
  enabled.enabled = true;
  await repo.save("gecko", "default", enabled, 1);
  await publicAdmission(pool, "DEMO", "gecko", "default", now);
  const error = diag({
    status: 429,
    code: "RATE_LIMITED",
    retryAt: new Date(now + 60000).toISOString(),
  });
  await recordDiagnostic(pool, "DEMO", "gecko", "default", error, 0);
  await recordDiagnostic(pool, "DEMO", "gecko", "default", error, 0);
  expect((await repo.read("gecko", "default")).day.calls).toBe("1");
  await recordDiagnostic(pool, "DEMO", "gecko", "default", diag(), 0);
  await expect(
    publicAdmission(pool, "DEMO", "gecko", "default", now),
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await expect(repo.quote("gecko", "default", "0")).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  await recordDiagnostic(
    pool,
    "DEMO",
    "gecko",
    "default",
    diag({ status: 503, code: "PROVIDER_UNAVAILABLE" }),
    0,
  );
  await recordDiagnostic(
    pool,
    "DEMO",
    "gecko",
    "default",
    diag({ status: 503, code: "PROVIDER_UNAVAILABLE" }),
    0,
  );
  await expect(
    publicAdmission(pool, "DEMO", "gecko", "default", now),
  ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
  now += 60001;
  await publicAdmission(pool, "DEMO", "gecko", "default", now);
  await expect(
    publicAdmission(pool, "DEMO", "gecko", "default", now),
  ).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
  await recordDiagnostic(pool, "DEMO", "gecko", "default", diag(), 0);
  await publicAdmission(pool, "DEMO", "gecko", "default", now);
  const c = await repo.read("gecko", "default");
  expect(c.blockedUntil).toBeNull();
  expect(c.balances).toEqual([]);
  expect(c.day.cost).toBeNull();
  await publicAdmission(pool, "DEMO", "goplus", "absent", now);
});
it("enforces journal privacy with a non-superuser database role", async () => {
  await pool.query(
    "CREATE ROLE sources_reader NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO sources_reader");
  await pool.query(
    "GRANT SELECT,UPDATE ON memeradar.provider_controls TO sources_reader",
  );
  await pool.query(
    "GRANT SELECT ON memeradar.provider_diagnostics TO sources_reader",
  );
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL ROLE sources_reader");
    await c.query(
      "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin','DEMO',true)",
      [other],
    );
    expect(
      (await c.query("SELECT * FROM memeradar.provider_diagnostics")).rowCount,
    ).toBe(0);
    expect(
      (
        await c.query(
          "UPDATE memeradar.provider_controls SET enabled=enabled RETURNING id",
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await c.query(
          "SELECT provider,settings FROM memeradar.provider_controls",
        )
      ).rowCount,
    ).toBe(2);
    await c.query("SELECT set_config('memeradar.user_id',$1,true)", [owner]);
    expect(
      (await c.query("SELECT * FROM memeradar.provider_diagnostics")).rowCount,
    ).toBeGreaterThan(50);
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
});
it("edits only owned rule frequencies, applies priority templates and persists cache controls", async () => {
  const rules = new PgXCollectionRepository(pool, owner, "DEMO"),
    others = new PgXCollectionRepository(pool, other, "DEMO");
  const r = await rules.createRule({ query: "demo", priority: "high" }),
    f = await others.createRule({ query: "foreign", priority: "high" });
  expect(r.intervalSeconds).toBe(300);
  await repo.setInterval(r.id, 180);
  await expect(foreign.setInterval(r.id, 180)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(repo.setInterval(r.id, 59)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(repo.applyPriority("high", 86401)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(await repo.applyPriority("high", 240)).toBe(1);
  const c = await repo.read("x", "account"),
    changed = structuredClone(c.settings);
  changed.priorities.high = 600;
  changed.cache.posts = 120;
  changed.cache.profiles = 15;
  await repo.save("x", "account", changed, c.revision);
  expect(
    (await repo.rules()).find((x) => x.id === r.id).poll_interval_seconds,
  ).toBe(600);
  expect(
    (await foreign.rules()).find((x) => x.id === f.id).poll_interval_seconds,
  ).toBe(300);
  expect(
    (await rules.createRule({ query: "new", priority: "high" }))
      .intervalSeconds,
  ).toBe(600);
  expect(await store("account").cacheSeconds("profiles", 300)).toBe(15);
  expect(await store("absent").cacheSeconds("posts", 300)).toBe(300);
  expect(await rules.cacheSeconds("posts", 300)).toBe(120);
});
it("refuses destructive rollback of populated provider settings", async () => {
  await expect(migrate(pool, { rollback: true })).rejects.toThrow();
  expect(
    (
      await pool.query(
        "SELECT count(*)::int n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(13);
});
