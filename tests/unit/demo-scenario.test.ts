import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  scenarioPosts,
  scenarioUsers,
  scenarioDataset,
  initialSession,
  moveSession,
  faultSession,
  sessionSource,
  sessionAt,
  sessionAvailable,
  sessionSchema,
} from "../../packages/demo/scenario";
import { createScenarioProvider } from "../../packages/demo/provider";
import { advanceScenario } from "../../packages/demo/alerts";
import { eventAt, demoEventSnapshot } from "../../packages/events/demo-data";
import {
  socialDemoTokens,
  demoSocialSnapshot,
} from "../../packages/social/demo-data";
import {
  demoConversationSnapshot,
  demoConversationId,
} from "../../packages/conversations/demo-data";
import { demoChartSnapshot } from "../../packages/charts/demo-data";
import { demoRiskReport } from "../../packages/risks/demo-data";
import { providerSchemas } from "../../packages/connectors/x/contracts";
import { defaultRule } from "../../packages/alerts/model";
import { emptyState } from "../../packages/alerts/engine";
import { initialSources, demoSource } from "../../packages/sources/demo-data";
function setup(minute = 60) {
  const clock = {
    time: Date.parse(eventAt(minute)),
    now() {
      return this.time;
    },
    async sleep(ms: number) {
      this.time += ms;
    },
  };
  return { clock, p: createScenarioProvider(clock) };
}
it("keeps 63 unique invented publications and three named followed-profile examples", () => {
  expect(scenarioPosts).toHaveLength(63);
  expect(new Set(scenarioPosts.map((p) => p.id)).size).toBe(63);
  for (const username of [
    "demo_analyste_julie",
    "demo_fondateur_marc",
    "demo_trader_k",
  ])
    expect(scenarioUsers.some((u) => u.username === username)).toBe(true);
  for (const p of scenarioDataset.posts)
    expect(providerSchemas("DEMO").post.safeParse(p).success).toBe(true);
  for (const u of scenarioUsers)
    expect(providerSchemas("DEMO").user.safeParse(u).success).toBe(true);
  expect(
    scenarioPosts.every(
      (p) => p.dataOrigin === "DEMO" && p.text.includes("[DÉMO]"),
    ),
  ).toBe(true);
});
it("provides four chain/address identities without changing historical V1 tokens", () => {
  expect(socialDemoTokens).toHaveLength(4);
  expect(
    new Set(socialDemoTokens.map((t) => t.chain + ":" + t.address)).size,
  ).toBe(4);
  expect(socialDemoTokens.some((t) => t.chain === "solana")).toBe(true);
  const fourth = demoSocialSnapshot(60)[3];
  expect(fourth.mentions.length).toBeGreaterThan(0);
  for (const t of socialDemoTokens) {
    expect(
      demoChartSnapshot({
        chain: t.chain,
        address: t.address,
        minute: 60,
        interval: "1m",
        range: "1h",
      }),
    ).not.toBeNull();
    expect(
      demoRiskReport(
        { origin: "DEMO", chain: t.chain, address: t.address },
        60,
      ),
    ).toHaveLength(17);
  }
});
it("aligns search, lookup, timeline and conversation IDs/text with the public catalogue", async () => {
  const { p } = setup(),
    snapshot = demoConversationSnapshot();
  const c = await p.getConversation(demoConversationId, { maxResults: 100 });
  expect(c.data).toHaveLength(36);
  for (const post of c.data) {
    const expected = snapshot.find((x) => x.id === post.id)!;
    expect(post.text).toBe(expected.text);
    expect(post.collectedAt).toBe(expected.collectedAt);
  }
  const quotes = await p.getQuotePosts(demoConversationId);
  expect(quotes.data).toHaveLength(1);
  const one = await p.getPostsByIds([scenarioPosts[0].id]);
  expect(one.data[0].text).toBe(scenarioPosts[0].text);
  expect((await p.getUserByUsername("@demo_trader_k"))?.id).toBe(
    "DEMO_TRADER_K",
  );
  expect((await p.getUsersByIds(["DEMO_USER_A"])).length).toBe(1);
  expect(
    (await p.getUserPosts("DEMO_USER_A")).data.every(
      (x) => x.authorId === "DEMO_USER_A",
    ),
  ).toBe(true);
});
it("reveals only acquired data and minimizes author profiles on each page", async () => {
  const { p, clock } = setup(10),
    a = await p.searchRecent("démo", { maxResults: 100 });
  expect(a.data.length).toBeGreaterThan(0);
  expect(a.data.every((x) => Date.parse(x.collectedAt) <= clock.now())).toBe(
    true,
  );
  expect(a.data.some((x) => x.id === "DEMO_POST_ROOT")).toBe(false);
  expect(a.users.every((u) => a.data.some((x) => x.authorId === u.id))).toBe(
    true,
  );
  clock.time = Date.parse(eventAt(60));
  expect((await p.searchRecent("démo")).data).toHaveLength(60);
  clock.time = Date.parse(eventAt(65));
  expect((await p.searchFullArchive("démo")).data).toHaveLength(63);
});
it("paginates the same catalogue without duplicates and validates cursors", async () => {
  const { p } = setup(65);
  const ids: string[] = [];
  let token: string | null = null;
  do {
    const page = await p.searchRecent("démo", {
      maxResults: 7,
      ...(token ? { nextToken: token } : {}),
    });
    ids.push(...page.data.map((x) => x.id));
    token = page.nextToken;
  } while (token);
  expect(ids).toHaveLength(63);
  expect(new Set(ids).size).toBe(63);
  await expect(
    p.searchRecent("démo", { nextToken: "secret" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(p.searchRecent("démo", { maxResults: 0 })).rejects.toMatchObject(
    { code: "INVALID_INPUT" },
  );
  await expect(p.searchRecent(" ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    p.searchRecent("démo", { sinceId: "DEMO_MISSING" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it.each([
  ["rate_limit", "RATE_LIMITED"],
  ["disconnected", "PROVIDER_UNAVAILABLE"],
  ["budget_exhausted", "BUDGET_EXCEEDED"],
  ["denied", "ACCESS_DENIED"],
] as const)(
  "simulates %s without a network retry loop",
  async (fault, code) => {
    const { p } = setup();
    p.simulate(fault);
    await expect(p.searchRecent("démo")).rejects.toMatchObject({ code });
    expect((await p.searchRecent("démo")).data).toHaveLength(60);
  },
);
it("replays a finite simulated stream and stops after explicit cancellation", async () => {
  const { p } = setup();
  await p.stream.setRules([{ localId: "demo-rule", query: "démo" }]);
  let count = 0;
  const handle = p.stream.connect(async () => {
    count++;
    if (count === 2) p.simulate("disconnected");
  });
  await expect(handle.done).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
  });
  expect(count).toBe(2);
  const stopped = p.stream.connect(async () => {
    stopped.stop();
  });
  expect((await stopped.done).reason).toBe("stopped");
  expect((await p.capabilities()).stream.state).toBe("available");
});
it("uses no fetch for read methods, capability inspection or a full stream replay", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("network forbidden"));
  try {
    const { p } = setup();
    await p.capabilities();
    await p.searchRecent("démo");
    await p.getConversation(demoConversationId);
    await p.stream.setRules([{ localId: "demo", query: "démo" }]);
    expect((await p.stream.connect(async () => {}).done).posts).toBe(60);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
it("persists one bounded clock and resets fault anchors when replaying backwards", () => {
  let s = initialSession();
  s = faultSession(s, "quota");
  expect(sessionAvailable(s)).toBe(false);
  s = moveSession(s, 62);
  expect(sessionAt(s)).toBe(eventAt(62));
  expect(sessionSource(s)).toMatchObject({
    clock: eventAt(62),
    scenario: "quota",
    scenarioAt: eventAt(60),
  });
  s = moveSession(s, 10);
  expect(s).toMatchObject({ minute: 10, fault: "normal", faultAt: 10 });
  expect(sessionAvailable(s)).toBe(true);
  expect(sessionSource(faultSession(s, "partial")).scenario).toBe("normal");
  expect(() => moveSession(s, -1)).toThrow();
  expect(() => moveSession(s, 4321)).toThrow();
  expect(sessionSchema.safeParse({ ...s, faultAt: 11 }).success).toBe(false);
});
it("keeps source quota resets anchored to the chosen fault, without a future success on rewind", () => {
  const session = faultSession(moveSession(initialSession(), 80), "quota"),
    source = demoSource(
      { ...initialSources(), ...sessionSource(session) },
      "x",
    );
  expect(source.diagnostics[0].quota?.resetAt).toBe(eventAt(95));
  expect(source.blockedUntil).toBe(eventAt(95));
  const past = demoSource(
    { ...initialSources(), ...sessionSource(moveSession(session, 0)) },
    "x",
  );
  expect(Date.parse(past.lastSuccess!)).toBeLessThanOrEqual(
    Date.parse(past.asOf),
  );
});
it("new publication alerts consume canonical future posts, never backfill a newly created rule", () => {
  const rule = {
    ...defaultRule(randomUUID()),
    terms: ["Nébula Mobile"],
    cooldownSeconds: 0,
    groupSeconds: 0,
    maxPerHour: 100,
  };
  const s = advanceScenario(
    rule,
    { ...emptyState(), clock: eventAt(60) },
    eventAt(65),
  );
  expect(s.entries).toHaveLength(3);
  expect(
    s.entries.every((e) =>
      scenarioPosts.some(
        (p) =>
          p.id === e.candidate.postId &&
          p.text === e.candidate.text &&
          p.collectedAt === e.candidate.collectedAt,
      ),
    ),
  ).toBe(true);
  expect(advanceScenario(rule, s, eventAt(65)).entries).toHaveLength(3);
  expect(() => advanceScenario(rule, s, eventAt(60))).toThrow();
});
it("pauses followed-person alerts by stable author ID and keeps ordinary authors out", () => {
  const personId = randomUUID(),
    rule = {
      ...defaultRule(randomUUID()),
      kind: "person_post" as const,
      personId,
      terms: [],
      cooldownSeconds: 0,
      groupSeconds: 0,
      maxPerHour: 100,
    };
  const s = advanceScenario(
    rule,
    { ...emptyState(), clock: eventAt(60) },
    eventAt(65),
    { authorId: "DEMO_USER_A", personPaused: true },
  );
  expect(s.entries).toHaveLength(3);
  expect(s.entries.every((e) => e.suppression === "person_paused")).toBe(true);
  expect(
    advanceScenario(
      rule,
      { ...emptyState(), clock: eventAt(60) },
      eventAt(65),
      { authorId: "DEMO_COMMENTER_0", personPaused: false },
    ).entries,
  ).toEqual([]);
});
it("retains technical teaching fixtures on the same timeline without rewriting their observations", () => {
  const rule = {
    ...defaultRule(randomUUID()),
    kind: "budget" as const,
    terms: [],
  };
  expect(
    advanceScenario(rule, emptyState(), eventAt(30)).entries.length,
  ).toBeGreaterThan(0);
  expect(
    demoEventSnapshot(60).posts.every(
      (p) => Date.parse(p.collectedAt) <= Date.parse(eventAt(60)),
    ),
  ).toBe(true);
});

it("never reveals a future pool and keeps Solana trades and publication markers chain-consistent", () => {
  const token = socialDemoTokens[3],
    input = {
      chain: token.chain,
      address: token.address,
      interval: "1m" as const,
      range: "1h",
    };
  const early = demoChartSnapshot({ ...input, minute: 10 })!;
  expect(early.pools).toEqual([]);
  expect(early.trades).toEqual([]);
  expect(early.markers.some((m) => m.kind === "pool_created")).toBe(false);
  const current = demoChartSnapshot({ ...input, minute: 60 })!;
  expect(
    current.pools.every(
      (p) =>
        !p.createdAt || Date.parse(p.createdAt) <= Date.parse(current.asOf),
    ),
  ).toBe(true);
  expect(current.trades.length).toBeGreaterThan(0);
  expect(current.trades.every((t) => t.wallet?.startsWith("DEMo"))).toBe(true);
  expect(current.markers.find((m) => m.kind === "pool_created")?.at).toBe(
    eventAt(20),
  );
  for (const marker of current.markers.filter((m) => m.kind === "x_post")) {
    expect(marker.target).toBe(
      "#page=watch&post=" + encodeURIComponent(marker.id),
    );
    expect(scenarioPosts.some((p) => p.id === marker.id)).toBe(true);
  }
});
