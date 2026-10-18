import { z } from "zod";
import { CHAINS, normalizeAddress, type Chain } from "../social/identity";
import type { Origin } from "../connectors/x/contracts";
export const RISK_NOTICE =
  "Ces éléments sont des signaux automatisés et non une certification de sécurité. L'absence de signal ne signifie pas l'absence de risque. Les memecoins sont très spéculatifs et peuvent subir des manipulations et des pertes rapides.";
export const SOCIAL_NOTICE =
  "Une forte activité sur X ou la mention par un compte connu ne garantit pas la légitimité d'un token. Ces signaux peuvent résulter de promotion payée, de comptes automatisés ou d'usurpation.";
export const checks = {
  holders: "Concentration des détenteurs (hors adresses identifiées)",
  movements: "Mouvements importants et portefeuille du créateur",
  liquidity: "Changements de liquidité observés",
  lp: "Verrouillage ou destruction des jetons LP",
  owner: "Propriétaire ou contrôle privilégié EVM",
  mint: "Possibilité de créer de nouveaux tokens EVM",
  blacklist: "Liste noire EVM",
  pause: "Possibilité de pause EVM",
  fees: "Frais modifiables EVM",
  proxy: "Proxy modifiable EVM",
  unverified: "Code EVM non vérifié",
  mint_authority: "Autorité de création Solana",
  freeze_authority: "Autorité de gel Solana",
  extensions: "Extensions Token-2022",
  metadata_authority: "Autorité de mise à jour des métadonnées Solana",
  sell_restriction: "Possibilité de restreindre les ventes",
  honeypot: "Signal de honeypot ou de vente bloquée",
} as const;
export type Check = keyof typeof checks;
export const statusLabels = {
  signal_detected: "Signal détecté",
  no_signal_detected: "Aucun signal détecté",
  check_failed: "Vérification échouée",
  not_applicable: "Non applicable",
  insufficient_data: "Données insuffisantes",
} as const;
export const identitySchema = z.object({
  origin: z.enum(["DEMO", "REAL"]),
  chain: z.enum(CHAINS),
  address: z.string().max(100),
});
export type RiskIdentity = z.infer<typeof identitySchema>;
export function validateIdentity(input: RiskIdentity) {
  const p = identitySchema.parse(input);
  if (!normalizeAddress(p.chain, p.address, p.origin))
    throw new Error("Invalid token identity");
  return p;
}
export const observationSchema = z.object({
  check: z.enum(Object.keys(checks) as [Check, ...Check[]]),
  result: z.enum(["signal", "clear", "unknown", "error"]),
  source: z.string().min(1).max(120),
  url: z
    .url()
    .max(500)
    .refine((s) => {
      const u = new URL(s);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.hash &&
        !u.port
      );
    }),
  observedAt: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  detail: z.string().min(1).max(4000),
  limitations: z.string().min(1).max(2000),
  complete: z.boolean(),
  validUntil: z.iso.datetime().optional(),
});
export type RiskObservation = z.infer<typeof observationSchema>;
export const batchSchema = identitySchema.extend({
  observations: z.array(observationSchema).max(100),
});
export type RiskBatch = z.infer<typeof batchSchema>;
const evm: Check[] = [
  "owner",
  "mint",
  "blacklist",
  "pause",
  "fees",
  "proxy",
  "unverified",
];
const sol: Check[] = [
  "mint_authority",
  "freeze_authority",
  "extensions",
  "metadata_authority",
];
export function riskReport(
  identity: RiskIdentity,
  batches: RiskBatch[],
  asOf: string,
) {
  validateIdentity(identity);
  const at = Date.parse(z.iso.datetime().parse(asOf));
  const all = batches.flatMap((raw) => {
    const b = batchSchema.parse(raw);
    if (
      b.origin !== identity.origin ||
      b.chain !== identity.chain ||
      normalizeAddress(b.chain, b.address, b.origin) !==
        normalizeAddress(identity.chain, identity.address, identity.origin)
    )
      throw new Error("Risk identity mismatch");
    for (const o of b.observations) {
      if (
        (identity.origin === "DEMO") !==
        (new URL(o.url).hostname === "demo.memeradar.invalid")
      )
        throw new Error("Risk origin mismatch");
    }
    return b.observations;
  });
  return (Object.keys(checks) as Check[]).map((check) => {
    const applicable = !(identity.chain === "solana" ? evm : sol).includes(
      check,
    );
    // A later acquisition is not knowledge available in an earlier simulation.
    const evidence = all.filter(
      (o) =>
        o.check === check &&
        Date.parse(o.observedAt) <= at &&
        Date.parse(o.fetchedAt) <= at &&
        Date.parse(o.observedAt) <= Date.parse(o.fetchedAt),
    );
    const latest = [...new Set(evidence.map((o) => o.source))].flatMap(
      (source) => {
        const same = evidence.filter((o) => o.source === source);
        const max = Math.max(...same.map((o) => Date.parse(o.observedAt)));
        return same.filter((o) => Date.parse(o.observedAt) === max);
      },
    );
    const fresh = latest.filter(
      (o) =>
        at - Date.parse(o.observedAt) <= 300000 &&
        (!o.validUntil || at < Date.parse(o.validUntil)),
    );
    const conflict =
      fresh.some((o) => o.result === "signal") &&
      fresh.some((o) => o.result === "clear");
    const status: keyof typeof statusLabels = !applicable
      ? "not_applicable"
      : conflict
        ? "insufficient_data"
        : fresh.some((o) => o.result === "signal")
          ? "signal_detected"
          : fresh.some((o) => o.result === "error")
            ? "check_failed"
            : fresh.length &&
                fresh.every((o) => o.result === "clear" && o.complete)
              ? "no_signal_detected"
              : "insufficient_data";
    return {
      check,
      title: checks[check],
      status,
      evidence: applicable ? latest : [],
      explanation: !applicable
        ? `Contrôle réservé à la famille ${identity.chain === "solana" ? "EVM" : "Solana"}.`
        : conflict
          ? "Sources contradictoires : aucune conclusion consolidée."
          : !latest.length
            ? "Aucune observation disponible à cet instant."
            : !fresh.length
              ? "Observations anciennes ou échéance de validité dépassée : nouvelle vérification nécessaire."
              : "Résultat limité aux données et à la portée de chaque source.",
    };
  });
}
export type RiskFinding = ReturnType<typeof riskReport>[number];
export function identity(
  origin: Origin,
  chain: Chain,
  address: string,
): RiskIdentity {
  return validateIdentity({ origin, chain, address });
}
