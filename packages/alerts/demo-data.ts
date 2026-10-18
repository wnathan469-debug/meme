import {
  defaultRule,
  parseCandidate,
  type AlertRule,
  type AlertKind,
  type AlertCandidate,
} from "./model";
import {
  advance,
  emptyState,
  parseState,
  type AlertState,
  type AlertContext,
} from "./engine";
import { eventAt } from "../events/demo-data";
import { DEMO_EVENT_ID } from "../events/model";
export const ALERT_DEMO_TOKEN = "00000000-0000-4000-8000-000000000071";
export const ALERT_DEMO_SOURCE = "00000000-0000-4000-8000-000000000090";
export const ALERT_DEMO_PERSON = "00000000-0000-4000-8000-000000000091";
export function demoCandidates(
  personId = ALERT_DEMO_PERSON,
  authorId = "DEMO_USER_A",
): AlertCandidate[] {
  const items: AlertCandidate[] = [];
  const add = (
    kind: AlertKind,
    m: number,
    extras: Record<string, unknown> = {},
  ) =>
    items.push(
      parseCandidate({
        id: `DEMO_ALERT_${kind}_${m}`,
        origin: "DEMO",
        kind,
        subject: {
          type: ["token", "liquidity", "transactions", "risk"].includes(kind)
            ? "token"
            : [
                  "quota",
                  "budget",
                  "disconnect",
                  "provider_error",
                  "person_post",
                ].includes(kind)
              ? "source"
              : "event",
          id: ["token", "liquidity", "transactions", "risk"].includes(kind)
            ? ALERT_DEMO_TOKEN
            : [
                  "quota",
                  "budget",
                  "disconnect",
                  "provider_error",
                  "person_post",
                ].includes(kind)
              ? ALERT_DEMO_SOURCE
              : DEMO_EVENT_ID,
        },
        at: eventAt(m),
        collectedAt: eventAt(m),
        quality: 95,
        complete: true,
        source: "[DÉMO] Observations d’alerte locales",
        sourceUrl: "https://demo.memeradar.invalid/alerts",
        text: "[DÉMO] Nébula Mobile : observation entièrement fictive.",
        ...(["token", "liquidity", "transactions", "risk"].includes(kind)
          ? {
              token: {
                chain: "base",
                address: "0xDEMO" + "0".repeat(34) + "42",
              },
            }
          : {}),
        ...extras,
      }),
    );
  for (const m of [1, 2, 3, 7, 8, 12, 18, 25, 32, 50, 65])
    add("keyword", m, {
      postId: "DEMO_POST_ROOT",
      hashtags: ["nebula"],
      cashtags: ["NEB"],
    });
  add("person_post", 2, {
    postId: authorId === "DEMO_USER_A" ? "DEMO_POST_ROOT" : "DEMO_POST_REPLY",
    personId,
    authorId,
  });
  add("mentions", 5, { before: "60", after: "25", baselineSamples: 6 });
  add("mentions", 6, { before: "60", after: "30", baselineSamples: 6 });
  add("mentions", 15, { before: "60", after: "8", baselineSamples: 6 });
  add("mentions", 25, { before: "60", after: "35", baselineSamples: 6 });
  add("mentions", 30, { before: "0", after: "35", baselineSamples: 6 });
  add("mentions", 35, {
    before: "60",
    after: "35",
    baselineSamples: 6,
    complete: false,
  });
  add("event", 8);
  add("token", 10, { association: "WEAK" });
  add("token", 11, { association: "PLAUSIBLE" });
  add("liquidity", 13, { before: "18000", after: "13500" });
  add("transactions", 14, { before: "10", after: "30" });
  add("risk", 16, {
    previousRisk: "no_signal_detected",
    nextRisk: "signal_detected",
    riskCheck: "mint",
  });
  add("quota", 20, { before: "100", after: "85", text: "" });
  add("budget", 21, { before: "1000000", after: "1000000", text: "" });
  add("disconnect", 22, { active: true, text: "" });
  add("provider_error", 23, { active: true, text: "" });
  add("keyword", 40, { quality: 20 });
  return items.sort(
    (a, b) =>
      Date.parse(a.collectedAt) - Date.parse(b.collectedAt) ||
      a.id.localeCompare(b.id),
  );
}
export function seedAlertRules(): AlertRule[] {
  return ["keyword", "mentions", "risk"].map((kind, i) => ({
    ...defaultRule(
      `00000000-0000-4000-8000-0000000001${10 + i}`,
      kind as AlertKind,
    ),
    name: [
      "[DÉMO] Nébula sur X",
      "[DÉMO] Hausse relative des mentions",
      "[DÉMO] Changement de risque",
    ][i],
  }));
}
export function advanceDemo(
  rule: AlertRule,
  old: AlertState,
  end: string,
  context: AlertContext = {},
) {
  let s = parseState(old);
  const start = s.clock ? Date.parse(s.clock) : Date.parse(eventAt(0));
  if (Date.parse(end) < start)
    throw new Error("Recommencer le scénario pour revenir en arrière.");
  const candidates = demoCandidates(
    rule.personId ?? ALERT_DEMO_PERSON,
    context.authorId ?? "DEMO_USER_A",
  ).filter(
    (c) =>
      Date.parse(c.collectedAt) > start &&
      Date.parse(c.collectedAt) <= Date.parse(end),
  );
  for (const c of candidates) s = advance(rule, s, [c], c.collectedAt, context);
  return advance(rule, s, [], end, context);
}
export const demoStart = eventAt(0);
export { emptyState };
