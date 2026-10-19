import {
  advance,
  parseState,
  type AlertState,
  type AlertContext,
} from "../alerts/engine";
import { parseCandidate, type AlertRule } from "../alerts/model";
import { demoCandidates, ALERT_DEMO_SOURCE } from "../alerts/demo-data";
import { DEMO_EVENT_ID } from "../events/model";
import { eventAt } from "../events/demo-data";
import { scenarioPosts } from "./scenario";
/** Publication alerts refer to the very same IDs, text and acquisition time as the watch feed. */
export function advanceScenario(
  rule: AlertRule,
  old: AlertState,
  end: string,
  context: AlertContext = {},
) {
  let s = parseState(old);
  const start = s.clock ? Date.parse(s.clock) : Date.parse(eventAt(0));
  if (Date.parse(end) < start)
    throw new Error("Le scénario ne peut réécrire les décisions antérieures.");
  const candidates = ["keyword", "person_post"].includes(rule.kind)
    ? scenarioPosts
        .filter(
          (p) =>
            p.type !== "repost" &&
            (rule.kind !== "person_post" || p.authorId === context.authorId),
        )
        .map((p) =>
          parseCandidate({
            id: p.id,
            origin: "DEMO",
            kind: rule.kind,
            subject: {
              type: rule.kind === "person_post" ? "source" : "event",
              id:
                rule.kind === "person_post" ? ALERT_DEMO_SOURCE : DEMO_EVENT_ID,
            },
            at: p.publishedAt ?? p.collectedAt,
            collectedAt: p.collectedAt,
            quality: 95,
            complete: true,
            source: "[DÉMO] Catalogue Nébula Mobile",
            sourceUrl: "https://demo.memeradar.invalid/post/" + p.id,
            text: p.text,
            hashtags: p.entities.hashtags,
            cashtags: p.entities.cashtags,
            postId: p.id,
            ...(rule.kind === "person_post"
              ? { personId: rule.personId, authorId: p.authorId }
              : {}),
          }),
        )
    : demoCandidates(rule.personId ?? undefined, context.authorId ?? undefined);
  for (const c of candidates
    .filter(
      (c) =>
        Date.parse(c.collectedAt) > start &&
        Date.parse(c.collectedAt) <= Date.parse(end),
    )
    .sort(
      (a, b) =>
        Date.parse(a.collectedAt) - Date.parse(b.collectedAt) ||
        a.id.localeCompare(b.id),
    ))
    s = advance(rule, s, [c], c.collectedAt, context);
  return advance(rule, s, [], end, context);
}
