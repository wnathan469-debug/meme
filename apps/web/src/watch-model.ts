import { scenarioPosts } from "../../../packages/demo/scenario";
import { z } from "zod";
import { eventAt, eventTerms } from "../../../packages/events/demo-data";
import { DEMO_EVENT_ID, matchEvent } from "../../../packages/events/model";
import { demoChartRegistry } from "../../../packages/charts/demo-data";
import { contractCandidates } from "../../../packages/conversations/model";
export const watchFilters = z.object({
  q: z.string().max(300).default(""),
  period: z.enum(["all", "15", "60"]).default("all"),
  personFilter: z.string().max(100).default(""),
  categoryFilter: z.string().max(100).default(""),
  tag: z.string().max(100).default(""),
  eventFilter: z.enum(["", DEMO_EVENT_ID]).default(""),
  chain: z.enum(["Toutes", "Base", "Solana"]).default("Toutes"),
  quality: z.enum(["all", "dated", "metrics"]).default("all"),
});
export type WatchFilters = z.infer<typeof watchFilters>;
export type Followed = {
  id: string;
  xUserId: string | null;
  username: string;
  categoryId: string | null;
  status: string;
};
export const cleanText = (s: string) =>
  s.replace(
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
    "",
  );
export function selectWatch(
  raw: unknown,
  minute: number,
  people: Followed[] = [],
) {
  const f = watchFilters.parse(raw),
    at = Date.parse(eventAt(minute));
  return [...new Map(scenarioPosts.map((p) => [p.id, p])).values()]
    .filter((p) => {
      const acquired = Date.parse(p.collectedAt),
        published = p.publishedAt ? Date.parse(p.publishedAt) : null;
      if (acquired > at || (published !== null && published > at)) return false;
      if (
        f.period !== "all" &&
        (published === null || published < at - Number(f.period) * 60000)
      )
        return false;
      if (
        !cleanText(p.text)
          .toLocaleLowerCase("fr")
          .includes(f.q.toLocaleLowerCase("fr"))
      )
        return false;
      if (
        f.personFilter &&
        !people.some((x) => x.id === f.personFilter && x.xUserId === p.authorId)
      )
        return false;
      if (
        f.categoryFilter &&
        !people.some(
          (x) => x.categoryId === f.categoryFilter && x.xUserId === p.authorId,
        )
      )
        return false;
      if (
        f.tag &&
        !p.entities.hashtags.some(
          (t) => t.toLowerCase() === f.tag.replace(/^#/, "").toLowerCase(),
        )
      )
        return false;
      if (f.eventFilter && !matchEvent(p, eventTerms)) return false;
      if (
        f.chain !== "Toutes" &&
        !watchTokens(p.text).some((t) => t.chain === f.chain.toLowerCase())
      )
        return false;
      if (f.quality === "dated" && published === null) return false;
      if (
        f.quality === "metrics" &&
        Object.values(p.metrics).some((n) => n === null)
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        Date.parse(b.publishedAt ?? b.collectedAt) -
          Date.parse(a.publishedAt ?? a.collectedAt) ||
        a.id.localeCompare(b.id),
    );
}
export function watchTokens(text: string) {
  const addresses = contractCandidates(text, "DEMO");
  return demoChartRegistry.filter((t) => addresses.includes(t.address));
}

export function attentionRises(
  snapshot: ReturnType<
    typeof import("../../../packages/events/demo-data").demoEventSnapshot
  >,
) {
  const base = snapshot.attention.baselineTotal;
  if (base === null || BigInt(base) === 0n) return [];
  return snapshot.attention.after
    .filter(
      (b) =>
        b.mentions !== null && BigInt(b.mentions) * 6n >= BigInt(base) * 2n,
    )
    .sort((a, b) =>
      BigInt(a.mentions!) > BigInt(b.mentions!)
        ? -1
        : BigInt(a.mentions!) < BigInt(b.mentions!)
          ? 1
          : a.relativeMinutes - b.relativeMinutes,
    )
    .slice(0, 3);
}
