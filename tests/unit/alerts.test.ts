import { it, expect } from "vitest";
import {
  defaultRule,
  ruleSchema,
  parseCandidate,
  inspect,
  matchesTerms,
  candidateLinks,
  kinds,
  type AlertKind,
} from "../../packages/alerts/model";
import {
  advance,
  emptyState,
  parseState,
  feedback,
  quietAt,
  nextDaily,
} from "../../packages/alerts/engine";
import {
  demoCandidates,
  advanceDemo,
  ALERT_DEMO_PERSON,
} from "../../packages/alerts/demo-data";
import { eventAt } from "../../packages/events/demo-data";
const id = "00000000-0000-4000-8000-000000000110";
const rule = (kind: AlertKind = "keyword") => ({
  ...defaultRule(id),
  kind,
  personId: kind === "person_post" ? ALERT_DEMO_PERSON : null,
  threshold: kind === "mentions" ? 200 : kind === "quota" ? 80 : 20,
  resetBelow: kind === "mentions" ? 100 : 10,
});
const candidate = (kind: AlertKind = "keyword", m = 1) => ({
  ...demoCandidates().find((c) => c.kind === kind)!,
  id: `DEMO_ALERT_TEST_${m}`,
  at: eventAt(m),
  collectedAt: eventAt(m),
});
const ctx = { personPaused: false, authorId: "DEMO_USER_A" };
it.each(Object.keys(kinds) as AlertKind[])(
  "explains and delivers a supported %s observation",
  (kind) => {
    const r = rule(kind),
      c = {
        ...candidate(kind),
        ...(kind === "token" ? { association: "PLAUSIBLE" as const } : {}),
      },
      s = advance(r, emptyState(), [c], c.at, ctx);
    expect(s.entries[0].status).toBe("notified");
    expect(s.entries[0].reason.length).toBeGreaterThan(10);
    expect(s.notifications).toHaveLength(1);
  },
);
it("deduplicates after serialization/restart without mutating input or duplicating notifications", () => {
  const r = rule(),
    c = candidate(),
    original = emptyState(),
    s = advance(r, original, [c, c], eventAt(1));
  expect(original.entries).toEqual([]);
  expect(s.entries).toHaveLength(1);
  expect(
    advance(r, JSON.parse(JSON.stringify(s)), [c], eventAt(2)).notifications,
  ).toHaveLength(1);
  expect(() => advance(r, s, [], eventAt(0))).toThrow("backwards");
  expect(() => advance(r, s, Array(101).fill(c), eventAt(2))).toThrow();
  expect(
    advance(r, emptyState(), [candidate("risk")], eventAt(1)).entries,
  ).toEqual([]);
});
it("uses cooldown and a rolling hour cap with explicit suppression reasons", () => {
  let r = { ...rule(), maxPerHour: 1, cooldownSeconds: 300 },
    s = advance(r, emptyState(), [candidate()], eventAt(1));
  s = advance(r, s, [candidate("keyword", 2)], eventAt(2));
  expect(s.entries.at(-1)?.suppression).toBe("cooldown");
  s = advance(r, s, [candidate("keyword", 7)], eventAt(7));
  expect(s.entries.at(-1)?.suppression).toBe("hourly_limit");
  s = advance(r, s, [candidate("keyword", 61)], eventAt(61));
  expect(s.entries.at(-1)?.status).toBe("notified");
});
it("keeps mention hysteresis until the baseline-relative reset then triggers again", () => {
  const r = { ...rule("mentions"), cooldownSeconds: 0 };
  let s = emptyState();
  for (const c of demoCandidates().filter((c) => c.kind === "mentions"))
    s = advance(r, s, [c], c.at);
  expect(s.entries.map((e) => e.status)).toEqual([
    "notified",
    "suppressed",
    "suppressed",
    "notified",
    "suppressed",
    "suppressed",
  ]);
  expect(s.entries[1].suppression).toBe("hysteresis");
  expect(s.entries[4].reason).toContain("nulle");
  expect(s.entries[5].reason).toContain("insuffisante");
});
it.each([
  ["liquidity", "119.995", false],
  ["liquidity", "120", true],
  ["transactions", "12", true],
] as const)("compares %s before rounding", (kind, value, trigger) => {
  const c = {
    ...candidate(kind),
    before: kind === "transactions" ? "10" : "100",
    after: value,
  };
  expect(inspect(rule(kind), c).trigger).toBe(trigger);
});
it("does not invent a baseline or compare unequal/incomplete windows", () => {
  const c = candidate("mentions");
  for (const v of [
    { ...c, before: "0" },
    { ...c, baselineSamples: undefined },
    { ...c, complete: false },
    { ...c, before: undefined },
  ])
    expect(inspect(rule("mentions"), v).trigger).toBe(false);
  expect(() => parseCandidate({ ...c, after: "1.5" })).toThrow();
  expect(
    inspect(rule("liquidity"), { ...candidate("liquidity"), before: "0" })
      .trigger,
  ).toBe(false);
});
it("matches literal words, hashtags, cashtags and exact chain/address without symbol association", () => {
  const c = {
    ...candidate(),
    hashtags: ["nebula"],
    cashtags: ["NEB"],
    addresses: [
      { chain: "base" as const, address: "0xDEMO" + "0".repeat(34) + "42" },
    ],
  };
  for (const term of [
    "Nébula Mobile",
    "#nebula",
    "$NEB",
    "base:" + c.addresses[0].address,
  ])
    expect(matchesTerms({ ...rule(), terms: [term] }, c)).toBe(true);
  for (const term of [
    "Mobilex",
    "#missing",
    "$OTHER",
    "solana:" + c.addresses[0].address,
    "[.*]",
  ])
    expect(matchesTerms({ ...rule(), terms: [term] }, c)).toBe(false);
  expect(inspect({ ...rule(), terms: ["missing"] }, c).trigger).toBe(false);
  expect(
    inspect(
      { ...rule("person_post"), terms: [] },
      { ...candidate("person_post"), postId: undefined },
    ).trigger,
  ).toBe(false);
});
it("applies a token association floor and risk transitions without equating failure with fraud", () => {
  const r = { ...rule("token"), minAssociation: "CONFIRMED" as const };
  expect(inspect(r, candidate("token")).trigger).toBe(false);
  expect(
    inspect(r, { ...candidate("token"), association: "CONFIRMED" }).trigger,
  ).toBe(true);
  expect(
    inspect(r, { ...candidate("token"), association: undefined }).trigger,
  ).toBe(false);
  const c = candidate("risk"),
    rr = rule("risk");
  expect(
    inspect(rr, { ...c, previousRisk: null, nextRisk: "no_signal_detected" })
      .trigger,
  ).toBe(false);
  expect(
    inspect(rr, { ...c, previousRisk: null, nextRisk: "signal_detected" })
      .trigger,
  ).toBe(true);
  expect(inspect(rr, { ...c, nextRisk: "check_failed" }).trigger).toBe(true);
  expect(inspect(rr, { ...c, previousRisk: "signal_detected" }).trigger).toBe(
    false,
  );
});
it("suspends paused/unvalidated people and pending summaries, and binds stable author IDs", () => {
  const r = {
    ...rule("person_post"),
    delivery: "interval" as const,
    cooldownSeconds: 0,
  };
  const c = candidate("person_post");
  const wrong = advance(
    r,
    emptyState(),
    [{ ...c, authorId: "DEMO_OTHER" }],
    eventAt(1),
    ctx,
  );
  expect(wrong.entries).toEqual([]);
  let s = advance(r, emptyState(), [c], eventAt(1), ctx);
  expect(s.entries[0].status).toBe("pending");
  s = advance(r, s, [], eventAt(16), { ...ctx, personPaused: true });
  expect(s.entries[0].suppression).toBe("person_paused");
  expect(s.notifications).toHaveLength(0);
  expect(
    advance(rule(), emptyState(), [candidate()], eventAt(1), ctx).entries[0]
      .status,
  ).toBe("notified");
});
it("groups periodic summaries, preserves pending dates across settings edits, and resumes after restart", () => {
  const r = {
    ...rule(),
    delivery: "interval" as const,
    intervalMinutes: 15,
    cooldownSeconds: 0,
  };
  let s = emptyState();
  for (const m of [1, 2, 3])
    s = advance(r, s, [candidate("keyword", m)], eventAt(m));
  expect(s.notifications).toHaveLength(0);
  expect(s.entries.every((e) => e.dueAt === eventAt(15))).toBe(true);
  s = advance(
    { ...r, intervalMinutes: 60 },
    JSON.parse(JSON.stringify(s)),
    [],
    eventAt(15),
  );
  expect(s.notifications).toHaveLength(1);
  expect(s.notifications[0].entryIds).toHaveLength(3);
  const repeated = advance(r, s, [], eventAt(20));
  expect(repeated.notifications).toHaveLength(1);
});
it("groups immediate observations and enforces the delivery cap after a delayed digest", () => {
  const r = { ...rule(), groupSeconds: 120, cooldownSeconds: 0 };
  let s = advance(r, emptyState(), [candidate()], eventAt(1));
  expect(s.notifications).toHaveLength(0);
  s = advance(r, s, [], eventAt(2));
  expect(s.notifications).toHaveLength(1);
  const daily = {
    ...rule(),
    delivery: "daily" as const,
    maxPerHour: 2,
    cooldownSeconds: 0,
  };
  let d = emptyState();
  for (const m of [1, 61, 121])
    d = advance(daily, d, [candidate("keyword", m)], eventAt(m));
  d = advance(daily, d, [], eventAt(1440));
  expect(d.notifications[0].entryIds).toHaveLength(2);
  expect(d.entries[2].suppression).toBe("hourly_limit");
});
it("honors local quiet hours including overnight and whole-day silence at admission and delivery", () => {
  const r = {
    ...rule(),
    zone: "UTC",
    quiet: { enabled: true, start: "22:00", end: "07:00" },
  };
  expect(quietAt(r, "2026-01-15T23:00:00.000Z")).toBe(true);
  expect(quietAt(r, "2026-01-16T07:00:00.000Z")).toBe(false);
  expect(
    quietAt(
      { ...r, quiet: { enabled: true, start: "10:00", end: "12:00" } },
      "2026-01-15T11:00:00.000Z",
    ),
  ).toBe(true);
  expect(
    quietAt(
      { ...r, quiet: { enabled: true, start: "00:00", end: "00:00" } },
      eventAt(1),
    ),
  ).toBe(true);
  const paused = advance(
    { ...r, enabled: false },
    emptyState(),
    [candidate()],
    eventAt(1),
  );
  expect(paused.entries[0].suppression).toBe("rule_paused");
  const c = {
    ...candidate(),
    at: "2026-01-15T23:00:00.000Z",
    collectedAt: "2026-01-15T23:00:00.000Z",
  };
  expect(advance(r, emptyState(), [c], c.at).entries[0].suppression).toBe(
    "quiet_hours",
  );
  const d = { ...rule(), delivery: "interval" as const };
  let s = advance(d, emptyState(), [candidate()], eventAt(1));
  s = advance(
    { ...d, quiet: { enabled: true, start: "00:00", end: "00:00" } },
    s,
    [],
    eventAt(15),
  );
  expect(s.entries[0].suppression).toBe("quiet_hours");
});
it.each([
  ["2026-03-08T06:59:00.000Z", "02:30", "2026-03-08T07:00:00.000Z"],
  ["2026-11-01T05:31:00.000Z", "01:30", "2026-11-02T06:30:00.000Z"],
  ["2026-11-01T06:01:00.000Z", "01:30", "2026-11-02T06:30:00.000Z"],
  ["2026-01-15T13:59:00.000Z", "09:00", "2026-01-15T14:00:00.000Z"],
])(
  "schedules daily %s across DST without a second fall digest",
  (at, hour, result) =>
    expect(nextDaily(at, "America/Toronto", hour)).toBe(result),
);
it.each([
  ["future_observation", { at: eventAt(2), collectedAt: eventAt(2) }],
  ["stale_observation", { at: eventAt(0), collectedAt: eventAt(1) }],
  ["data_quality", { quality: 0 }],
] as const)("suppresses %s with its reason", (reason, extra) => {
  const r = { ...rule(), maxAgeSeconds: 60 },
    c = { ...candidate(), ...extra };
  const s = advance(
    r,
    emptyState(),
    [c],
    reason === "stale_observation" ? eventAt(3) : eventAt(1),
  );
  expect(s.entries[0].suppression).toBe(reason);
});
it("records false positives/read feedback without removing evidence or freeing the rate allowance", () => {
  const r = { ...rule(), cooldownSeconds: 0, maxPerHour: 1 };
  let s = advance(r, emptyState(), [candidate()], eventAt(1));
  s = feedback(s, s.entries[0].id, "false_positive", eventAt(1));
  expect(s.entries[0].feedbackAt).toBe(eventAt(1));
  s = feedback(s, s.notifications[0].id, "read", eventAt(1));
  expect(s.notifications[0].read).toBe(true);
  expect(s.entries[0].status).toBe("false_positive");
  s = advance(r, s, [candidate("keyword", 2)], eventAt(2));
  expect(s.entries[1].suppression).toBe("hourly_limit");
  expect(() => feedback(s, "absent", "read", eventAt(2))).toThrow();
  expect(() => feedback(s, "absent", "false_positive", eventAt(2))).toThrow();
  const n = advance(rule(), emptyState(), [candidate()], eventAt(1));
  expect(
    feedback(n, n.notifications[0].id, "read", eventAt(1)).entries[0].status,
  ).toBe("acknowledged");
});
it("rejects invalid rules, unsafe provenance, cross-origin IDs and inconsistent state bounds", () => {
  expect(
    ruleSchema.safeParse({ ...rule(), zone: "invalid/zone" }).success,
  ).toBe(false);
  expect(ruleSchema.safeParse({ ...rule(), resetBelow: 20 }).success).toBe(
    false,
  );
  expect(ruleSchema.safeParse({ ...rule(), terms: [] }).success).toBe(false);
  for (const extra of [
    { sourceUrl: "http://demo.memeradar.invalid" },
    { sourceUrl: "https://example.com" },
    { authorId: "123" },
    { addresses: [{ chain: "base", address: "ORB" }] },
    { kind: "quota", text: "sensitive raw provider body" },
  ])
    expect(() => parseCandidate({ ...candidate(), ...extra })).toThrow();
  expect(() =>
    parseCandidate({ ...candidate("token"), token: undefined }),
  ).toThrow();
  const s = advance(rule(), emptyState(), [candidate()], eventAt(1));
  expect(() =>
    parseState({ ...s, entries: [s.entries[0], s.entries[0]] }),
  ).toThrow();
  expect(() =>
    parseState({
      ...s,
      notifications: [{ ...s.notifications[0], entryIds: ["missing"] }],
    }),
  ).toThrow();
});
it("builds only identity-based links and keeps the scenario deterministic", () => {
  expect(candidateLinks(candidate("token"))[0].href).toContain(
    "#/tokens/base/0xDEMO",
  );
  const c = parseCandidate({
    ...candidate(),
    origin: "REAL",
    postId: "12345",
    sourceUrl: "https://x.com/i/web/status/12345",
  });
  expect(
    candidateLinks(c).some(
      (l) => l.href === "https://x.com/i/web/status/12345",
    ),
  ).toBe(true);
  const r = rule();
  const a = advanceDemo(r, emptyState(), eventAt(60));
  expect(a).toEqual(advanceDemo(r, emptyState(), eventAt(60)));
  expect(() => advanceDemo(r, a, eventAt(59))).toThrow();
});

it("does not rearm a threshold from a delayed or stale older observation", () => {
  const r = { ...rule("mentions"), cooldownSeconds: 0 };
  let s = advance(r, emptyState(), [candidate("mentions", 8)], eventAt(8));
  const reset = { ...candidate("mentions", 6), after: "1" };
  s = advance(r, s, [reset], eventAt(10));
  expect(s.entries.at(-1)?.suppression).toBe("out_of_order");
  s = advance(r, s, [candidate("mentions", 11)], eventAt(11));
  expect(s.entries.at(-1)?.suppression).toBe("hysteresis");
});
