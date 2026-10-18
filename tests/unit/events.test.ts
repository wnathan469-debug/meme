import { it, expect } from "vitest";
import {
  matchEvent,
  attentionSeries,
  eventChronology,
  authorCategory,
  watchInput,
} from "../../packages/events/model";
import {
  demoEventSnapshot,
  eventAt,
  eventRuleId,
  eventDemoWindows,
  eventDemoPosts,
  eventTerms,
  officialAttestations,
} from "../../packages/events/demo-data";
const original = eventDemoPosts.find((p) => p.type === "original")!;
const input = () => ({
  signalAt: eventAt(0),
  asOf: eventAt(60),
  ruleIds: [eventRuleId],
  windows: eventDemoWindows,
  posts: demoEventSnapshot().posts,
  baselineBuckets: 6,
  afterBuckets: 12,
  bucketSeconds: 300,
});
it("links literal phrases and hashtags with explicit interpreted scores, never a nickname or repost", () => {
  const post = {
    ...original,
    text: "NÉBULA Mobile #Produit",
    entities: { hashtags: ["Produit"], cashtags: [], mentions: [], urls: [] },
  };
  expect(
    matchEvent(post, [{ kind: "phrase", text: "Nébula mobile" }])?.score,
  ).toBe("0.550000");
  expect(matchEvent(post, [{ kind: "hashtag", text: "Produit" }])?.score).toBe(
    "0.450000",
  );
  expect(
    matchEvent(post, [
      { kind: "hashtag", text: "Produit" },
      { kind: "phrase", text: "Nébula" },
    ])?.score,
  ).toBe("0.700000");
  expect(
    matchEvent(post, [
      { kind: "hashtag", text: "Produit" },
      { kind: "phrase", text: "Nébula" },
      { kind: "phrase", text: "Mobile" },
    ])?.score,
  ).toBe("0.850000");
  expect(
    matchEvent({ ...post, text: "prénébula mobile" }, [
      { kind: "phrase", text: "Nébula Mobile" },
    ]),
  ).toBeNull();
  expect(matchEvent({ ...post, type: "repost" }, eventTerms)).toBeNull();
  expect(matchEvent({ ...post, type: "unknown" }, eventTerms)).toBeNull();
  expect(
    matchEvent(
      {
        ...post,
        text: "aucun rapport",
        entities: { ...post.entities, hashtags: [] },
      },
      eventTerms,
    ),
  ).toBeNull();
  expect(
    matchEvent({ ...post, entities: { ...post.entities, hashtags: [] } }, [
      { kind: "hashtag", text: "Produit" },
    ])?.knowledge,
  ).toBe("INTERPRETED");
  expect(matchEvent(post, [{ kind: "phrase", text: "!!" }])).toBeNull();
});
it("computes a pre-signal baseline and exact multipliers but never turns a documented gap into zero", () => {
  const value = attentionSeries(input());
  expect(value.baselineMean).toBe("1");
  const gap = value.after.find((b) => b.relativeMinutes === 15)!;
  expect(gap.mentions).toBeNull();
  expect(gap.lowerBound).toBeGreaterThan(0);
  expect(gap.multiplier).toBeNull();
  expect(value.after.find((b) => b.relativeMinutes === 55)?.mentions).toBe(0);
  expect(value.after.find((b) => b.relativeMinutes === 55)?.multiplier).toBe(
    "0,00",
  );
  expect(
    attentionSeries({
      ...input(),
      posts: [...input().posts, ...input().posts],
    }),
  ).toEqual(value);
  expect(value.buckets.slice(0, 6).map((b) => b.mentions)).toEqual([
    1, 1, 2, 1, 1, 0,
  ]);
});
it("requires all tracked rules and full adjacent segments, respects proof time and separates a zero baseline from missing data", () => {
  const base = input(),
    plain = {
      ...base,
      windows: [
        {
          ruleId: eventRuleId,
          start: eventAt(-30),
          end: eventAt(60),
          status: "observed" as const,
          reason: "fixture",
        },
      ],
    };
  expect(attentionSeries({ ...plain, ruleIds: [] }).baselineMean).toBeNull();
  expect(
    attentionSeries({ ...plain, ruleIds: [eventRuleId, "missing"] })
      .baselineMean,
  ).toBeNull();
  expect(
    attentionSeries({ ...plain, posts: [] }).after[0].multiplierReason,
  ).toContain("nulle");
  expect(
    attentionSeries({ ...base, asOf: eventAt(10) }).baselineMean,
  ).toBeNull();
  expect(
    attentionSeries({ ...base, asOf: eventAt(10) }).after.at(-1)?.status,
  ).toBe("pending");
  expect(
    attentionSeries({
      ...plain,
      windows: [{ ...plain.windows[0], start: eventAt(-29) }],
    }).baselineMean,
  ).toBeNull();
  expect(
    attentionSeries({
      ...plain,
      windows: [
        { ...plain.windows[0], end: eventAt(0) },
        { ...plain.windows[0], start: eventAt(0) },
      ],
    }).baselineMean,
  ).toBe("1");
  expect(
    attentionSeries({ ...base, windows: [] }).after[0].multiplierReason,
  ).toContain("incomplète");
  expect(() => attentionSeries({ ...base, bucketSeconds: 0 })).toThrow();
});
it("bounds attention to visible unique posts, excludes reposts and unknown publication dates", () => {
  const value = attentionSeries({
    ...input(),
    windows: [
      {
        ruleId: eventRuleId,
        start: eventAt(-30),
        end: eventAt(60),
        status: "observed",
        reason: "known",
      },
    ],
    posts: [
      { id: "one", type: "original", publishedAt: eventAt(0) },
      { id: "two", type: "repost", publishedAt: eventAt(0) },
      { id: "three", type: "unknown", publishedAt: eventAt(0) },
      { id: "four", type: "original", publishedAt: null },
      { id: "five", type: "original", publishedAt: eventAt(61) },
    ],
  });
  expect(value.after[0].mentions).toBe(1);
  expect(value.after.at(-1)?.mentions).toBe(0);
});
it("keeps original signal, app detection and first-known observations distinct, without inventing missing token dates", () => {
  const snapshot = demoEventSnapshot();
  expect(snapshot.timeline.find((t) => t.kind === "original_signal")?.at).toBe(
    eventAt(0),
  );
  expect(snapshot.timeline.find((t) => t.kind === "first_x")?.at).toBe(
    eventAt(-29),
  );
  expect(snapshot.timeline.find((t) => t.kind === "app_detection")?.at).toBe(
    eventAt(3),
  );
  expect(snapshot.timeline.find((t) => t.kind === "token_creation")?.at).toBe(
    eventAt(8),
  );
  expect(
    snapshot.timeline.find((t) => t.kind === "first_token_mention")?.at,
  ).toBe(eventAt(12));
  const missing = eventChronology({
    signalAt: eventAt(0),
    detectedAt: eventAt(3),
    source: null,
    posts: [
      { publishedAt: eventAt(5), collectedAt: eventAt(100), followed: true },
    ],
    tokens: [{ id: "unknown", createdAt: null, firstMentionAt: null }],
    asOf: eventAt(60),
  });
  expect(missing.find((t) => t.kind === "first_x")?.at).toBeNull();
  expect(missing.find((t) => t.kind === "token_creation")?.at).toBeNull();
  expect(
    eventChronology({
      signalAt: eventAt(0),
      detectedAt: eventAt(3),
      source: null,
      posts: [],
      tokens: [],
      asOf: eventAt(1),
    }).some((t) => t.kind === "app_detection"),
  ).toBe(false);
});
it("classifies accounts only from explicit attestations and follows, while demo exclusions preserve source reliability", () => {
  expect(
    authorCategory("DEMO_NEBULA_OFFICIAL", true, officialAttestations),
  ).toBe("official_attested");
  expect(authorCategory("DEMO_OTHER", true, officialAttestations)).toBe(
    "followed",
  );
  expect(authorCategory(null, false, officialAttestations)).toBe("other");
  expect(
    authorCategory("DEMO_OFFICIAL_NAME", false, officialAttestations),
  ).toBe("other");
  expect(demoEventSnapshot().posts.some((p) => p.category === "followed")).toBe(
    true,
  );
  const disabled = demoEventSnapshot(60, true, true);
  expect(disabled.source.reliability).toBe("A");
  expect(disabled.posts).toEqual([]);
  expect(disabled.attention.baselineMean).toBeNull();
  expect(disabled.tokens).toEqual([]);
  expect(eventDemoPosts).toHaveLength(60);
  expect(watchInput.safeParse({ terms: [], ruleIds: [] }).success).toBe(false);
});

it("orders first-known milestones by the actual instant when timestamps use different UTC offsets", () => {
  const result = eventChronology({
    signalAt: eventAt(0),
    detectedAt: eventAt(3),
    source: "fixture",
    asOf: eventAt(60),
    tokens: [],
    posts: [
      {
        publishedAt: "2026-01-15T14:05:00Z",
        collectedAt: eventAt(10),
        followed: false,
      },
      {
        publishedAt: "2026-01-15T15:00:00+01:00",
        collectedAt: eventAt(10),
        followed: true,
      },
    ],
  });
  expect(result.find((t) => t.kind === "first_x")?.at).toBe(
    "2026-01-15T15:00:00+01:00",
  );
  expect(result.map((t) => Date.parse(t.at!))).toEqual(
    [...result.map((t) => Date.parse(t.at!))].sort((a, b) => a - b),
  );
});
