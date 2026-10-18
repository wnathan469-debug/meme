import { beforeAll, afterAll, it, expect, vi } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { PgConversationRepository } from "../../packages/db/conversation-repository";
import { ConversationService } from "../../packages/conversations/service";
import { DemoConversationProvider } from "../../packages/connectors/x/demo-conversations";
import { demoConversationId as id } from "../../packages/conversations/demo-data";
import { FakeClock, config } from "../fixtures/x/test-tools";
import { ProviderError } from "../../packages/shared/errors";
const root = process.env.TEST_DATABASE_URL!;
const admin = new pg.Pool({ connectionString: root });
const url = new URL(root);
url.pathname = "/memeradar_conversations";
const pool = new pg.Pool({ connectionString: url.toString() });
const owners = Array.from(
  { length: 4 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`,
);
const clock = new FakeClock();
clock.time = Date.now() + 1000;
const provider = new DemoConversationProvider(clock);
const repo = (owner = owners[0], db = pool) =>
  new PgConversationRepository(
    db,
    owner,
    "DEMO",
    new PgXCollectionRepository(db, owner, "DEMO"),
  );
let service: ConversationService;
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_conversations");
  await migrate(pool);
  for (const owner of owners)
    await pool.query(
      "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO',$2,'$argon2id$fixture')",
      [owner, `${owner}@example.invalid`],
    );
  service = new ConversationService(
    provider,
    repo(),
    await config({ mode: "demo" }),
    clock,
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("quotes without content requests or writes and requires the same owner's valid confirmation", async () => {
  const lookup = vi.spyOn(provider, "getPostsByIds");
  const q = await service.quote(id, 4);
  expect(q.maxCostMicros).toBe("0");
  expect(q.confirmationRequired).toBe(true);
  expect(lookup).not.toHaveBeenCalled();
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.conversation_views"))
      .rows[0].count,
  ).toBe("0");
  await expect(service.execute(q.id, "1")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const foreign = new ConversationService(
    provider,
    repo(owners[1]),
    await config({ mode: "demo" }),
    clock,
  );
  await expect(foreign.execute(q.id, "0")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  lookup.mockRestore();
});
it("loads 35 unique replies out of 120, excludes the root and citations, and minimizes commenters", async () => {
  const q = await service.quote(id, 4),
    lookup = vi.spyOn(provider, "getPostsByIds");
  const result = await service.execute(q.id, q.maxCostMicros);
  expect(result.coverage.retrieved).toBe(35);
  expect(result.coverage.reported).toBe("120");
  expect(result.coverage.percent).toBe("29,17");
  expect(result.coverage.status).toBe("partial");
  expect(result.posts.filter((p) => p.type === "quote")).toHaveLength(1);
  expect(result.posts).toHaveLength(37);
  expect(result.summary.distinctCommenters).toBe(9);
  expect(result.summary.recentAccountsProportion).toBeNull();
  expect(result.summary.identicalTextGroups).toBe(1);
  expect(
    result.posts.find((p) => p.id === "DEMO_POST_REPLY")?.author?.username,
  ).toBe("demo_fondateur_marc");
  expect(lookup).toHaveBeenCalledWith([id], { feature: "conversations" });
  for (const table of ["x_users", "x_username_history", "tracked_people"])
    expect(
      (await pool.query(`SELECT count(*) FROM memeradar.${table}`)).rows[0]
        .count,
    ).toBe("0");
  const cols = (
    await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='memeradar' AND table_name='conversation_authors'",
    )
  ).rows.map((r) => r.column_name);
  expect(cols).not.toContain("followers_count");
  expect(cols).not.toContain("private_note");
  await expect(service.execute(q.id, "0")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  lookup.mockRestore();
});
it("resumes bounded pages for another owner without borrowing the first owner's coverage", async () => {
  const other = new ConversationService(
    provider,
    repo(owners[1]),
    await config({ mode: "demo" }),
    clock,
  );
  await expect(other.local(id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  let q = await other.quote(id, 1, false);
  const first = await other.execute(q.id, "0");
  expect(first.coverage.retrieved).toBe(9);
  expect(first.posts).toHaveLength(10);
  expect(first.posts.every((p) => p.type !== "quote")).toBe(true);
  q = await other.quote(id, 3, false);
  const second = await other.execute(q.id, "0");
  expect(second.coverage.retrieved).toBe(35);
  const original = await service.local(id);
  expect(original.posts).toHaveLength(37);
  expect(await repo(owners[1]).collection.rules()).toEqual([]);
  const count = (await pool.query("SELECT count(*) FROM memeradar.x_posts"))
    .rows[0].count;
  q = await other.quote(id, 4, false);
  expect((await other.execute(q.id, "0")).coverage.retrieved).toBe(35);
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.x_posts")).rows[0].count,
  ).toBe(count);
});
it("retains readable partial results and typed errors on 429 or budget refusal without trying citations", async () => {
  const replies = vi
    .spyOn(provider, "getConversation")
    .mockRejectedValueOnce(new ProviderError("RATE_LIMITED", true, 60000));
  const quotes = vi.spyOn(provider, "getQuotePosts");
  const q = await service.quote(id, 1);
  await expect(service.execute(q.id, "0")).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  const partial = await service.local(id);
  expect(partial.coverage.retrieved).toBe(35);
  expect(partial.lastError).toBe("RATE_LIMITED");
  expect(quotes).not.toHaveBeenCalled();
  expect(partial.runs.some((r) => r.error_code === "RATE_LIMITED")).toBe(true);
  replies.mockRestore();
  quotes.mockRestore();
  const budget = vi
    .spyOn(provider, "getPostsByIds")
    .mockRejectedValueOnce(new ProviderError("BUDGET_EXCEEDED"));
  const next = await service.quote(id, 1);
  await expect(service.execute(next.id, "0")).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect((await service.local(id)).lastError).toBe("BUDGET_EXCEEDED");
  budget.mockRestore();
});
it("keeps quotes unavailable explicit and marks the known time window without claiming completeness", async () => {
  const caps = await provider.capabilities();
  const spy = vi.spyOn(provider, "capabilities").mockResolvedValueOnce({
    ...caps,
    conversation: { ...caps.conversation, windowSeconds: 60 },
    quotes: { ...caps.quotes, state: "unavailable" },
  });
  const quoteCalls = vi.spyOn(provider, "getQuotePosts");
  clock.time += 1000;
  const q = await service.quote(id, 1, true);
  expect(q.quotes).toBe("unavailable");
  const data = await service.execute(q.id, "0");
  expect(data.coverage.status).toBe("outside_api_window");
  expect(data.quotesAvailable).toBe(false);
  expect(data.coverage.windowNotice).toContain("fenêtre temporelle");
  expect(quoteCalls).not.toHaveBeenCalled();
  spy.mockRestore();
  quoteCalls.mockRestore();
});
it("loads replies with an unavailable root and makes no inference about missing author profiles", async () => {
  const svc = new ConversationService(
    provider,
    repo(owners[2]),
    await config({ mode: "demo" }),
    clock,
  );
  const original = await provider.getPostsByIds([id]);
  const spy = vi.spyOn(provider, "getPostsByIds").mockResolvedValueOnce({
    ...original,
    data: [],
    users: [],
    problems: [{ resourceId: id, code: "PROVIDER_ITEM_ERROR" }],
  });
  const originalConversation = provider.getConversation.bind(provider);
  const search = vi
    .spyOn(provider, "getConversation")
    .mockImplementation(async (id, options) => {
      const page = await originalConversation(id, options);
      return { ...page, data: page.data.filter((p) => p.id !== id) };
    });
  const q = await svc.quote(id, 4, false);
  const result = await svc.execute(q.id, "0");
  expect(result.coverage.retrieved).toBe(35);
  expect(result.coverage.reported).toBeNull();
  expect(result.coverage.percent).toBeNull();
  expect(result.posts.some((p) => p.id === id)).toBe(false);
  search.mockRestore();
  spy.mockRestore();
});
it("rolls back post links, commenter metadata and cursor together on invalid display metadata", async () => {
  const svc = new ConversationService(
    provider,
    repo(owners[3]),
    await config({ mode: "demo" }),
    clock,
  );
  const original = await provider.getPostsByIds([id]);
  const spy = vi.spyOn(provider, "getPostsByIds").mockResolvedValueOnce({
    ...original,
    users: original.users.map((u) => ({ ...u, name: "x".repeat(201) })),
  });
  const q = await svc.quote(id, 1, false);
  await expect(svc.execute(q.id, "0")).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
  const result = await svc.local(id);
  expect(result.posts).toHaveLength(0);
  expect(result.coverage.retrieved).toBe(0);
  expect(result.lastFetchedAt).toBeNull();
  const rows = await pool.query(
    "SELECT c.last_success_at FROM memeradar.x_collection_checkpoints c JOIN memeradar.conversation_views v ON v.rule_id=c.rule_id AND v.data_origin=c.data_origin WHERE v.owner_user_id=$1",
    [owners[3]],
  );
  expect(rows.rows.every((r) => r.last_success_at === null)).toBe(true);
  spy.mockRestore();
});
it("enforces RLS for conversation state and display authors and refuses a destructive downgrade", async () => {
  await pool.query(
    "CREATE ROLE conversation_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query(
    "GRANT USAGE ON SCHEMA memeradar TO conversation_application_test",
  );
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO conversation_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=conversation_application_test",
    max: 1,
  });
  try {
    expect((await repo(owners[0], scoped).read(id)).coverage.retrieved).toBe(
      35,
    );
    await expect(
      repo(owners[0], scoped).read("DEMO_UNKNOWN"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await scoped.query("SELECT * FROM memeradar.conversation_authors")).rows,
    ).toEqual([]);
    expect(
      (await scoped.query("SELECT * FROM memeradar.conversation_views")).rows,
    ).toEqual([]);
  } finally {
    await scoped.end();
  }
  await expect(migrate(pool, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.schema_migrations"))
      .rows[0].count,
  ).toBe("10");
});
it("rejects stale quotes, missing prices, invalid identifiers and unavailable capabilities without content requests", async () => {
  const q = await service.quote(id);
  clock.time += 300001;
  await expect(service.execute(q.id, "0")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(service.quote("1 OR 1=1")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(service.quote(id, 11)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const caps = await provider.capabilities();
  const spy = vi.spyOn(provider, "capabilities").mockResolvedValueOnce({
    ...caps,
    conversation: { ...caps.conversation, state: "unavailable" },
  });
  await expect(service.quote(id)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  spy.mockRestore();
  const realRepo = new PgConversationRepository(
    pool,
    owners[0],
    "REAL",
    new PgXCollectionRepository(pool, owners[0], "REAL"),
  );
  const real = {
    ...provider,
    dataOrigin: "REAL" as const,
    capabilities: () => provider.capabilities(),
  } as unknown as DemoConversationProvider;
  await expect(
    new ConversationService(
      real,
      realRepo,
      { ...(await config()), pricing: null },
      clock,
    ).quote("1"),
  ).rejects.toMatchObject({ code: "PRICING_UNKNOWN" });
});

it("continues through the permitted conversation endpoint when root lookup is unavailable and rejects stale counters", async () => {
  const rootCall = vi
    .spyOn(provider, "getPostsByIds")
    .mockRejectedValueOnce(new ProviderError("ACCESS_DENIED"));
  const q = await service.quote(id, 1, false);
  expect((await service.execute(q.id, "0")).coverage.retrieved).toBe(35);
  rootCall.mockRestore();
  const caps = await provider.capabilities(),
    spy = vi.spyOn(provider, "capabilities").mockResolvedValueOnce({
      ...caps,
      posts: { ...caps.posts, state: "unavailable" },
    });
  const noRootCall = vi.spyOn(provider, "getPostsByIds");
  const without = await service.quote(id, 1, false);
  expect(without.rootLookupAvailable).toBe(false);
  await service.execute(without.id, "0");
  expect(noRootCall).not.toHaveBeenCalled();
  spy.mockRestore();
  noRootCall.mockRestore();
  const repository = repo(),
    rule = await repository.ensure(id, null, true),
    lease = (await repository.collection.claim(
      rule,
      "lookup",
      clock.now(),
      120000,
      true,
      true,
    ))!;
  const page = await provider.getPostsByIds([id]);
  page.data[0] = {
    ...page.data[0],
    collectedAt: "2025-01-01T00:00:00.000Z",
    metrics: { ...page.data[0].metrics, replies: 999 },
  };
  await repository.persist(lease, page, "lookup", clock.now(), 120000);
  await repository.collection.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
  expect((await service.local(id)).coverage.reported).toBe("120");
});

it("estimates REAL requests, expansions and retries without probes and invalidates a changed tariff", async () => {
  const { XApiClient } = await import("../../packages/connectors/x/client");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { FakeTransport } = await import("../fixtures/x/test-tools");
  const cfg = await config(),
    transport = new FakeTransport(),
    real = new XApiClient(cfg, transport, new MemoryControlStore(), { clock });
  const realRepo = new PgConversationRepository(
      pool,
      owners[0],
      "REAL",
      new PgXCollectionRepository(pool, owners[0], "REAL"),
    ),
    svc = new ConversationService(real, realRepo, cfg, clock);
  const quote = await svc.quote("900000000000000000001", 2, true);
  expect(quote.maxRequests).toBe(15);
  expect(quote.maxPosts).toBe(123);
  expect(quote.maxCostMicros).toBe("414");
  expect(transport.calls).toHaveLength(0);
  cfg.pricing = { ...cfg.pricing!, post: "5" };
  await expect(svc.execute(quote.id, "414")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(transport.calls).toHaveLength(0);
});

it("leaves a pool connection available while a conversation lock runs its SQL work", async () => {
  const small = new pg.Pool({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 1000,
  });
  const a = new PgXCollectionRepository(small, owners[0], "DEMO"),
    b = new PgXCollectionRepository(small, owners[0], "DEMO");
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    started = new Promise<void>((r) => {
      ready = r;
    });
  try {
    const first = a.withStreamLock("capacity-one", async () => {
      expect((await small.query("SELECT 1 AS n")).rows[0].n).toBe(1);
      ready();
      await gate;
    });
    await started;
    const work = vi.fn(async () => {});
    expect(await b.withStreamLock("capacity-two", work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
    release();
    expect(await first).toBe(true);
    expect(await b.withStreamLock("capacity-two", work)).toBe(true);
  } finally {
    release();
    await small.end();
  }
});
