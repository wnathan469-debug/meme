import { z } from "zod";
import type { Origin, XPost } from "../connectors/x/contracts";
export const DEMO_EVENT_ID = "00000000-0000-4000-8000-000000000060";
export const EVENT_TITLE =
  "[DÉMO] Annonce virale d’un nouveau produit par l’entreprise fictive Nébula Mobile";
export const termSchema = z.object({
  kind: z.enum(["phrase", "hashtag"]),
  text: z.string().trim().min(2).max(100),
});
const proof = z.object({
  userId: z.string().min(1).max(100),
  evidenceUrl: z.url().max(2000),
  reviewedAt: z.iso.datetime(),
});
export const watchInput = z.object({
  terms: z.array(termSchema).min(1).max(20),
  ruleIds: z.array(z.uuid()).min(1).max(20),
  officialAccounts: z.array(proof).max(20).default([]),
  bucketSeconds: z.literal(300).default(300),
  baselineBuckets: z.number().int().min(3).max(24).default(6),
  afterBuckets: z.number().int().min(1).max(48).default(12),
});
export type EventWatchInput = z.infer<typeof watchInput>;
export const alertInput = z.object({
  subjectType: z.enum(["topic", "company", "person", "keyword", "hashtag"]),
  subject: z.string().trim().min(1).max(100),
});
const canonical = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim();
export function matchEvent(
  post: Pick<XPost, "text" | "entities" | "type">,
  terms: z.infer<typeof termSchema>[],
) {
  if (post.type === "repost" || post.type === "unknown") return null;
  const body = ` ${canonical(post.text)} `,
    hashtags = new Set(post.entities.hashtags.map(canonical));
  const matched = [
    ...new Set(
      terms
        .filter((t) => {
          const term = canonical(t.text);
          return (
            !!term &&
            (t.kind === "hashtag"
              ? hashtags.has(term) ||
                new RegExp(
                  `#${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`,
                  "iu",
                ).test(post.text)
              : body.includes(` ${term} `))
          );
        })
        .map((t) => `${t.kind}:${canonical(t.text)}`),
    ),
  ];
  if (!matched.length) return null;
  return {
    score:
      matched.length >= 3
        ? "0.850000"
        : matched.length === 2
          ? "0.700000"
          : matched[0].startsWith("hashtag:")
            ? "0.450000"
            : "0.550000",
    method: "event-text-v1",
    knowledge: "INTERPRETED" as const,
    evidence: matched,
  };
}
export interface CoverageWindow {
  knownAt?: string;
  ruleId: string;
  start: string;
  end: string;
  status: "observed" | "partial" | "gap";
  reason: string;
}
export interface AttentionPost {
  id: string;
  publishedAt: string | null;
  type: XPost["type"];
}
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
export function attentionSeries(input: {
  signalAt: string;
  asOf: string;
  ruleIds: string[];
  windows: CoverageWindow[];
  posts: AttentionPost[];
  baselineBuckets: number;
  afterBuckets: number;
  bucketSeconds: number;
}) {
  const {
    signalAt,
    asOf,
    ruleIds,
    windows,
    baselineBuckets,
    afterBuckets,
    bucketSeconds,
  } = input;
  if (
    !Number.isFinite(Date.parse(signalAt)) ||
    !Number.isFinite(Date.parse(asOf)) ||
    !Number.isInteger(baselineBuckets) ||
    baselineBuckets < 3 ||
    baselineBuckets > 24 ||
    !Number.isInteger(afterBuckets) ||
    afterBuckets < 1 ||
    afterBuckets > 48 ||
    bucketSeconds !== 300
  )
    throw new Error("Invalid attention window");
  const signal = Date.parse(signalAt),
    now = Date.parse(asOf),
    size = bucketSeconds * 1000,
    posts = [...new Map(input.posts.map((p) => [p.id, p])).values()];
  const buckets = Array.from(
    { length: baselineBuckets + afterBuckets },
    (_, index) => {
      const start = signal + (index - baselineBuckets) * size,
        end = start + size;
      const lowerBound = posts.filter(
        (p) =>
          p.type !== "repost" &&
          p.type !== "unknown" &&
          p.publishedAt !== null &&
          Date.parse(p.publishedAt) >= start &&
          Date.parse(p.publishedAt) < end &&
          Date.parse(p.publishedAt) <= now,
      ).length;
      const future = end > now;
      let complete = !future && ruleIds.length > 0,
        reason = future
          ? "Période en cours ou future : total non établi."
          : "Couverture non renseignée pour toutes les règles.";
      for (const ruleId of ruleIds) {
        const w = windows.filter(
          (w) =>
            w.ruleId === ruleId &&
            (!w.knownAt || Date.parse(w.knownAt) <= now) &&
            overlaps(start, end, Date.parse(w.start), Date.parse(w.end)),
        );
        if (w.some((w) => w.status !== "observed")) {
          complete = false;
          reason = "Interruption ou couverture partielle documentée.";
          continue;
        }
        let until = start;
        for (const segment of w
          .filter((w) => w.status === "observed")
          .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
          if (Date.parse(segment.start) > until) break;
          until = Math.max(until, Date.parse(segment.end));
        }
        if (until < end) complete = false;
      }
      return {
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        relativeMinutes: ((index - baselineBuckets) * bucketSeconds) / 60,
        mentions: complete ? lowerBound : null,
        lowerBound,
        status: complete
          ? ("observed" as const)
          : future
            ? ("pending" as const)
            : ("gap" as const),
        reason: complete
          ? "Observations dans le périmètre des règles suivies ; pas une mesure exhaustive de X."
          : reason,
      };
    },
  );
  const before = buckets.slice(0, baselineBuckets),
    after = buckets.slice(baselineBuckets);
  const baselineTotal = before.every((b) => b.mentions !== null)
    ? before.reduce((s, b) => s + BigInt(b.mentions!), 0n)
    : null;
  return {
    buckets,
    baselineMean:
      baselineTotal === null
        ? null
        : (Number(baselineTotal) / baselineBuckets).toString(),
    baselineTotal: baselineTotal?.toString() ?? null,
    algorithm: "event-attention-v1",
    knowledge: "CALCULATED" as const,
    after: after.map((b) => {
      const hundredths =
        baselineTotal !== null && baselineTotal > 0n && b.mentions !== null
          ? (BigInt(b.mentions) * BigInt(baselineBuckets) * 100n +
              baselineTotal / 2n) /
            baselineTotal
          : null;
      return {
        ...b,
        multiplier:
          hundredths === null
            ? null
            : `${hundredths / 100n},${String(hundredths % 100n).padStart(2, "0")}`,
        multiplierReason:
          baselineTotal === null
            ? "Ligne de base incomplète."
            : baselineTotal === 0n
              ? "Ligne de base nulle : multiplicateur indéfini."
              : b.mentions === null
                ? "Couverture insuffisante dans cette période."
                : null,
      };
    }),
  };
}
export interface Milestone {
  kind:
    | "original_signal"
    | "app_detection"
    | "first_x"
    | "followed_mention"
    | "token_creation"
    | "first_token_mention";
  at: string | null;
  label: string;
  source: string;
  knowledge: "OBSERVED" | "CALCULATED" | "INTERPRETED";
}
export function eventChronology(input: {
  signalAt: string;
  detectedAt: string;
  source: string | null;
  posts: {
    publishedAt: string | null;
    collectedAt: string;
    followed: boolean;
  }[];
  tokens: {
    id: string;
    createdAt: string | null;
    firstMentionAt: string | null;
  }[];
  asOf: string;
}) {
  const visible = input.posts.filter(
    (p) =>
      Date.parse(p.collectedAt) <= Date.parse(input.asOf) &&
      p.publishedAt !== null &&
      Date.parse(p.publishedAt) <= Date.parse(input.asOf),
  );
  const first = (p: typeof visible) =>
    p
      .map((p) => p.publishedAt!)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const timeline: Milestone[] = [
    {
      kind: "original_signal",
      at: input.signalAt,
      label: "Premier signal connu, sans garantie d’être le tout premier",
      source: input.source ?? "Source originale non établie",
      knowledge: "OBSERVED",
    },
    {
      kind: "app_detection",
      at: input.detectedAt,
      label: "Détection par l’application",
      source: "Registre de l’application",
      knowledge: "OBSERVED",
    },
    {
      kind: "first_x",
      at: first(visible),
      label: "Première publication X liée connue",
      source: "Publications liées disponibles",
      knowledge: "OBSERVED",
    },
    {
      kind: "followed_mention",
      at: first(visible.filter((p) => p.followed)),
      label: "Première mention connue par une personne suivie",
      source: "Identifiants des personnes suivies",
      knowledge: "OBSERVED",
    },
  ];
  for (const token of input.tokens)
    timeline.push(
      {
        kind: "token_creation",
        at: token.createdAt,
        label: `Création du token associé ${token.id}`,
        source:
          "Date enregistrée par le fournisseur de chaîne ; association préexistante interprétée",
        knowledge: "OBSERVED",
      },
      {
        kind: "first_token_mention",
        at: token.firstMentionAt,
        label: `Première mention exacte connue du token ${token.id}`,
        source: "Preuves sociales enregistrées, pas le symbole seul",
        knowledge: "OBSERVED",
      },
    );
  return timeline
    .filter((t) => t.at === null || Date.parse(t.at) <= Date.parse(input.asOf))
    .sort(
      (a, b) =>
        (a.at === null ? Infinity : Date.parse(a.at)) -
          (b.at === null ? Infinity : Date.parse(b.at)) ||
        a.kind.localeCompare(b.kind),
    );
}
export function authorCategory(
  id: string | null,
  followed: boolean,
  officialAccounts: EventWatchInput["officialAccounts"],
) {
  return id && officialAccounts.some((a) => a.userId === id)
    ? "official_attested"
    : followed
      ? "followed"
      : "other";
}
