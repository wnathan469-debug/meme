import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgEventRepository } from "../../packages/db/event-repository";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { PgConversationRepository } from "../../packages/db/conversation-repository";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { parsePerson } from "../../packages/people/model";
import {
  eventDemoPosts,
  eventTerms,
  eventAt,
  eventDemoWindows,
  officialAttestations,
} from "../../packages/events/demo-data";
import {
  DEMO_EVENT_ID as eventId,
  EVENT_TITLE,
} from "../../packages/events/model";
import type {
  XPage,
  XPost,
  XUser,
} from "../../packages/connectors/x/contracts";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_events";
const pool = new pg.Pool({ connectionString: url.toString() });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const repo = new PgEventRepository(pool, owner, "DEMO"),
  foreign = new PgEventRepository(pool, other, "DEMO"),
  collection = new PgXCollectionRepository(pool, owner, "DEMO");
let ruleId: string, otherRuleId: string, revision: number;
const now = () => Date.now() + 1000;
const users: XUser[] = [
  ...new Map(
    eventDemoPosts
      .filter((p) => p.author)
      .map((p) => [
        p.author!.id,
        {
          id: p.author!.id,
          username: p.author!.username,
          name: p.author!.name,
          protected: false,
          verifiedType: null,
          followers: null,
          observedAt: eventAt(60),
          dataOrigin: "DEMO" as const,
        },
      ]),
  ).values(),
];
const page: XPage<XPost> = {
  data: eventDemoPosts,
  users,
  nextToken: null,
  problems: [],
  quota: null,
  partial: false,
  collectedAt: eventAt(60),
  dataOrigin: "DEMO",
};
const input = () => ({
  terms: eventTerms,
  ruleIds: [ruleId],
  officialAccounts: officialAttestations,
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_events");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','one@example.invalid','$argon2id$fixture'),($2,'DEMO','two@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
  await pool.query(
    "INSERT INTO memeradar.events(id,data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level) VALUES($1,'DEMO',$2,'Fixture','manual',$3,$4,'active','A','HIGH')",
    [eventId, EVENT_TITLE, eventAt(0), eventAt(3)],
  );
  const source = (
    await pool.query(
      "INSERT INTO memeradar.sources(data_origin,type,name,base_url,reliability_tier,reliability_notes) VALUES('DEMO','official_press','[DÉMO] Salle de presse','https://demo.memeradar.invalid/press','A','Fixture') RETURNING id",
    )
  ).rows[0];
  const item = (
    await pool.query(
      "INSERT INTO memeradar.raw_items(data_origin,source_id,external_id,url,canonical_url,title,published_at,fetched_at,content_hash) VALUES('DEMO',$1,'fixture','https://demo.memeradar.invalid/press','https://demo.memeradar.invalid/press','Communiqué',$2,$3,repeat('a',64)) RETURNING id",
      [source.id, eventAt(0), eventAt(3)],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.event_items(data_origin,event_id,raw_item_id,similarity_score,is_origin_candidate) VALUES('DEMO',$1,$2,1,true)",
    [eventId, item.id],
  );
  const rule = await collection.createRule({
    query: "Nébula Mobile",
    status: "active",
  });
  ruleId = rule.id;
  const lease = (await collection.claim(rule, "search", now(), 120000, true))!;
  await collection.ingest(lease, page, "search", now(), 120000);
  await collection.finish(lease, {
    now: now(),
    nextDueAt: now(),
    status: "completed",
  });
  const otherCollection = new PgXCollectionRepository(pool, other, "DEMO"),
    otherRule = await otherCollection.createRule({
      query: "Nébula Mobile",
      status: "active",
    });
  otherRuleId = otherRule.id;
  const otherLease = (await otherCollection.claim(
    otherRule,
    "search",
    now(),
    120000,
    true,
  ))!;
  await otherCollection.ingest(otherLease, page, "search", now(), 120000);
  await otherCollection.finish(otherLease, {
    now: now(),
    nextDueAt: now(),
    status: "completed",
  });
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("configures only owned rules, never infers an official identity from a display name and validates input", async () => {
  await expect(repo.read(eventId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreign.configure(eventId, input())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    repo.configure(eventId, {
      ...input(),
      officialAccounts: [
        {
          ...officialAttestations[0],
          evidenceUrl: "http://demo.memeradar.invalid/a",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(repo.configure(eventId, {})).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const w = await repo.configure(eventId, input());
  revision = w.revision;
  expect(revision).toBe(1);
  await expect(repo.read("invalid")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    repo.read("00000000-0000-4000-8000-999999999999"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(() => new PgEventRepository(pool, "bad", "REAL")).toThrow();
});
it("builds idempotent interpreted links on owned available posts without creating token associations or changing source reliability", async () => {
  const first = await repo.rebuild(eventId),
    second = await repo.rebuild(eventId);
  expect(first).toEqual(second);
  expect(first.linked).toBeGreaterThan(20);
  const data = await repo.read(eventId, new Date(now()).toISOString());
  expect(data.event.reliability).toBe("A");
  expect(data.event.popularity).toBe("HIGH");
  expect(data.posts.some((p) => p.category === "official_attested")).toBe(true);
  expect(data.posts.every((p) => p.type !== "repost")).toBe(true);
  expect(data.posts.every((p) => p.knowledge === "INTERPRETED")).toBe(true);
  expect(data.attention.baselineMean).toBeNull();
  expect(data.attention.buckets.every((b) => b.mentions === null)).toBe(true);
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.token_event_links"))
      .rows[0].count,
  ).toBe("0");
  expect(
    (
      await pool.query(
        "SELECT DISTINCT knowledge_kind FROM memeradar.post_event_links",
      )
    ).rows,
  ).toEqual([{ knowledge_kind: "INTERPRETED" }]);
  const person = users.find((u) => u.id === "DEMO_USER_A")!;
  await new PgPeopleRepository(pool, owner, "DEMO").save(
    parsePerson(
      { username: person.username, privateNote: "PRIVATE_EVENT_TEST" },
      "DEMO",
    ),
    person,
    "validated_via_api",
  );
  expect(
    (await repo.read(eventId)).posts.some((p) => p.category === "followed"),
  ).toBe(true);
  expect(JSON.stringify(await repo.read(eventId))).not.toContain(
    "PRIVATE_EVENT_TEST",
  );
});
it("does not borrow another owner's links through search, conversations, people or RLS-bypassed test connections", async () => {
  const otherCollection = new PgXCollectionRepository(pool, other, "DEMO");
  expect((await otherCollection.localSearch({ eventId })).posts).toEqual([]);
  expect(
    (await collection.localSearch({ eventId })).posts.length,
  ).toBeGreaterThan(0);
  await foreign.configure(eventId, {
    terms: [{ kind: "phrase", text: "Jamais mentionné" }],
    ruleIds: [otherRuleId],
  });
  expect((await foreign.rebuild(eventId)).linked).toBe(0);
  for (const [user, c] of [
    [owner, collection],
    [other, otherCollection],
  ] as const) {
    const conversations = new PgConversationRepository(pool, user, "DEMO", c),
      rule = await conversations.ensure("DEMO_POST_ROOT", null, true),
      lease = (await c.claim(rule, "conversation", now(), 120000, true, true))!;
    await conversations.persist(lease, page, "conversation", now(), 120000);
    await c.finish(lease, {
      now: now(),
      nextDueAt: now(),
      status: "completed",
    });
    const snapshot = await conversations.read("DEMO_POST_ROOT");
    expect(
      snapshot.posts
        .find((p) => p.id === "DEMO_POST_ROOT")
        ?.eventIds.includes(eventId),
    ).toBe(user === owner);
  }
});
it("requires positive coverage for every rule, preserves documented gaps and rejects future or stale attestations", async () => {
  await expect(
    repo.recordCoverage(eventId, {
      ruleId,
      revision,
      start: eventAt(0),
      end: eventAt(-1),
      status: "observed",
      reason: "x",
      method: "demo_fixture",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.recordCoverage(eventId, {
      ruleId,
      revision,
      start: eventAt(0),
      end: new Date(Date.now() + 86400000).toISOString(),
      status: "observed",
      reason: "x",
      method: "demo_fixture",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.recordCoverage(eventId, {
      ruleId: otherRuleId,
      revision,
      start: eventAt(0),
      end: eventAt(5),
      status: "observed",
      reason: "x",
      method: "demo_fixture",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const w of eventDemoWindows)
    await repo.recordCoverage(eventId, {
      ...w,
      ruleId,
      revision,
      method: "demo_fixture",
    });
  const data = await repo.read(eventId, new Date(now()).toISOString());
  expect(data.attention.baselineMean).toBe("1");
  expect(
    data.attention.after.find((b) => b.relativeMinutes === 15)?.mentions,
  ).toBeNull();
  expect(
    data.attention.after.find((b) => b.relativeMinutes === 15)?.lowerBound,
  ).toBeGreaterThan(0);
  expect(
    data.attention.after.find((b) => b.relativeMinutes === 55)?.mentions,
  ).toBe(0);
  expect(data.attention.after.some((b) => b.multiplier !== null)).toBe(true);
  const old = await repo.read(eventId, eventAt(60));
  expect(old.attention.baselineMean).toBeNull();
  await expect(repo.read(eventId, "bad")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("builds dated provenance for first X, followed mentions, detection and only pre-recorded exact token evidence", async () => {
  const chain = (
    await pool.query(
      "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
    )
  ).rows[0];
  const token = (
    await pool.query(
      "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,name,created_at_onchain,first_seen_by_app_at) VALUES('DEMO',$1,'0xDEMO'||repeat('0',34)||'42','[DÉMO] Étincelle',$2,$3) RETURNING id",
      [chain.id, eventAt(8), eventAt(9)],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.token_event_links(data_origin,token_id,event_id,confidence_level,reasons,counter_reasons,impersonation_flags,algorithm_version,computed_at) VALUES('DEMO',$1,$2,'PLAUSIBLE','[]','[]','[]','fixture',now())",
    [token.id, eventId],
  );
  const post = (
    await pool.query(
      "SELECT id FROM memeradar.x_posts WHERE x_post_id='DEMO_EVENT_AFTER_8'",
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.post_token_mentions(data_origin,post_id,token_id,detection_method,confidence) VALUES('DEMO',$1,$2,'exact_address',0.7)",
    [post.id, token.id],
  );
  const data = await repo.read(eventId);
  expect(data.timeline.find((t) => t.kind === "first_x")?.at).toBe(
    eventAt(-29),
  );
  expect(data.timeline.find((t) => t.kind === "app_detection")?.at).toBe(
    eventAt(3),
  );
  expect(
    data.timeline.find((t) => t.kind === "original_signal")?.source,
  ).toContain("Salle de presse");
  expect(data.timeline.find((t) => t.kind === "token_creation")?.at).toBe(
    eventAt(8),
  );
  expect(data.timeline.find((t) => t.kind === "first_token_mention")?.at).toBe(
    eventAt(12),
  );
  expect(
    (
      await new PgPeopleRepository(pool, owner, "DEMO").detail(
        (await new PgPeopleRepository(pool, owner, "DEMO").list())[0].id,
      )
    ).events.some((e) => e.event_id === eventId),
  ).toBe(true);
});
it("invalidates baseline evidence after a query or scope changes and hides obsolete link revisions", async () => {
  await pool.query(
    "UPDATE memeradar.x_rules SET query='nouveau périmètre' WHERE id=$1",
    [ruleId],
  );
  expect((await repo.read(eventId)).scopeChanged).toBe(true);
  expect((await repo.read(eventId)).attention.baselineMean).toBeNull();
  await expect(
    repo.recordCoverage(eventId, {
      ruleId,
      revision,
      start: eventAt(0),
      end: eventAt(5),
      status: "observed",
      reason: "x",
      method: "operator_verified",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const w = await repo.configure(eventId, input());
  expect(w.revision).toBe(2);
  revision = w.revision;
  expect((await collection.localSearch({ eventId })).posts).toEqual([]);
  expect((await repo.read(eventId)).attention.baselineMean).toBeNull();
  await repo.rebuild(eventId);
  expect(
    (await collection.localSearch({ eventId })).posts.length,
  ).toBeGreaterThan(0);
  await expect(
    repo.recordCoverage(eventId, {
      ruleId,
      revision: 1,
      start: eventAt(0),
      end: eventAt(5),
      status: "observed",
      reason: "x",
      method: "operator_verified",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("creates owner-private event alert rules with execution disabled until the alert-engine phase", async () => {
  for (const subjectType of [
    "topic",
    "company",
    "person",
    "keyword",
    "hashtag",
  ]) {
    const a = await repo.createAlert(eventId, {
      subjectType,
      subject: "Nébula",
    });
    expect(a.enabled).toBe(false);
    expect(a.conditions.event_id).toBe(eventId);
  }
  expect((await repo.read(eventId)).alerts).toHaveLength(5);
  expect((await foreign.read(eventId)).alerts).toHaveLength(0);
  await expect(
    repo.createAlert(eventId, { subjectType: "unknown", subject: "" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("keeps interruption evidence separate from publication-time coverage and checks non-bypass role access", async () => {
  const rule = (await collection.rules()).find((r) => r.id === ruleId)!,
    lease = (await collection.claim(rule, "search", now(), 120000, true))!;
  await collection.finish(lease, {
    now: now(),
    nextDueAt: now(),
    status: "failed",
    errorCode: "RATE_LIMITED",
  });
  expect(
    (
      await repo.read(eventId, new Date(now()).toISOString())
    ).interruptions.some((r) => r.error_code === "RATE_LIMITED"),
  ).toBe(true);
  await pool.query(
    "CREATE ROLE event_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO event_application_test");
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO event_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=event_application_test",
    max: 2,
  });
  try {
    expect(
      (await new PgEventRepository(scoped, owner, "DEMO").read(eventId)).alerts,
    ).toHaveLength(5);
    expect(
      (await new PgEventRepository(scoped, other, "DEMO").read(eventId)).posts,
    ).toHaveLength(0);
    for (const table of [
      "event_watches",
      "event_watch_rules",
      "event_coverage_windows",
      "post_event_links",
      "alert_rules",
    ])
      expect(
        (await scoped.query(`SELECT * FROM memeradar.${table}`)).rows,
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
  ).toBe("11");
});

it("reuses only same-conversation display identities without creating a global commenter profile", async () => {
  const conversations = new PgConversationRepository(
      pool,
      owner,
      "DEMO",
      collection,
    ),
    rule = await conversations.ensure("DEMO_POST_ROOT", null, false),
    lease = (await collection.claim(
      rule,
      "conversation",
      now(),
      120000,
      true,
      true,
    ))!;
  const post = {
    ...page.data[0],
    id: "DEMO_EVENT_MINIMAL_POST",
    publishedAt: eventAt(5),
    authorId: "DEMO_EVENT_MINIMAL_USER",
    conversationId: "DEMO_POST_ROOT",
    text: "[DÉMO] Nébula Mobile mention contextuelle",
    type: "reply" as const,
    references: [{ id: "DEMO_POST_ROOT", type: "replied_to" as const }],
    collectedAt: new Date(now()).toISOString(),
  };
  await conversations.persist(
    lease,
    {
      ...page,
      data: [post],
      users: [
        {
          ...users[0],
          id: post.authorId,
          username: "demo_minimal",
          name: "[DÉMO] Nom fourni dans cette conversation",
        },
      ],
    },
    "conversation",
    now(),
    120000,
  );
  await collection.finish(lease, {
    now: now(),
    nextDueAt: now(),
    status: "completed",
  });
  await repo.configure(eventId, { ...input(), ruleIds: [rule.id] });
  await repo.rebuild(eventId);
  const result = await repo.read(eventId, new Date(now()).toISOString());
  expect(result.posts.find((p) => p.id === post.id)?.name).toBe(
    "[DÉMO] Nom fourni dans cette conversation",
  );
  expect(
    (
      await pool.query("SELECT * FROM memeradar.x_users WHERE x_user_id=$1", [
        post.authorId,
      ])
    ).rows,
  ).toEqual([]);
});
