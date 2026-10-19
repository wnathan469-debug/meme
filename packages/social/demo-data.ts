import { eventDemoPosts, eventAt } from "../events/demo-data";
import { matchEvent } from "../events/model";
import { eventTerms } from "../events/demo-data";
import { demoContract } from "../conversations/demo-data";
import {
  extractCandidates,
  resolveMentions,
  summarizeSocial,
  type SocialToken,
} from "./model";
export const socialDemoTokens: SocialToken[] = [
  {
    id: "00000000-0000-4000-8000-000000000071",
    chain: "base",
    address: demoContract,
    name: "[DÉMO] Nébula Étincelle",
    symbol: "NEB",
    createdAt: eventAt(8),
  },
  {
    id: "00000000-0000-4000-8000-000000000072",
    chain: "base",
    address: "0xDEMO" + "0".repeat(34) + "43",
    name: "[DÉMO] Nеbula officiel",
    symbol: "NEB",
    createdAt: eventAt(-90),
  },
  {
    id: "00000000-0000-4000-8000-000000000073",
    chain: "base",
    address: "0xDEMO" + "0".repeat(34) + "44",
    name: "[DÉMO] Ancienne Étincelle",
    symbol: "OLDNEB",
    createdAt: eventAt(-120),
  },
  {
    id: "00000000-0000-4000-8000-000000000074",
    chain: "solana",
    address: "DEMo" + "B".repeat(32),
    name: "[DÉMO] Écho Boréal",
    symbol: "ECHO",
    createdAt: eventAt(20),
  },
];
/** Shared event fixtures, no extra posts or pretend official endorsement. Explicit Base context is fictional operator configuration. */
export function demoSocialSnapshot(
  minute = 60,
  disabled = false,
  indexerDisabled = false,
) {
  const posts = disabled
    ? []
    : eventDemoPosts.filter(
        (p) => Date.parse(p.collectedAt) <= Date.parse(eventAt(minute)),
      );
  const mentions = posts.flatMap((p) =>
    resolveMentions(
      p,
      extractCandidates(p, "DEMO", "base"),
      socialDemoTokens,
      "DEMO",
      !!matchEvent(p, eventTerms),
    ),
  );
  return socialDemoTokens.map((token) => ({
    token: {
      ...token,
      createdAt:
        indexerDisabled ||
        Date.parse(token.createdAt!) > Date.parse(eventAt(minute))
          ? null
          : token.createdAt,
    },
    ...summarizeSocial(
      { ...token, createdAt: indexerDisabled ? null : token.createdAt },
      mentions,
      {
        asOf: eventAt(minute),
        signalAt: eventAt(0),
        officialClaim: token.id.endsWith("72"),
      },
    ),
    sourceDisabled: disabled,
    chainDataDisabled: indexerDisabled,
  }));
}
