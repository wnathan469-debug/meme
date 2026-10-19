import { PgSourceRepository } from "../../packages/db/source-repository";
import { defaultSettings } from "../../packages/sources/model";
import { PgEventRepository } from "../../packages/db/event-repository";
import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import {
  PgChartRepository,
  PgMarketGate,
  type ChartRequest,
} from "../../packages/db/chart-repository";
import { ChartService } from "../../packages/charts/service";
import { eventAt } from "../../packages/events/demo-data";
import { demoPool } from "../../packages/charts/demo-data";
import { DemoMarketProvider } from "../../packages/charts/demo-data";
import type { ChartPool, Candle } from "../../packages/charts/model";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import type { XPost } from "../../packages/connectors/x/contracts";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_charts";
const pool = new pg.Pool({ connectionString: url.toString() });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  address = "0xDEMO" + "0".repeat(34) + "42";
let token: string,
  now = Date.parse(eventAt(60)),
  postInternal: string;
const repo = new PgChartRepository(pool, owner, "DEMO", () => now),
  foreign = new PgChartRepository(pool, other, "DEMO", () => now);
const p: ChartPool = {
  address: demoPool(801),
  tokenSide: "base",
  dex: "[DÉMO] Test DEX",
  quote: "DEMO_USD",
  liquidity: "100",
  createdAt: eventAt(8),
  updatedAt: eventAt(60),
};
const input: ChartRequest = {
  chain: "base",
  address,
  interval: "5m",
  start: eventAt(0),
  end: eventAt(60),
  asOf: eventAt(60),
};
const candle = (m: number, value = "1"): Candle => ({
  at: eventAt(m),
  open: value,
  high: value,
  low: value,
  close: value,
  volume: "100",
  fetchedAt: new Date(now).toISOString(),
});
const batch = (candles: Candle[]) => ({
  candles,
  liquidity: [
    {
      at: eventAt(10),
      value: "100",
      reason: null,
      source: "demo-market-v1",
      fetchedAt: new Date(now).toISOString(),
    },
  ],
  marketCaps: [
    {
      at: eventAt(10),
      value: null,
      reason: "Offre circulante inconnue",
      source: "demo-market-v1",
      fetchedAt: new Date(now).toISOString(),
    },
  ],
  trades: [
    {
      id: "DEMO_TRADE",
      at: eventAt(12),
      side: "buy" as const,
      usd: "9.123456789012345678",
      tokenAmount: null,
      wallet: null,
      source: "demo-market-v1",
    },
  ],
  tradesStatus: "partial" as const,
  fetchedAt: new Date(now).toISOString(),
  partial: true,
  sourceUrl: "https://demo.memeradar.invalid/market/history",
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_charts");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','a@example.invalid','$argon2id$fixture'),($2,'DEMO','b@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
  const ch = (
    await pool.query(
      "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
    )
  ).rows[0];
  token = (
    await pool.query(
      "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,name,symbol,created_at_onchain,first_seen_by_app_at) VALUES('DEMO',$1,$2,'[DÉMO] Test token','TEST',$3,$4) RETURNING id",
      [ch.id, address, eventAt(8), eventAt(9)],
    )
  ).rows[0].id;
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("validates chain/address identity and returns explicit no-pool/no-price states", async () => {
  expect(() => new PgChartRepository(pool, "bad", "DEMO")).toThrow();
  await expect(repo.read({ ...input, address: "TEST" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(repo.read({ ...input, start: "bad" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    repo.read({ ...input, chain: "ethereum" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const d = await repo.read(input);
  expect(d.selected).toBeNull();
  expect(d.reason).toContain("Aucun pool");
  expect(d.slots.every((s) => !s.candle)).toBe(true);
  await expect(
    repo.storePools(
      "base",
      address,
      [{ ...p, address: "invalid" }],
      "demo-market-v1",
      "https://demo.memeradar.invalid/market",
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.storePools(
      "base",
      address,
      [p],
      "demo-market-v1",
      "https://evil.invalid/market",
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await repo.storePools(
    "base",
    address,
    [p, { ...p, address: demoPool(802), liquidity: "99" }],
    "demo-market-v1",
    "https://demo.memeradar.invalid/market",
  );
  expect((await repo.read(input)).selected?.address).toBe(p.address);
  await expect(
    repo.read({ ...input, pool: demoPool(999) }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("fences concurrent refreshes and stores exact, pool/interval/provider-scoped history idempotently", async () => {
  const req = { ...input, pool: p.address };
  const claims = await Promise.all([
    repo.claim(req, "demo-market-v1"),
    foreign.claim(req, "demo-market-v1"),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const lease = claims.find(Boolean)!;
  await repo.finish(
    req,
    lease,
    "demo-market-v1",
    batch([candle(10, "0.000000000000000123"), candle(20)]),
  );
  const d = await foreign.read(input);
  expect(d.candles[0].close).toBe("0.000000000000000123");
  expect(d.trades[0].usd).toBe("9.123456789012345678");
  expect(d.marketCaps[0].value).toBeNull();
  expect(d.cache?.status).toBe("partial");
  expect(d.tradesPartial).toBe(true);
  expect(d.slots.find((s) => s.at === eventAt(15))?.candle).toBeNull();
  expect(await repo.claim(req, "demo-market-v1")).toBeNull();
  await expect(
    repo.finish(req, lease, "demo-market-v1", batch([])),
  ).rejects.toMatchObject({ code: "COLLECTION_LEASE_LOST" });
  expect((await repo.read({ ...input, pool: demoPool(802) })).candles).toEqual(
    [],
  );
});
it("keeps stale data during provider failure and rejects stale leases after a takeover", async () => {
  now += 61000;
  const req = { ...input, pool: p.address },
    first = (await repo.claim(req, "demo-market-v1"))!;
  now += 61000;
  const takeover = (await foreign.claim(req, "demo-market-v1"))!;
  await expect(
    repo.finish(req, first, "demo-market-v1", batch([])),
  ).rejects.toMatchObject({ code: "COLLECTION_LEASE_LOST" });
  await repo.finish(req, takeover, "demo-market-v1", null, "RATE_LIMITED");
  const d = await repo.read({ ...input, asOf: new Date(now).toISOString() });
  expect(d.cache?.error_code).toBe("RATE_LIMITED");
  expect(d.candles).toHaveLength(2);
});
it("validates entire provider batch before mutation, preserving cache on malformed or cross-identity data", async () => {
  const req = { ...input, pool: p.address },
    lease = (await repo.claim(req, "demo-market-v1"))!;
  await expect(
    repo.finish(
      req,
      lease,
      "demo-market-v1",
      batch([{ ...candle(10), high: "0" }]),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.finish(req, lease, "demo-market-v1", batch([candle(11)])),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.finish(
      { ...req, pool: demoPool(802) },
      lease,
      "demo-market-v1",
      batch([]),
    ),
  ).rejects.toMatchObject({ code: "COLLECTION_LEASE_LOST" });
  await expect(
    repo.finish(req, lease, "demo-market-v1", {
      ...batch([]),
      sourceUrl: "https://evil.invalid",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await repo.finish(req, lease, "demo-market-v1", batch([candle(25, "2")]));
  expect(
    (await repo.read({ ...input, asOf: new Date(now).toISOString() })).candles,
  ).toHaveLength(3);
});
it("exposes disagreement values instead of averaging providers and preserves unknown liquidity", async () => {
  await pool.query(
    "INSERT INTO memeradar.price_candles(data_origin,token_id,pool_address,interval,bucket_start,open,high,low,close,volume,provider,fetched_at) VALUES('DEMO',$1,$2,'5m',$3,5,5,5,5,NULL,'reference-fixture',$4)",
    [token, p.address, eventAt(10), eventAt(59)],
  );
  const d = await repo.read({ ...input, asOf: new Date(now).toISOString() });
  expect(d.conflicts).toHaveLength(1);
  expect(d.conflicts[0].values.map((v) => v.close)).toContain("5");
  expect(d.candles.find((c) => c.at === eventAt(10))?.close).toBe(
    "0.000000000000000123",
  );
  now += 1000;
  await repo.storePools(
    "base",
    address,
    [
      {
        ...p,
        address: demoPool(803),
        liquidity: null,
        updatedAt: new Date(now).toISOString(),
      },
    ],
    "demo-market-v1",
    "https://demo.memeradar.invalid/pools",
  );
  expect(
    (
      await repo.read({
        ...input,
        pool: demoPool(803),
        asOf: new Date(now).toISOString(),
      })
    ).selected?.liquidity,
  ).toBeNull();
});
it("keeps social and alert markers private while market candles remain shareable", async () => {
  const collection = new PgXCollectionRepository(pool, owner, "DEMO"),
    rule = await collection.createRule({ query: "TEST", status: "active" }),
    n = Date.now() + 1000,
    lease = (await collection.claim(rule, "search", n, 120000, true))!;
  const post: XPost = {
    id: "DEMO_CHART_POST",
    text: "[DÉMO] Test",
    authorId: null,
    publishedAt: eventAt(12),
    collectedAt: eventAt(60),
    conversationId: null,
    references: [],
    type: "original",
    language: "fr",
    metrics: { likes: null, replies: null, reposts: null, quotes: null },
    entities: { hashtags: [], cashtags: [], mentions: [], urls: [] },
    dataOrigin: "DEMO",
    knowledge: "OBSERVED",
  };
  await collection.ingest(
    lease,
    {
      data: [post],
      users: [],
      nextToken: null,
      problems: [],
      quota: null,
      partial: false,
      collectedAt: eventAt(60),
      dataOrigin: "DEMO",
    },
    "search",
    n,
    120000,
  );
  await collection.finish(lease, { now: n, nextDueAt: n, status: "completed" });
  postInternal = (
    await pool.query(
      "SELECT id FROM memeradar.x_posts WHERE x_post_id='DEMO_CHART_POST'",
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO memeradar.post_token_mentions(data_origin,post_id,token_id,detection_method,confidence,owner_user_id) VALUES('DEMO',$1,$2,'exact_address',0.9,$3)",
    [postInternal, token, owner],
  );
  const eventId = "00000000-0000-4000-8000-000000000088";
  await pool.query(
    "INSERT INTO memeradar.events(id,data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level) VALUES($1,'DEMO','[DÉMO] Test','Fixture','manual',$2,$3,'active','A','LOW')",
    [eventId, eventAt(0), eventAt(1)],
  );
  const eventRepo = new PgEventRepository(pool, owner, "DEMO");
  await eventRepo.configure(eventId, {
    terms: [{ kind: "phrase", text: "Test" }],
    ruleIds: [rule.id],
  });
  await eventRepo.rebuild(eventId);
  const ruleId = (
    await pool.query(
      "INSERT INTO memeradar.alert_rules(data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality) VALUES('DEMO',$1,'token_link','{}',ARRAY['in_app'],60,'WEAK',0.5) RETURNING id",
      [owner],
    )
  ).rows[0].id;
  await pool.query(
    "INSERT INTO memeradar.alerts(data_origin,rule_id,token_id,triggered_at,reason,observed_data,sources,fingerprint,status) VALUES('DEMO',$1,$2,$3,'[DÉMO] Alert fixture','{}','[]','chart-private-alert','pending')",
    [ruleId, token, eventAt(30)],
  );
  const own = await repo.read({ ...input, asOf: new Date(now).toISOString() }),
    otherView = await foreign.read({
      ...input,
      asOf: new Date(now).toISOString(),
    });
  expect(own.markers.some((m) => m.kind === "x_post")).toBe(true);
  expect(own.markers.some((m) => m.kind === "event")).toBe(true);
  expect(otherView.markers.some((m) => m.kind === "event")).toBe(false);
  expect(own.markers.some((m) => m.kind === "alert")).toBe(true);
  expect(
    otherView.markers.some((m) => m.kind === "x_post" || m.kind === "alert"),
  ).toBe(false);
  expect(otherView.candles.length).toBeGreaterThan(0);
  await collection.hideUnavailable(["DEMO_CHART_POST"], Date.now());
  expect(
    (
      await repo.read({ ...input, asOf: new Date(now).toISOString() })
    ).markers.some((m) => m.kind === "x_post"),
  ).toBe(false);
});
it("enforces a shared request gate across instances, keeps backoff after a new minute, and isolates origins", async () => {
  let clock = Date.parse(eventAt(60));
  const realOwner = "00000000-0000-4000-8000-000000000099";
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'REAL','gate-fixture@example.invalid','$argon2id$fixture')",
    [realOwner],
  );
  await new PgSourceRepository(pool, realOwner, "REAL").initialize(
    "gecko",
    "default",
    { ...defaultSettings(), enabled: true },
  );
  await pool.query(
    "INSERT INTO memeradar.server_collection_controls(data_origin,stopped) VALUES('REAL',false)",
  );
  await pool.query(
    "INSERT INTO memeradar.server_provider_policies(data_origin,provider,namespace,enabled,verified_at,request_ceiling_micros,daily_limit_micros,monthly_limit_micros,max_requests_day) VALUES('REAL','gecko','default',true,$1,0,0,0,150)",
    [new Date(clock - 1000)],
  );
  const a = new PgMarketGate(pool, "REAL", "geckoterminal-v2", () => clock),
    b = new PgMarketGate(pool, "REAL", "geckoterminal-v2", () => clock);
  const attempts = await Promise.allSettled(
    Array.from({ length: 21 }, (_, i) => (i % 2 ? a : b).reserve()),
  );
  expect(attempts.filter((v) => v.status === "fulfilled")).toHaveLength(20);
  expect(attempts.filter((v) => v.status === "rejected")).toHaveLength(1);
  await a.backoff(120);
  clock += 60001;
  await expect(b.reserve()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  await new PgMarketGate(
    pool,
    "DEMO",
    "geckoterminal-v2",
    () => clock,
  ).reserve();
  clock += 60001;
  await b.reserve();
  await expect(a.backoff(3601)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("composes opt-in offline chart service, cache refresh and bounded trade recovery", async () => {
  const service = new ChartService(repo, new DemoMarketProvider());
  await expect(
    service.discover({ chain: "base", address }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(
    (await service.discover({ chain: "base", address }, true)).networkCalls,
  ).toBe(0);
  const req = {
    ...input,
    pool: demoPool(802),
    asOf: new Date(now).toISOString(),
  };
  const first = await service.refresh(req, true, true);
  expect(first.status).toBe("refreshed");
  expect(first.snapshot.candles.length).toBeGreaterThan(0);
  expect(first.snapshot.cache?.trades_status).toBe("partial");
  await expect(
    new ChartService(repo, null).refresh(req, true),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
});
it("works with a non-bypass application role and refuses destructive downgrade with market history", async () => {
  await pool.query(
    "CREATE ROLE chart_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO chart_application_test");
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO chart_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=chart_application_test",
  });
  try {
    expect(
      (
        await new PgChartRepository(scoped, other, "DEMO").read({
          ...input,
          asOf: new Date(now).toISOString(),
        })
      ).markers.some((m) => m.kind === "x_post" || m.kind === "alert"),
    ).toBe(false);
  } finally {
    await scoped.end();
  }
  await expect(migrate(pool, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.schema_migrations"))
      .rows[0].count,
  ).toBe("13");
});
