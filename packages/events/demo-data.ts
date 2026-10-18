import {
  demoConversationSnapshot,
  demoContract,
} from "../conversations/demo-data";
import {
  DEMO_EVENT_ID,
  EVENT_TITLE,
  matchEvent,
  attentionSeries,
  eventChronology,
  authorCategory,
  type CoverageWindow,
  type EventWatchInput,
} from "./model";
import type { XPost } from "../connectors/x/contracts";
export const eventAt = (minute: number) =>
  new Date(
    Date.parse("2026-01-15T14:00:00.000Z") + minute * 60000,
  ).toISOString();
export const eventTerms: EventWatchInput["terms"] = [
  { kind: "phrase", text: "Nébula Mobile" },
  { kind: "hashtag", text: "NebulaProduit" },
];
export const eventRuleId = "00000000-0000-4000-8000-000000000061";
export const officialAttestations = [
  {
    userId: "DEMO_NEBULA_OFFICIAL",
    evidenceUrl: "https://demo.memeradar.invalid/nebula/communique",
    reviewedAt: eventAt(0),
  },
];
const actors = [
  {
    id: "DEMO_NEBULA_OFFICIAL",
    username: "demo_nebula_officiel",
    name: "[DÉMO] Nébula Mobile officiel",
  },
  {
    id: "DEMO_USER_A",
    username: "demo_analyste_julie",
    name: "[DÉMO] Julie Cosmique",
  },
  {
    id: "DEMO_USER_B",
    username: "demo_fondateur_marc",
    name: "[DÉMO] Marc Boréal",
  },
  {
    id: "DEMO_TRADER_K",
    username: "demo_trader_k",
    name: "[DÉMO] Kappa cosmique",
  },
];
const ownPost = (minute: number, index: number, baseline = false) => {
  const actor = baseline
    ? {
        id: "DEMO_PUBLIC_PRE",
        username: "demo_public_avant",
        name: "[DÉMO] Compte public inventé",
      }
    : actors[minute === 12 ? 2 : index % 4];
  const repost = !baseline && index % 6 === 5;
  return {
    id: `DEMO_EVENT_${baseline ? "BEFORE" : "AFTER"}_${index}`,
    text: baseline
      ? "[DÉMO] Nébula Mobile : préparatifs fictifs, sans annonce nouvelle."
      : minute === 12
        ? `[DÉMO] Nébula Mobile : adresse fictive ${demoContract} https://demo.memeradar.invalid/token/base/${demoContract} $NEB, aucun soutien officiel.`
        : minute === 3
          ? "[DÉMO] Nébula Mobile $NEB : un symbole partagé ne suffit pas."
          : minute === 31
            ? `[DÉMO] Nébula Mobile : ancien token ${"0xDEMO" + "0".repeat(34) + "44"} https://demo.memeradar.invalid/token/base/${"0xDEMO" + "0".repeat(34) + "44"}, aucun soutien.`
            : "[DÉMO] Réaction au produit inventé Nébula Mobile #NebulaProduit.",
    authorId: actor.id,
    publishedAt: eventAt(minute),
    collectedAt: eventAt(minute + 0.25),
    conversationId: null,
    references: repost
      ? [{ id: "DEMO_POST_ROOT", type: "retweeted" as const }]
      : [],
    type: repost ? ("repost" as const) : ("original" as const),
    language: "fr",
    metrics: { likes: null, replies: null, reposts: null, quotes: null },
    entities: {
      hashtags: baseline ? [] : ["NebulaProduit"],
      cashtags: [],
      mentions: [],
      urls: [],
    },
    dataOrigin: "DEMO" as const,
    knowledge: "OBSERVED" as const,
    author: actor,
  };
};
export const eventDemoPosts = [
  ...[-29, -24, -19, -18, -14, -9].map((m, i) => ownPost(m, i, true)),
  ...demoConversationSnapshot(),
  ...[1, 2, 3, 4, 6, 8, 9, 11, 12, 13, 16, 21, 26, 31, 41, 46, 51].map((m, i) =>
    ownPost(m, i),
  ),
];
export const eventDemoWindows: CoverageWindow[] = [
  {
    ruleId: eventRuleId,
    start: eventAt(-30),
    end: eventAt(15),
    status: "observed",
    reason: "Rejeu fictif documenté",
  },
  {
    ruleId: eventRuleId,
    start: eventAt(15),
    end: eventAt(20),
    status: "gap",
    reason: "Interruption fictive : aucune baisse ne peut être conclue",
  },
  {
    ruleId: eventRuleId,
    start: eventAt(20),
    end: eventAt(45),
    status: "observed",
    reason: "Rejeu fictif documenté",
  },
  {
    ruleId: eventRuleId,
    start: eventAt(45),
    end: eventAt(50),
    status: "partial",
    reason: "Récupération fictive partielle",
  },
  {
    ruleId: eventRuleId,
    start: eventAt(50),
    end: eventAt(60),
    status: "observed",
    reason: "Rejeu fictif documenté",
  },
].map((w) => ({
  ...w,
  status: w.status as CoverageWindow["status"],
  knownAt: eventAt(60),
}));
export function demoEventSnapshot(
  minute = 60,
  socialDisabled = false,
  indexerDisabled = false,
) {
  const asOf = eventAt(minute),
    posts = eventDemoPosts
      .filter(
        (p) => !socialDisabled && Date.parse(p.collectedAt) <= Date.parse(asOf),
      )
      .flatMap((p) => {
        const link = matchEvent(p, eventTerms);
        if (!link) return [];
        const followed = [
          "DEMO_USER_A",
          "DEMO_USER_B",
          "DEMO_TRADER_K",
        ].includes(p.authorId ?? "");
        return [
          {
            ...p,
            ...link,
            followed,
            category: authorCategory(
              p.authorId,
              followed,
              officialAttestations,
            ),
          },
        ];
      });
  const tokens = indexerDisabled
    ? []
    : [
        {
          id: "[DÉMO] Nébula Étincelle (association plausible préenregistrée)",
          createdAt: eventAt(8),
          firstMentionAt:
            minute >= 12.25 && !socialDisabled ? eventAt(12) : null,
        },
      ];
  return {
    id: DEMO_EVENT_ID,
    title: EVENT_TITLE,
    source: {
      name: "[DÉMO] Salle de presse Nébula Mobile",
      url: officialAttestations[0].evidenceUrl,
      reliability: "A",
      notes:
        "Communiqué officiel entièrement fictif. Une source fiable ne garantit ni la popularité ni la légitimité d’un token.",
    },
    posts,
    attention: attentionSeries({
      signalAt: eventAt(0),
      asOf,
      ruleIds: [eventRuleId],
      windows: socialDisabled ? [] : eventDemoWindows,
      posts,
      baselineBuckets: 6,
      afterBuckets: 12,
      bucketSeconds: 300,
    }),
    timeline: eventChronology({
      signalAt: eventAt(0),
      detectedAt: eventAt(3),
      source: "[DÉMO] Communiqué original Nébula Mobile",
      posts,
      tokens,
      asOf,
    }),
    tokens,
    asOf,
  };
}
