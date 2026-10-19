import { z } from "zod";
import { CHAINS, normalizeAddress } from "../social/identity";
import { decimal, percentChange } from "../charts/decimal";
import { tokenPath } from "../charts/model";
export const kinds = {
  person_post: "Publication d’une personne suivie",
  keyword: "Mot-clé ou hashtag sur X",
  mentions: "Hausse relative des mentions",
  event: "Événement associé à un sujet",
  token: "Nouveau token associé",
  liquidity: "Variation de liquidité",
  transactions: "Variation de l’activité de transactions",
  risk: "Changement d’un contrôle de risque",
  quota: "Quota proche de la limite",
  budget: "Plafond de budget atteint",
  disconnect: "Déconnexion du flux",
  provider_error: "Fournisseur en erreur",
} as const;
export type AlertKind = keyof typeof kinds;
export const zoneSchema = z
  .string()
  .max(80)
  .refine((s) => {
    try {
      new Intl.DateTimeFormat("fr", { timeZone: s }).format();
      return true;
    } catch {
      return false;
    }
  });
const hhmm = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const confidence = z.enum([
  "INSUFFICIENT_DATA",
  "WEAK",
  "PLAUSIBLE",
  "CONFIRMED",
]);
export const ruleSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(Object.keys(kinds) as [AlertKind, ...AlertKind[]]),
    enabled: z.boolean(),
    personId: z.uuid().nullable(),
    terms: z.array(z.string().trim().min(1).max(120)).max(20),
    threshold: z.number().int().min(1).max(10000),
    resetBelow: z.number().int().min(0).max(9999),
    minAssociation: confidence,
    minQuality: z.number().int().min(0).max(100),
    maxAgeSeconds: z.number().int().min(60).max(86400),
    cooldownSeconds: z.number().int().min(0).max(86400),
    groupSeconds: z.number().int().min(0).max(3600),
    maxPerHour: z.number().int().min(1).max(100),
    delivery: z.enum(["immediate", "interval", "daily"]),
    intervalMinutes: z.number().int().min(1).max(10080),
    dailyAt: hhmm,
    zone: zoneSchema,
    quiet: z.object({ enabled: z.boolean(), start: hhmm, end: hhmm }),
  })
  .refine((r) => r.resetBelow < r.threshold, {
    message: "Réarmement inférieur au déclenchement requis.",
  })
  .refine((r) => r.kind !== "person_post" || r.personId !== null, {
    message: "Personne suivie requise.",
  })
  .refine((r) => !["keyword", "event"].includes(r.kind) || r.terms.length > 0, {
    message: "Au moins un terme requis.",
  });
export type AlertRule = z.infer<typeof ruleSchema>;
const exact = z
  .string()
  .max(100)
  .refine((s) => {
    try {
      decimal(s);
      return true;
    } catch {
      return false;
    }
  });
