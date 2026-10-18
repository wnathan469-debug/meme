import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgSocialRepository } from "../../packages/db/social-repository";
import { PgEventRepository } from "../../packages/db/event-repository";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { PgConversationRepository } from "../../packages/db/conversation-repository";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { parsePerson } from "../../packages/people/model";
import type {
  XPost,
  XPage,
  XUser,
} from "../../packages/connectors/x/contracts";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_social";
const pool = new pg.Pool({ connectionString: url.toString() }),
  owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  event = "00000000-0000-4000-8000-000000000060";
const repo = new PgSocialRepository(pool, owner, "DEMO"),
  foreign = new PgSocialRepository(pool, other, "DEMO"),
  events = new PgEventRepository(pool, owner, "DEMO"),
  collection = new PgXCollectionRepository(pool, owner, "DEMO"),
  otherCollection = new PgXCollectionRepository(pool, other, "DEMO");
const at = (n: number) => new Date(Date.UTC(2026, 0, 15, 14, n)).toISOString(),
  address = "0xDEMO" + "0".repeat(34) + "42";
let rule: any, otherRule: any, token: string, eth: string, personId: string;
const users: XUser[] = [
  {
    id: "DEMO_AUTHOR",
    username: "demo_official",
    name: "[DÉMO] Officiel",
    protected: false,
    verifiedType: null,
    followers: null,
    observedAt: at(60),
    dataOrigin: "DEMO",
  },
];
const make = (id: string, text: string, m = 2): XPost => ({
  id,
  text,
  authorId: users[0].id,
  publishedAt: at(m),
  collectedAt: at(60),
  type: "reply",
  conversationId: "DEMO_ROOT",
  references: [{ id: "DEMO_ROOT", type: "replied_to" }],
  language: "fr",
  metrics: { likes: null, replies: null, reposts: null, quotes: null },
  entities: { hashtags: [], cashtags: [], mentions: [], urls: [] },
  dataOrigin: "DEMO",
  knowledge: "OBSERVED",
});
let posts = [
  make(
    "DEMO_SOCIAL_EXACT",
    `Nébula Mobile : ${address} https://demo.memeradar.invalid/token/base/${address}`,
    2,
  ),
  make("DEMO_SOCIAL_TAG", "Nébula Mobile $NEB", 1),
  make(
    "DEMO_SOCIAL_URL",
    `Nébula Mobile https://demo.memeradar.invalid/token/base/${address}`,
    3,
  ),
  make("DEMO_SOCIAL_UNKNOWN", `Nébula Mobile ${address}`, 4),
  {
    ...make("DEMO_SOCIAL_REPOST", `Nébula Mobile ${address}`, 0),
    type: "repost" as const,
    references: [{ id: "DEMO_SOCIAL_EXACT", type: "retweeted" as const }],
  },
];
async function ingest(c: PgXCollectionRepository, r: any, data: XPost[]) {
  const now = Date.now() + 1000,
    lease = (await c.claim(r, "search", now, 120000, true))!;
  const page: XPage<XPost> = {
    data,
    users,
    nextToken: null,
    problems: [],
    quota: null,
    partial: false,
    collectedAt: new Date(now).toISOString(),
    dataOrigin: "DEMO",
  };
  await c.ingest(lease, page, "search", now, 120000);
  await c.finish(lease, { now, nextDueAt: now, status: "completed" });
}
const attest = (postId = "DEMO_SOCIAL_EXACT") => ({
  eventId: event,
  tokenId: token,
  postId,
  purpose: "contract_publication",
  reviewedAt: new Date().toISOString(),
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_social");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','a@example.invalid','$argon2id$fixture'),($2,'DEMO','b@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
  await pool.query(
    "INSERT INTO memeradar.events(id,data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level) VALUES($1,'DEMO','Nébula Mobile','Fixture','manual',$2,$3,'active','A','HIGH')",
    [event, at(0), at(1)],
  );
  for (const [slug, id] of [
    ["base", 8453],
    ["ethereum", 1],
  ] as const) {
    const ch = (
      await pool.query(
        "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO',$1,'evm',$2,'https://demo.memeradar.invalid/explorer') RETURNING id",
        [slug, id],
      )
    ).rows[0];
    const t = (
      await pool.query(
        "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,name,symbol,created_at_onchain,first_seen_by_app_at) VALUES('DEMO',$1,$2,'Nébula Mobile officiel','NEB',$3,$4) RETURNING id",
        [ch.id, address, at(-5), at(1)],
      )
    ).rows[0];
    if (slug === "base") token = t.id;
    else eth = t.id;
  }
  rule = await collection.createRule({
    query: "Nébula Mobile",
    status: "active",
  });
  otherRule = await otherCollection.createRule({
    query: "Nébula Mobile",
    status: "active",
  });
  await ingest(collection, rule, posts);
  await ingest(otherCollection, otherRule, posts);
  await events.configure(event, {
    terms: [{ kind: "phrase", text: "Nébula Mobile" }],
    ruleIds: [rule.id],
    officialAccounts: [
      {
        userId: users[0].id,
        evidenceUrl: "https://demo.memeradar.invalid/official",
        reviewedAt: at(0),
      },
    ],
  });
  await events.rebuild(event);
  await new PgEventRepository(pool, other, "DEMO").configure(event, {
    terms: [{ kind: "phrase", text: "Nébula Mobile" }],
    ruleIds: [otherRule.id],
  });
  personId = (
    await new PgPeopleRepository(pool, owner, "DEMO").save(
      parsePerson(
        { username: users[0].username, privateNote: "PRIVATE_SOCIAL_NOTE" },
        "DEMO",
      ),
      users[0],
      "validated_via_api",
    )
  ).person.id;
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("validates UUIDs, context, ownership and missing registry entries without network", async () => {
  expect(() => new PgSocialRepository(pool, "bad", "REAL")).toThrow();
  for (const raw of [
    { contextChain: "base" },
    { ruleId: "bad" },
    { ruleId: rule.id, contextChain: "bad" },
  ])
    await expect(repo.rebuild(raw)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  await expect(foreign.rebuild({ ruleId: rule.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(repo.read("bad", event)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(repo.read(token, event, "bad")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    repo.read("00000000-0000-4000-8000-999999999999", event),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("extracts idempotently, resolves exact chain/address, stores ambiguous candidates and never treats cashtags as exact", async () => {
  const first = await repo.rebuild(),
    second = await repo.rebuild();
  expect(first).toEqual(second);
  expect(first.networkCalls).toBe(0);
  expect((await repo.forEvent(event)).map((s) => s.token.id)).toEqual([token]);
  expect(await foreign.forEvent(event)).toEqual([]);
  await expect(repo.forEvent("bad")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    repo.forEvent("00000000-0000-4000-8000-999999999999"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(first.unresolved).toBe(1);
  const base = await repo.read(token, event);
  expect(base.level).toBe("PLAUSIBLE");
  expect(base.first_social_seen_at).toBe(at(2));
  expect(base.first_social_post_id).toBe("DEMO_SOCIAL_EXACT");
  expect(base.counterReasons.join()).toContain("avant");
  const ethereum = await repo.read(eth, event);
  expect(ethereum.level).toBe("INSUFFICIENT_DATA");
  expect(ethereum.first_social_seen_at).toBeNull();
  expect(
    ethereum.mentions.every((m) => ["name", "cashtag"].includes(m.method)),
  ).toBe(true);
  expect(base.mentions.some((m) => m.postId === "DEMO_SOCIAL_REPOST")).toBe(
    false,
  );
  expect(
    (
      await pool.query(
        "SELECT candidates FROM memeradar.social_token_candidates WHERE post_id=(SELECT id FROM memeradar.x_posts WHERE x_post_id='DEMO_SOCIAL_UNKNOWN')",
      )
    ).rows[0].candidates[0].chain,
  ).toBeNull();
  expect(
    (
      await pool.query(
        "SELECT first_social_seen_at FROM memeradar.tokens WHERE id=$1",
        [token],
      )
    ).rows[0].first_social_seen_at,
  ).toBeNull();
  expect(JSON.stringify(base)).not.toContain("PRIVATE_SOCIAL_NOTE");
});
it("does not lend another user private mentions through token search, person detail, conversations or event chronology", async () => {
  expect((await foreign.read(token, event)).mentions).toEqual([]);
  expect((await otherCollection.localSearch({ tokenId: token })).posts).toEqual(
    [],
  );
  expect(
    (await collection.localSearch({ tokenId: token })).posts.length,
  ).toBeGreaterThan(0);
  expect(
    (
      await new PgPeopleRepository(pool, owner, "DEMO").detail(personId)
    ).tokens.some((t) => t.token_id === token),
  ).toBe(true);
  for (const [user, c] of [
    [owner, collection],
    [other, otherCollection],
  ] as const) {
    const cr = new PgConversationRepository(pool, user, "DEMO", c),
      r = await cr.ensure("DEMO_ROOT", null, false);
    const now = Date.now() + 1000,
      lease = (await c.claim(r, "conversation", now, 120000, true, true))!;
    await cr.persist(
      lease,
      {
        data: posts,
        users,
        nextToken: null,
        problems: [],
        quota: null,
        partial: false,
        collectedAt: at(60),
        dataOrigin: "DEMO",
      },
      "conversation",
      now,
      120000,
    );
    await c.finish(lease, { now, nextDueAt: now, status: "completed" });
    const data = await cr.read("DEMO_ROOT");
    expect(
      data.posts
        .find((p) => p.id === "DEMO_SOCIAL_EXACT")
        ?.tokenIds.includes(token),
    ).toBe(user === owner);
  }
});
it("allows confirmation only after explicit review of an exact official event publication; URL and cashtag are insufficient", async () => {
  await expect(repo.attestOfficialPublication({})).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    repo.attestOfficialPublication({
      ...attest(),
      reviewedAt: new Date(Date.now() + 60000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.attestOfficialPublication(attest("DEMO_SOCIAL_TAG")),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.attestOfficialPublication(attest("DEMO_SOCIAL_URL")),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    foreign.attestOfficialPublication(attest()),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect((await repo.read(token, event)).level).toBe("PLAUSIBLE");
  await repo.attestOfficialPublication(attest());
  const data = await repo.read(token, event);
  expect(data.level).toBe("CONFIRMED");
  expect(data.attestations[0].evidenceUrl).toContain("/post/DEMO_SOCIAL_EXACT");
  expect((await repo.read(token, event, at(60))).level).toBe("PLAUSIBLE");
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.token_event_links"))
      .rows[0].count,
  ).toBe("0");
});
it("hides changed content immediately, does not keep old official review after rebuild, and clears unavailable evidence", async () => {
  posts = posts.map((p) =>
    p.id === "DEMO_SOCIAL_EXACT"
      ? {
          ...p,
          text: `Nébula Mobile dément ce contrat : ${address} https://demo.memeradar.invalid/token/base/${address}`,
          collectedAt: new Date(Date.now() - 1000).toISOString(),
        }
      : p,
  );
  await ingest(collection, rule, posts);
  expect((await repo.read(token, event)).level).toBe("PLAUSIBLE");
  expect((await repo.read(token, event)).first_social_post_id).toBe(
    "DEMO_SOCIAL_URL",
  );
  await repo.rebuild();
  expect((await repo.read(token, event)).level).toBe("PLAUSIBLE");
  await collection.hideUnavailable(
    ["DEMO_SOCIAL_EXACT", "DEMO_SOCIAL_URL"],
    Date.now(),
  );
  expect((await repo.read(token, event)).first_social_seen_at).toBeNull();
  expect((await repo.read(token, event)).level).toBe("INSUFFICIENT_DATA");
  await repo.rebuild();
  expect(
    (
      await pool.query(
        "SELECT count(*) FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id WHERE p.availability_status<>'available' AND m.owner_user_id=$1",
        [owner],
      )
    ).rows[0].count,
  ).toBe("0");
});
it("uses explicit rule context, rejects stale attestation revisions, supports revocation and refuses destructive rollback", async () => {
  await repo.rebuild({ ruleId: rule.id, contextChain: "base" });
  expect((await repo.read(token, event)).first_social_post_id).toBe(
    "DEMO_SOCIAL_UNKNOWN",
  );
  await repo.attestOfficialPublication(attest("DEMO_SOCIAL_UNKNOWN"));
  expect((await repo.read(token, event)).level).toBe("CONFIRMED");
  const a = (await repo.read(token, event)).attestations[0];
  await expect(repo.revokeOfficialPublication("bad")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(await foreign.revokeOfficialPublication(a.id)).toBe(0);
  expect(await repo.revokeOfficialPublication(a.id)).toBe(1);
  expect((await repo.read(token, event)).level).toBe("PLAUSIBLE");
  await repo.attestOfficialPublication(attest("DEMO_SOCIAL_UNKNOWN"));
  await events.configure(event, {
    terms: [{ kind: "phrase", text: "Nébula Mobile" }],
    ruleIds: [rule.id],
    officialAccounts: [],
  });
  await events.rebuild(event);
  expect((await repo.read(token, event)).level).toBe("PLAUSIBLE");
  await expect(migrate(pool, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.schema_migrations"))
      .rows[0].count,
  ).toBe("9");
});
it("enforces RLS without context and across owners with a non-bypass application role", async () => {
  await pool.query(
    "CREATE ROLE social_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query(
    "GRANT USAGE ON SCHEMA memeradar TO social_application_test",
  );
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO social_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=social_application_test",
    max: 2,
  });
  try {
    for (const table of [
      "social_token_candidates",
      "social_contract_attestations",
      "post_token_mentions",
    ])
      expect(
        (await scoped.query(`SELECT * FROM memeradar.${table}`)).rows,
      ).toEqual([]);
    expect(
      (await new PgSocialRepository(scoped, owner, "DEMO").read(token, event))
        .mentions.length,
    ).toBeGreaterThan(0);
    expect(
      (await new PgSocialRepository(scoped, other, "DEMO").read(token, event))
        .mentions,
    ).toEqual([]);
    await new PgSocialRepository(scoped, other, "DEMO").rebuild();
    expect(
      (await new PgSocialRepository(scoped, other, "DEMO").read(eth, event))
        .level,
    ).toBe("INSUFFICIENT_DATA");
  } finally {
    await scoped.end();
  }
});

it("revalidates event text on current content even before old event links are rebuilt", async () => {
  await events.configure(event, {
    terms: [{ kind: "phrase", text: "Nébula Mobile" }],
    ruleIds: [rule.id],
    officialAccounts: [
      {
        userId: users[0].id,
        evidenceUrl: "https://demo.memeradar.invalid/official",
        reviewedAt: at(0),
      },
    ],
  });
  await events.rebuild(event);
  posts = posts
    .filter((p) => p.id === "DEMO_SOCIAL_UNKNOWN")
    .map((p) => ({
      ...p,
      text: `Autre sujet sans rapport : ${address}`,
      collectedAt: new Date(Date.now() - 1).toISOString(),
    }));
  await ingest(collection, rule, posts);
  await repo.rebuild({ ruleId: rule.id, contextChain: "base" });
  expect((await repo.read(token, event)).level).toBe("WEAK");
  expect(await repo.forEvent(event)).toEqual([]);
  await expect(
    repo.attestOfficialPublication(attest("DEMO_SOCIAL_UNKNOWN")),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
