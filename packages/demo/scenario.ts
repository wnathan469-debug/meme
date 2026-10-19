import { z } from "zod";
import { eventAt, eventDemoPosts } from "../events/demo-data";
import type { RawPost, RawUser } from "../connectors/x/contracts";
export const scenarioName = "Nébula Mobile";
export const scenarioPosts = [
  ...new Map(eventDemoPosts.map((p) => [p.id, p])).values(),
];
export const scenarioUsers: RawUser[] = [
  ...new Map(
    scenarioPosts.flatMap((p) =>
      p.author
        ? [[p.author.id, { ...p.author, protected: false }] as const]
        : [],
    ),
  ).values(),
];
const metricNames = {
  likes: "like_count",
  replies: "reply_count",
  reposts: "retweet_count",
  quotes: "quote_count",
} as const;
const availableAt = Object.fromEntries(
  scenarioPosts.map((p) => [p.id, p.collectedAt]),
);
export const scenarioDataset = {
  users: scenarioUsers,
  availableAt,
  posts: scenarioPosts
    .map((p): RawPost => ({
      id: p.id,
      text: p.text,
      author_id: p.authorId ?? undefined,
      created_at: p.publishedAt ?? undefined,
      conversation_id: p.conversationId ?? undefined,
      lang: p.language ?? undefined,
      referenced_tweets: p.references.map((r) => ({ id: r.id, type: r.type })),
      entities: {
        hashtags: p.entities.hashtags.map((tag) => ({ tag })),
        cashtags: p.entities.cashtags.map((tag) => ({ tag })),
        mentions: p.entities.mentions.map((username) => ({ username })),
        urls: p.entities.urls.map((url) => ({ url, expanded_url: url })),
      },
      public_metrics: Object.fromEntries(
        Object.entries(p.metrics)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => [metricNames[k as keyof typeof metricNames], v]),
      ),
    }))
    .sort(
      (a, b) =>
        Date.parse(availableAt[a.id]) - Date.parse(availableAt[b.id]) ||
        a.id.localeCompare(b.id),
    ),
};
export const sessionSchema = z
  .object({
    version: z.literal(1),
    minute: z.number().int().min(0).max(4320),
    fault: z.enum([
      "normal",
      "quota",
      "budget",
      "disconnect",
      "error",
      "unconfigured",
      "partial",
    ]),
    faultAt: z.number().int().min(0).max(4320),
  })
  .strict()
  .refine((s) => s.faultAt <= s.minute, "L’état ne peut provenir du futur.");
export type DemoSession = z.infer<typeof sessionSchema>;
export const initialSession = (): DemoSession => ({
  version: 1,
  minute: 60,
  fault: "normal",
  faultAt: 60,
});
export function moveSession(s: DemoSession, minute: number) {
  return sessionSchema.parse({
    ...s,
    minute,
    ...(minute < s.minute ? { fault: "normal", faultAt: minute } : {}),
  });
}
export function faultSession(s: DemoSession, fault: DemoSession["fault"]) {
  return sessionSchema.parse({ ...s, fault, faultAt: s.minute });
}
export const sessionAt = (s: DemoSession) => eventAt(s.minute);
export const sessionAvailable = (s: DemoSession) =>
  ["normal", "partial"].includes(s.fault);
export function sessionSource(s: DemoSession) {
  return {
    clock: sessionAt(s),
    scenario: s.fault === "partial" ? ("normal" as const) : s.fault,
    scenarioAt: eventAt(s.faultAt),
  };
}