const riskStatus = z.enum([
  "signal_detected",
  "no_signal_detected",
  "check_failed",
  "not_applicable",
  "insufficient_data",
]);
export const candidateSchema = z.object({
  id: z.string().min(1).max(150),
  origin: z.enum(["DEMO", "REAL"]),
  kind: z.enum(Object.keys(kinds) as [AlertKind, ...AlertKind[]]),
  subject: z.object({
    type: z.enum(["event", "token", "source"]),
    id: z.uuid(),
  }),
  at: z.iso.datetime(),
  collectedAt: z.iso.datetime(),
  quality: z.number().int().min(0).max(100),
  complete: z.boolean(),
  source: z.string().min(1).max(120),
  sourceUrl: z
    .url()
    .max(500)
    .refine((s) => {
      const u = new URL(s);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        !u.search &&
        !u.hash
      );
    }),
  text: z.string().max(1000).default(""),
  postId: z.string().max(100).optional(),
  personId: z.uuid().optional(),
  authorId: z.string().max(100).optional(),
  hashtags: z.array(z.string().max(100)).max(50).default([]),
  cashtags: z.array(z.string().max(100)).max(50).default([]),
  addresses: z
    .array(z.object({ chain: z.enum(CHAINS), address: z.string().max(100) }))
    .max(30)
    .default([]),
  token: z
    .object({ chain: z.enum(CHAINS), address: z.string().max(100) })
    .optional(),
  association: confidence.optional(),
  before: exact.optional(),
  after: exact.optional(),
  baselineSamples: z.number().int().min(3).max(288).optional(),
  previousRisk: riskStatus.nullable().optional(),
  nextRisk: riskStatus.optional(),
  riskCheck: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
export type AlertCandidate = z.infer<typeof candidateSchema>;
export function parseCandidate(raw: unknown): AlertCandidate {
  const c = candidateSchema.parse(raw);
  if (
    (c.origin === "DEMO") !==
    (new URL(c.sourceUrl).hostname === "demo.memeradar.invalid")
  )
    throw new Error("Origin mismatch");
  for (const t of [...c.addresses, ...(c.token ? [c.token] : [])])
    if (!normalizeAddress(t.chain, t.address, c.origin))
      throw new Error("Invalid token address");
  for (const id of [c.postId, c.authorId])
    if (
      id !== undefined &&
      !(c.origin === "REAL" ? /^\d{1,30}$/ : /^DEMO_[A-Za-z0-9_]+$/).test(id)
    )
      throw new Error("Invalid social ID");
  if (["mentions", "transactions", "quota", "budget"].includes(c.kind))
    for (const n of [c.before, c.after])
      if (n !== undefined && !/^(0|[1-9]\d*)$/.test(n))
        throw new Error("Noninteger count");
  if (
    ["quota", "budget", "disconnect", "provider_error"].includes(c.kind) &&
    c.text !== ""
  )
    throw new Error("Technical payload must not contain provider error bodies");
  if (c.subject.type === "token" && !c.token)
    throw new Error("Missing token identity");
  return c;
}
const canonical = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim();
export function matchesTerms(rule: AlertRule, c: AlertCandidate): boolean {
  return rule.terms.some((term) => {
    if (term.startsWith("#"))
      return c.hashtags.some((s) => canonical(s) === canonical(term.slice(1)));
    if (term.startsWith("$"))
      return c.cashtags.some((s) => canonical(s) === canonical(term.slice(1)));
    const [chain, address] = term.split(":");
    if ((CHAINS as readonly string[]).includes(chain) && address)
      return c.addresses.some(
        (a) =>
          a.chain === chain &&
          normalizeAddress(a.chain, a.address, c.origin) ===
            normalizeAddress(a.chain, address, c.origin) &&
          !!normalizeAddress(a.chain, address, c.origin),
      );
    const t = canonical(term);
    return !!t && ` ${canonical(c.text)} `.includes(` ${t} `);
  });
}
const ranks = { INSUFFICIENT_DATA: 0, WEAK: 1, PLAUSIBLE: 2, CONFIRMED: 3 };
/** No market prices or counts are compared with binary floating point. */
export function inspect(rule: AlertRule, c: AlertCandidate) {
  const no = (reason: string) => ({ trigger: false, rearm: false, reason });
  if (!c.complete) return no("Couverture insuffisante pour cette comparaison.");
  if (c.kind === "person_post" || c.kind === "keyword" || c.kind === "event") {
    if (
      c.kind === "person_post" &&
      (!c.postId || !c.authorId || c.personId !== rule.personId)
    )
      return no("Personne/publication non identifiée.");
    if (
      (rule.terms.length || c.kind !== "person_post") &&
      !matchesTerms(rule, c)
    )
      return no("Aucun terme de la règle dans les données observées.");
    return {
      trigger: true,
      rearm: true,
      reason: `${kinds[c.kind]} : ${c.text.slice(0, 280)}`,
    };
  }
  if (c.kind === "token")
    return {
      trigger:
        !!c.association &&
        ranks[c.association] >= ranks[rule.minAssociation] &&
        c.association !== "INSUFFICIENT_DATA",
      rearm: true,
      reason: `Nouveau token : association ${c.association ?? "inconnue"}, minimum ${rule.minAssociation}. Une association n’est pas une légitimation.`,
    };
  if (c.kind === "risk")
    return {
      trigger:
        c.nextRisk !== undefined &&
        c.previousRisk !== undefined &&
        !!c.riskCheck &&
        (c.previousRisk === null
          ? c.nextRisk === "signal_detected"
          : c.previousRisk !== c.nextRisk),
      rearm: true,
      reason: `Contrôle ${c.riskCheck ?? "inconnu"} : ${c.previousRisk ?? "aucun état antérieur"} → ${c.nextRisk ?? "inconnu"}. Un échec ou une inconnue ne prouve pas une fraude.`,
    };
  if (c.kind === "disconnect" || c.kind === "provider_error")
    return {
      trigger: c.active === true,
      rearm: c.active === false,
      reason:
        c.active === undefined
          ? "État fournisseur inconnu."
          : `${kinds[c.kind]} : ${c.active ? "oui" : "rétabli"}.`,
    };
  if (c.before === undefined || c.after === undefined)
    return no("Valeurs de comparaison manquantes.");
  const b = decimal(c.before),
    a = decimal(c.after);
  if (b === 0n)
    return no(
      c.kind === "mentions"
        ? "Ligne de base nulle : hausse relative indéfinie."
        : "Dénominateur nul : comparaison indéfinie.",
    );
  let numerator: bigint,
    denominator = b,
    reason: string;
  if (c.kind === "mentions") {
    if (!c.baselineSamples) return no("Ligne de base incomplète.");
    numerator = a * BigInt(c.baselineSamples) * 100n;
    reason = `Mentions : ${c.after} dans la fenêtre, ligne de base totale ${c.before} sur ${c.baselineSamples} fenêtres de même durée ; seuil ${rule.threshold} % de la moyenne. Couverture vérifiée par l’hôte.`;
  } else if (c.kind === "quota" || c.kind === "budget") {
    numerator = a * 100n;
    reason = `${kinds[c.kind]} : ${c.after} / ${c.before} unités du même compteur ; seuil ${c.kind === "budget" ? 100 : rule.threshold} %.`;
  } else {
    numerator = (a > b ? a - b : b - a) * 100n;
    reason = `${kinds[c.kind]} : ${c.before} → ${c.after} ; variation ${percentChange(c.before, c.after)} %, seuil absolu ${rule.threshold} %. Comparaison à périmètre constant ; cause non établie.`;
  }
  const threshold = c.kind === "budget" ? 100 : rule.threshold;
  return {
    trigger: numerator >= denominator * BigInt(threshold),
    rearm: numerator <= denominator * BigInt(rule.resetBelow),
    reason,
  };
}
export function candidateLinks(c: AlertCandidate) {
  const links: { label: string; href: string }[] = [];
  if (c.subject.type === "event")
    links.push({
      label: "Voir l’événement",
      href: `#page=events&event=${c.subject.id}`,
    });
  if (c.token) {
    links.push({
      label: "Fiche et graphique du token",
      href: "#" + tokenPath(c.token.chain, c.token.address),
    });
  }
  if (c.postId)
    links.push({
      label: "Voir la publication",
      href:
        c.origin === "REAL"
          ? `https://x.com/i/web/status/${c.postId}`
          : `#page=watch&post=${encodeURIComponent(c.postId)}`,
    });
  return links;
}
export function defaultRule(
  id: string,
  kind: AlertKind = "keyword",
): AlertRule {
  return ruleSchema.parse({
    id,
    name: "[DÉMO] Nouvelle règle",
    kind,
    enabled: true,
    personId: null,
    terms: ["Nébula"],
    threshold: kind === "mentions" ? 200 : kind === "quota" ? 80 : 20,
    resetBelow: kind === "mentions" ? 100 : kind === "quota" ? 70 : 10,
    minAssociation: "PLAUSIBLE",
    minQuality: 80,
    maxAgeSeconds: 3600,
    cooldownSeconds: 300,
    groupSeconds: 0,
    maxPerHour: 10,
    delivery: "immediate",
    intervalMinutes: 15,
    dailyAt: "09:00",
    zone: "America/Toronto",
    quiet: { enabled: false, start: "22:00", end: "07:00" },
  });
}
