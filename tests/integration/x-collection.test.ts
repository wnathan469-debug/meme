import { beforeAll, afterAll, it, expect, vi } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import {
  XCollector,
  type CollectorOptions,
} from "../../packages/collection/collector";
import { XSearchService } from "../../packages/collection/search-service";
import { FeedHub } from "../../packages/collection/feed";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { FakeClock, config } from "../fixtures/x/test-tools";
import type {
  XPage,
  XPost,
  XUser,
  XProvider,
} from "../../packages/connectors/x/contracts";
const rootUrl = process.env.TEST_DATABASE_URL;
if (!rootUrl) throw new Error("Use npm run test:db:v2");
const admin = new pg.Pool({ connectionString: rootUrl });
const dbUrl = new URL(rootUrl);
dbUrl.pathname = "/memeradar_collection";
const pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 12 });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const clock = new FakeClock();
clock.time = Date.now() + 1000;
const hub = new FeedHub(),
  repo = new PgXCollectionRepository(pool, owner, "DEMO", hub);
const options: CollectorOptions = {
  mode: "polling",
  maxPages: 3,
  maxResults: 2,
  leaseMs: 120000,
  defaultIntervalSeconds: 1,
  highPriorityIntervalSeconds: 1,
  maxReconnects: 1,
};
function user(id = "DEMO_A"): XUser {
  return {
    id,
    username: "demo_" + id,
    name: "[DÉMO] Personne",
    protected: false,
    verifiedType: null,
    followers: null,
    observedAt: new Date(clock.now()).toISOString(),
    dataOrigin: "DEMO",
  };
}
function post(
  id: string,
  text = "[DÉMO] annonce boréale",
  author = "DEMO_A",
): XPost {
  return {
    id,
    text,
    authorId: author,
    publishedAt: new Date(clock.now()).toISOString(),
    collectedAt: new Date(clock.now()).toISOString(),
    conversationId: id,
    references: [],
    type: "original",
    language: "fr",
    metrics: { likes: 4, replies: 2, reposts: null, quotes: null },
    entities: { hashtags: ["Boréale"], cashtags: [], mentions: [], urls: [] },
    dataOrigin: "DEMO",
    knowledge: "OBSERVED",
  };
}
function page(data: XPost[], nextToken: string | null = null): XPage<XPost> {
  return {
    data,
    users: [...new Set(data.map((p) => p.authorId))]
      .filter((id): id is string => !!id)
      .map(user),
    nextToken,
    problems: [],
    quota: null,
    partial: false,
    collectedAt: new Date(clock.now()).toISOString(),
    dataOrigin: "DEMO",
  };
}
beforeAll(async () => {
  for (let i = 0; i < 50; i++) {
    try {
      await admin.query("SELECT 1");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  await admin.query("CREATE DATABASE memeradar_collection");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','one@example.invalid','$argon2id$fixture'),($2,'DEMO','two@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("persists one identity across search, stream and conversation with merged links and no repost inflation", async () => {
  const rule = await repo.createRule({ query: "boréale", status: "active" });
  const root = post("DEMO_MULTI_ROOT"),
    repost = {
      ...post("DEMO_MULTI_REPOST"),
      type: "repost" as const,
      references: [{ id: root.id, type: "retweeted" as const }],
    };
  for (const mode of ["search", "stream", "conversation"] as const) {
    const lease = (await repo.claim(rule, mode, clock.now(), 120000, true))!;
    const result = await repo.ingest(
      lease,
      page([root, repost]),
      mode,
      clock.now(),
      120000,
    );
    expect(result.reposts).toBe(1);
    expect(result.newPosts).toBe(mode === "search" ? 2 : 0);
    await repo.finish(lease, {
      now: clock.now(),
      nextDueAt: clock.now(),
      status: "completed",
    });
  }
  const found = await repo.localSearch({ ruleId: rule.id });
  expect(found.posts).toHaveLength(2);
  expect(found.posts.every((p) => p.collection_modes.length === 3)).toBe(true);
  expect(
    (await repo.localSearch({ ruleId: rule.id, type: "original" })).posts,
  ).toHaveLength(1);
  expect(
    (await repo.localSearch({ ruleId: rule.id, type: "repost" })).posts,
  ).toHaveLength(1);
});
it("checkpoints only committed pages, resumes pagination and rejects expired worker results", async () => {
  const rule = await repo.createRule({ query: "pages", status: "active" }),
    lease = (await repo.claim(rule, "search", clock.now(), 1000, true))!;
  expect(await repo.claim(rule, "search", clock.now(), 1000, true)).toBeNull();
  expect(
    (
      await pool.query(
        "SELECT next_due_at FROM memeradar.x_collection_checkpoints WHERE rule_id=$1",
        [rule.id],
      )
    ).rows[0].next_due_at.getTime(),
  ).toBe(clock.now());
  await repo.ingest(
    lease,
    page([post("DEMO_PAGE_01")], "page-two"),
    "search",
    clock.now(),
    1000,
  );
  const cp = (
    await pool.query(
      "SELECT since_id,pending_since_id,next_token FROM memeradar.x_collection_checkpoints WHERE rule_id=$1",
      [rule.id],
    )
  ).rows[0];
  expect(cp).toEqual({
    since_id: null,
    pending_since_id: "DEMO_PAGE_01",
    next_token: "page-two",
  });
  clock.time += 1001;
  const successor = (await repo.claim(
    rule,
    "search",
    clock.now(),
    120000,
    true,
  ))!;
  expect(successor.checkpoint.nextToken).toBe("page-two");
  await expect(
    repo.ingest(lease, page([post("DEMO_STALE")]), "search", clock.now(), 1000),
  ).rejects.toMatchObject({ code: "COLLECTION_LEASE_LOST" });
  await repo.ingest(
    successor,
    page([post("DEMO_PAGE_02")]),
    "search",
    clock.now(),
    120000,
  );
  const finished = (
    await pool.query(
      "SELECT since_id,pending_since_id,next_token FROM memeradar.x_collection_checkpoints WHERE rule_id=$1",
      [rule.id],
    )
  ).rows[0];
  expect(finished).toEqual({
    since_id: "DEMO_PAGE_02",
    pending_since_id: null,
    next_token: null,
  });
  await repo.finish(successor, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
  expect(
    (
      await pool.query(
        "SELECT status FROM memeradar.x_collection_runs WHERE id=$1",
        [lease.runId],
      )
    ).rows[0].status,
  ).toBe("interrupted");
});
it("does not advance the cursor or publish a feed event when a page is invalid", async () => {
  const rule = await repo.createRule({ query: "atomic", status: "active" }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  const notify = vi.fn(),
    subscription = hub.subscribe(owner, "DEMO", notify);
  const bad = { ...post("DEMO_BAD_ORIGIN"), dataOrigin: "REAL" as const };
  await expect(
    repo.ingest(lease, page([bad]), "search", clock.now(), 120000),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(
    (
      await pool.query(
        "SELECT since_id FROM memeradar.x_collection_checkpoints WHERE rule_id=$1",
        [rule.id],
      )
    ).rows[0].since_id,
  ).toBeNull();
  expect(notify).not.toHaveBeenCalled();
  subscription.close();
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "failed",
    errorCode: "INVALID_RESPONSE",
  });
});
it("merges equal query and cursor states into one paid-provider call and respects pause/due times", async () => {
  await pool.query("UPDATE memeradar.x_rules SET status='paused'");
  const a = await repo.createRule({
      query: "fict",
      status: "active",
      intervalSeconds: 1,
    }),
    b = await repo.createRule({
      query: "fict",
      status: "active",
      intervalSeconds: 1,
    });
  const provider = new DemoXProvider(clock),
    search = vi.spyOn(provider, "searchRecent");
  const collector = new XCollector(
    provider,
    repo,
    { ...options, maxResults: 100 },
    clock,
  );
  const result = await collector.tick();
  expect(result.calls).toBe(1);
  expect(search).toHaveBeenCalledOnce();
  expect(
    (await repo.localSearch({ ruleId: a.id })).posts.length,
  ).toBeGreaterThan(0);
  expect(
    (await repo.localSearch({ ruleId: b.id })).posts.length,
  ).toBeGreaterThan(0);
  expect((await collector.tick()).calls).toBe(0);
  clock.time += 1001;
  await collector.tick();
  expect(search.mock.calls[1][1]?.sinceId).toBe("DEMO_POST_QUOTE");
  await pool.query(
    "UPDATE memeradar.x_rules SET status='paused' WHERE id=ANY($1::uuid[])",
    [[a.id, b.id]],
  );
});
it("searches locally with bound parameters, keyset paging, language, hashtag and candidate-address filters", async () => {
  const rule = await repo.createRule({ query: "filters", status: "active" }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  const a = post(
      "DEMO_FILTER_A",
      "[DÉMO] Boréale " + "0xDEMO" + "0".repeat(36),
    ),
    b = { ...post("DEMO_FILTER_B", "[DÉMO] Boréale"), language: "en" };
  await repo.ingest(lease, page([a, b]), "search", clock.now(), 120000);
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
  expect(
    (await repo.localSearch({ text: "Boréale", ruleId: rule.id })).posts,
  ).toHaveLength(2);
  expect(
    (
      await repo.localSearch({
        ruleId: rule.id,
        language: "fr",
        hashtag: "boréale",
        hasAddress: true,
        minInteractions: "6",
      })
    ).posts,
  ).toHaveLength(1);
  expect(
    (await repo.localSearch({ ruleId: rule.id, text: "' OR 1=1 --" })).posts,
  ).toHaveLength(0);
  const first = await repo.localSearch({ ruleId: rule.id, limit: 1 });
  expect(first.nextCursor).toBeTruthy();
  const second = await repo.localSearch({
    ruleId: rule.id,
    limit: 1,
    cursor: first.nextCursor!,
  });
  expect(second.posts[0].id).not.toBe(first.posts[0].id);
  await expect(repo.localSearch({ cursor: "invalid" })).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(
    (
      await new PgXCollectionRepository(pool, other, "DEMO").localSearch({
        ruleId: rule.id,
      })
    ).posts,
  ).toHaveLength(0);
});
it("marks equal text from different authors as a possible signal without merging posts", async () => {
  const rule = await repo.createRule({ query: "duplicate", status: "active" }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  await repo.ingest(
    lease,
    page([
      post("DEMO_DUP_A", "[DÉMO] Même texte", "DEMO_A"),
      post("DEMO_DUP_B", "[DÉMO]   Même TEXTE", "DEMO_B"),
    ]),
    "search",
    clock.now(),
    120000,
  );
  const signals = await repo.duplicateSignals({ ruleId: rule.id });
  expect(signals).toHaveLength(1);
  expect(signals[0]).toMatchObject({
    publications: "2",
    authors: "2",
    knowledge: "INTERPRETED",
  });
  expect((await repo.localSearch({ ruleId: rule.id })).posts).toHaveLength(2);
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
});
it("requires an owner-bound expiring single-use cost quote before remote search and stores its results", async () => {
  const provider = new DemoXProvider(clock),
    search = vi.spyOn(provider, "searchRecent"),
    service = new XSearchService(
      provider,
      repo,
      await config({ mode: "demo" }),
      clock,
    );
  const quote = await service.quote("fict");
  expect(quote.maxCostMicros).toBe("0");
  expect(search).not.toHaveBeenCalled();
  await expect(service.execute(quote.id, "1")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const result = await service.execute(quote.id, "0");
  expect(result.source).toBe("x_api");
  expect(
    (await service.local({ ruleId: result.ruleId })).posts.length,
  ).toBeGreaterThan(0);
  await expect(service.execute(quote.id, "0")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const expired = await service.quote("fict");
  clock.time += 300001;
  await expect(service.execute(expired.id, "0")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("hides unavailable content, and a stale page cannot restore it", async () => {
  const rule = await repo.createRule({
      query: "availability",
      status: "active",
    }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!,
    data = post("DEMO_AVAILABILITY");
  await repo.ingest(lease, page([data]), "search", clock.now(), 120000);
  await repo.hideUnavailable([data.id], clock.now() + 1000);
  expect((await repo.localSearch({ ruleId: rule.id })).posts).toHaveLength(0);
  await repo.ingest(lease, page([data]), "search", clock.now(), 120000);
  expect((await repo.localSearch({ ruleId: rule.id })).posts).toHaveLength(0);
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
});
it("takes a shared stream lock and releases it on errors", async () => {
  const second = new PgXCollectionRepository(pool, other, "DEMO");
  let held = false;
  await expect(
    repo.withStreamLock("account", async () => {
      held = true;
      expect(await second.withStreamLock("account", async () => {})).toBe(
        false,
      );
      throw new Error("fixture");
    }),
  ).rejects.toThrow("fixture");
  expect(held).toBe(true);
  expect(await second.withStreamLock("account", async () => {})).toBe(true);
});

it("filters by a tracked person, category, linked event and exact token identity", async () => {
  const rule = await repo.createRule({ query: "relations", status: "active" }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  await repo.ingest(
    lease,
    page([post("DEMO_RELATIONS")]),
    "search",
    clock.now(),
    120000,
  );
  const id = (await repo.localSearch({ ruleId: rule.id })).posts[0].id;
  const category = (
    await pool.query(
      "INSERT INTO memeradar.person_categories(data_origin,owner_user_id,name) VALUES('DEMO',$1,'Fixture catégorie') RETURNING id",
      [owner],
    )
  ).rows[0];
  const person = (
    await pool.query(
      "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,x_user_id,requested_username,category_id) VALUES('DEMO',$1,'DEMO_A','demo_person',$2) RETURNING id",
      [owner, category.id],
    )
  ).rows[0];
  const event = (
    await pool.query(
      "INSERT INTO memeradar.events(data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level) VALUES('DEMO','[DÉMO] Événement','Fixture','manual',now(),now(),'active','B','LOW') RETURNING id",
    )
  ).rows[0];
  const chain = (
    await pool.query(
      "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
    )
  ).rows[0];
  const token = (
    await pool.query(
      "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('DEMO',$1,'0xDEMO'||repeat('0',35)||'1',now()) RETURNING id",
      [chain.id],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.post_event_links(data_origin,post_id,event_id,score,method) VALUES('DEMO',$1,$2,0.1,'fixture')",
    [id, event.id],
  );
  await pool.query(
    "INSERT INTO memeradar.post_token_mentions(data_origin,post_id,token_id,detection_method,confidence) VALUES('DEMO',$1,$2,'name',0.1)",
    [id, token.id],
  );
  expect(
    (
      await repo.localSearch({
        ruleId: rule.id,
        personId: person.id,
        categoryId: category.id,
        eventId: event.id,
        tokenId: token.id,
        authorId: "DEMO_A",
        type: "original",
        keyword: "annonce",
        since: "2020-01-01T00:00:00.000Z",
        until: "2030-01-01T00:00:00.000Z",
        hasAddress: false,
      })
    ).posts,
  ).toHaveLength(1);
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
});
it("quotes the conservative REAL cost without a probe, enforces changed pricing and hides absent content", async () => {
  const realOwner = "00000000-0000-4000-8000-000000000003";
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'REAL','synthetic-real@example.invalid','$argon2id$fixture')",
    [realOwner],
  );
  const { XApiClient } = await import("../../packages/connectors/x/client");
  const { DurableXControlStore } =
    await import("../../packages/db/x-control-store");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { FakeTransport, reply } = await import("../fixtures/x/test-tools");
  const cfg = await config(),
    transport = new FakeTransport(),
    store = new DurableXControlStore(
      pool,
      new MemoryControlStore(),
      "collection-test",
    );
  const provider = new XApiClient(cfg, transport, store, { clock }),
    realRepo = new PgXCollectionRepository(pool, realOwner, "REAL"),
    service = new XSearchService(provider, realRepo, cfg, clock);
  const quote = await service.quote("fixture");
  expect(quote.maxCostMicros).toBe("99");
  expect(transport.calls).toHaveLength(0);
  expect((await service.execute(quote.id, "99")).newPosts).toBe(1);
  const stale = await service.quote("fixture");
  cfg.pricing!.request = "4";
  await expect(
    service.execute(stale.id, stale.maxCostMicros),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  cfg.pricing!.request = "3";
  const id = (await realRepo.localSearch({})).posts[0].x_post_id;
  clock.time += 10;
  transport.replies.push(reply({ data: [], errors: [{ resource_id: id }] }));
  expect(await service.refreshAvailability([id])).toMatchObject({
    hidden: 1,
    status: "unknown",
  });
  expect((await realRepo.localSearch({})).posts).toHaveLength(0);
  await expect(service.refreshAvailability([])).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const failed = await service.quote("fixture");
  transport.replies.push(reply({}, 403));
  await expect(
    service.execute(failed.id, failed.maxCostMicros),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(service.quote("fixture")).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
});
it("resets an invalid pagination token without skipping the original high-water mark and honors a pause", async () => {
  const rule = await repo.createRule({
      query: "reset-token",
      status: "active",
    }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  await repo.ingest(
    lease,
    page([post("DEMO_RESET_1")], "bad-token"),
    "search",
    clock.now(),
    120000,
  );
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "failed",
    errorCode: "INVALID_INPUT",
  });
  const next = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  expect(next.checkpoint).toMatchObject({
    sinceId: null,
    nextToken: null,
    pendingSinceId: null,
  });
  await pool.query("UPDATE memeradar.x_rules SET status='paused' WHERE id=$1", [
    rule.id,
  ]);
  await expect(
    repo.ingest(
      next,
      page([post("DEMO_RESET_2")]),
      "search",
      clock.now(),
      120000,
    ),
  ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  await repo.finish(next, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "interrupted",
    errorCode: "NETWORK_DISABLED",
  });
  expect(
    await repo.claim(rule, "search", clock.now(), 120000, true),
  ).toBeNull();
});

it("retains an unresolved author reference without inventing a profile and keeps unknown types separate", async () => {
  const rule = await repo.createRule({
      query: "unknown-author",
      status: "active",
    }),
    lease = (await repo.claim(rule, "search", clock.now(), 120000, true))!;
  const unknown = {
    ...post(
      "DEMO_UNKNOWN_AUTHOR",
      "[DÉMO] Compte non récupéré",
      "DEMO_UNFETCHED",
    ),
    type: "unknown" as const,
  };
  const response = { ...page([unknown]), users: [] };
  const result = await repo.ingest(
    lease,
    response,
    "search",
    clock.now(),
    120000,
  );
  expect(result).toMatchObject({ originals: 0, reposts: 0, unknown: 1 });
  const found = (
    await repo.localSearch({ ruleId: rule.id, authorId: "DEMO_UNFETCHED" })
  ).posts[0];
  expect(found.author_x_user_id).toBeNull();
  expect(found.unresolved_author_x_user_id).toBe("DEMO_UNFETCHED");
  expect(
    (
      await pool.query(
        "SELECT 1 FROM memeradar.x_users WHERE x_user_id='DEMO_UNFETCHED'",
      )
    ).rows,
  ).toHaveLength(0);
  await repo.finish(lease, {
    now: clock.now(),
    nextDueAt: clock.now(),
    status: "completed",
  });
});

it("composes an executable DEMO worker and searches its committed results without Redis or X", async () => {
  const { createXWorker } = await import("../../apps/worker/x-worker");
  const { Secret } = await import("../../packages/shared/runtime");
  await pool.query("UPDATE memeradar.x_rules SET status='paused'");
  const base = await config({
    mode: "demo",
    databaseUrl: new Secret(dbUrl.toString()),
  });
  base.collection.mode = "polling";
  const worker = await createXWorker(base, owner);
  try {
    const rule = await worker.repository.createRule({
      query: "fict",
      status: "active",
    });
    const result = await worker.collector.tick();
    expect(result.calls).toBe(2);
    expect((await worker.search.local({ ruleId: rule.id })).posts).toHaveLength(
      20,
    );
    expect(worker.collector.status.mode).toBe("demo");
  } finally {
    await worker.close();
  }
});
