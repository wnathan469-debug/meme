export const WARNING =
  "Cette analyse est automatisée, peut être incomplète et ne constitue pas un conseil financier. Les memecoins sont des actifs très spéculatifs ; il est possible de perdre la totalité des sommes investies.";
export const RISK_WARNING =
  "Ces éléments sont des signaux automatisés et non des preuves. L'absence de signal ne signifie pas l'absence de risque. La volatilité, les ventes coordonnées et les retraits de liquidité peuvent entraîner des pertes importantes.";
export type Confidence =
  "CONFIRMED" | "PLAUSIBLE" | "WEAK" | "INSUFFICIENT_DATA";
export type Level =
  "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "INSUFFICIENT_DATA";
export type IndicatorName =
  | "ATTENTION"
  | "EVENT_LINK"
  | "DATA_QUALITY"
  | "ONCHAIN_RISK"
  | "ANALYSIS_CONFIDENCE";
export interface Provenance {
  source: string;
  url: string;
  observed_at: string;
  knowledge: "OBSERVED" | "CALCULATED" | "INTERPRETED";
  data_origin: "DEMO";
}
export interface Metric extends Provenance {
  value: string | null;
  unit: string;
  missing_reason?: string;
}
export interface Indicator {
  indicator: IndicatorName;
  level: Level;
  inputs_used: {
    name: string;
    value: string;
    source: string;
    observed_at: string;
  }[];
  factors: {
    name: string;
    effect: "augmente" | "diminue";
    weight: number;
    explanation: string;
  }[];
  missing_inputs: { name: string; reason: string }[];
  algorithm_version: string;
  computed_at: string;
}
export interface NewsItem extends Provenance {
  id: string;
  title: string;
  minute: number;
  tier: "A" | "B" | "D";
}
export interface Event {
  id: string;
  title: string;
  category: string;
  summary: string;
  entity: string;
  reliability: "A" | "B";
  popularity: Level;
  mentions: number[];
  items: NewsItem[];
  first_published_at: string;
  first_detected_at: string;
  data_origin: "DEMO";
}
export interface Risk {
  title: string;
  status:
    | "signal_detected"
    | "no_signal_detected"
    | "check_failed"
    | "insufficient_data";
  severity: "high" | "medium" | "info";
  evidence: string;
  limitations: string;
  source: string;
  observed_at: string;
}
export interface Token {
  id: string;
  event_id: string;
  name: string;
  symbol: string;
  chain: "Base" | "Solana";
  address: string;
  minute: number | null;
  officialClaim: boolean;
  thematic: boolean;
  additionalEvidence: boolean;
  metadata: boolean;
  price: Metric;
  liquidity: Metric;
  volume: Metric;
  risks: Risk[];
  data_origin: "DEMO";
}
export const LABELS: Record<Confidence | Level, string> = {
  CONFIRMED: "Confirmé",
  PLAUSIBLE: "Plausible",
  WEAK: "Faible",
  INSUFFICIENT_DATA: "Données insuffisantes",
  VERY_LOW: "Très faible",
  LOW: "Faible",
  MODERATE: "Modéré",
  HIGH: "Élevé",
  VERY_HIGH: "Très élevé",
};
export const INDICATOR_LABELS: Record<IndicatorName, string> = {
  ATTENTION: "Attention",
  EVENT_LINK: "Lien avec l’événement",
  DATA_QUALITY: "Qualité des données",
  ONCHAIN_RISK: "Risque on-chain",
  ANALYSIS_CONFIDENCE: "Confiance de l’analyse",
};
export function isDemoAddress(address: string): boolean {
  return /^(0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})$/.test(address);
}
export class NetworkDisabledInDemoMode extends Error {
  constructor() {
    super("Les appels externes sont désactivés en mode démo.");
    this.name = "NetworkDisabledInDemoMode";
  }
}
export function externalRequest(): never {
  throw new NetworkDisabledInDemoMode();
}
export function associate(token: Token): {
  level: Confidence;
  reasons: string[];
  counter_reasons: string[];
  impersonation: boolean;
  algorithm_version: string;
} {
  const reasons: string[] = [],
    counter: string[] = [];
  if (token.officialClaim)
    counter.push(
      "Le nom revendique un lien officiel sans publication officielle de cette adresse.",
    );
  if (token.thematic)
    reasons.push("Correspondance thématique des métadonnées fictives.");
  if (token.minute !== null && token.minute >= 0)
    reasons.push(
      `Création ${token.minute} minutes après le premier signal du scénario.`,
    );
  if (token.minute !== null && token.minute < 0)
    counter.push(
      "Création antérieure au premier signal : la chronologie ne démontre pas une réaction à cet événement.",
    );
  if (token.additionalEvidence)
    reasons.push(
      "Adresse reprise dans une publication fictive liée à cet événement.",
    );
  let level: Confidence = "WEAK";
  if (!token.metadata || token.minute === null) {
    level = "INSUFFICIENT_DATA";
    counter.push("Métadonnées ou date de création manquantes.");
  } else if (
    token.thematic &&
    token.minute >= 0 &&
    token.minute <= 120 &&
    token.additionalEvidence &&
    !token.officialClaim
  )
    level = "PLAUSIBLE";
  // Demo fixtures never carry official contract proof. A name or metadata cannot confirm a link.
  return {
    level,
    reasons,
    counter_reasons: counter,
    impersonation: token.officialClaim,
    algorithm_version: "association-demo@1.0.0",
  };
}
export function indicators(
  token: Token,
  event: Event,
  minute: number,
): Indicator[] {
  const link = associate(token);
  const at = new Date(
    Date.parse(event.first_published_at) + minute * 60_000,
  ).toISOString();
  const index = Math.min(event.mentions.length - 1, Math.floor(minute / 5));
  const mentions = event.mentions[index] ?? 0;
  const missingRisk = token.risks.every((r) =>
    ["check_failed", "insufficient_data"].includes(r.status),
  );
  const riskHigh = token.risks.some(
    (r) => r.status === "signal_detected" && r.severity === "high",
  );
  const missingMarket =
    token.price.value === null || token.liquidity.value === null;
  const make = (
    name: IndicatorName,
    level: Level,
    input: string,
    value: string,
    explanation: string,
    missing: string[] = [],
  ): Indicator => ({
    indicator: name,
    level,
    inputs_used: [
      {
        name: input,
        value,
        source: "Jeu de démonstration local",
        observed_at: at,
      },
    ],
    factors:
      level === "INSUFFICIENT_DATA"
        ? []
        : [{ name: input, effect: "augmente", weight: 1, explanation }],
    missing_inputs: missing.map((name) => ({
      name,
      reason: "Non disponible dans ce scénario fictif.",
    })),
    algorithm_version: `${name.toLowerCase()}-demo@1.0.0`,
    computed_at: at,
  });
  return [
    make(
      "ATTENTION",
      mentions > 90
        ? "VERY_HIGH"
        : mentions > 50
          ? "HIGH"
          : mentions > 20
            ? "MODERATE"
            : "LOW",
      "mentions_bucket",
      String(mentions),
      "Mentions dans la tranche fictive de 5 minutes. Seuils : >20 modéré, >50 élevé, >90 très élevé.",
    ),
    make(
      "EVENT_LINK",
      link.level === "INSUFFICIENT_DATA"
        ? "INSUFFICIENT_DATA"
        : link.level === "PLAUSIBLE"
          ? "MODERATE"
          : "LOW",
      "association",
      LABELS[link.level],
      "Correspondance thématique et chronologie ; aucune approbation officielle.",
      link.level === "INSUFFICIENT_DATA"
        ? ["métadonnées / date de création"]
        : [],
    ),
    make(
      "DATA_QUALITY",
      missingMarket ? "INSUFFICIENT_DATA" : "MODERATE",
      "marché",
      missingMarket ? "incomplet" : "fixture locale",
      "Les données fictives sont datées mais ne sont pas recoupées avec des fournisseurs réels.",
      missingMarket ? ["prix ou liquidité"] : [],
    ),
    make(
      "ONCHAIN_RISK",
      missingRisk ? "INSUFFICIENT_DATA" : riskHigh ? "HIGH" : "MODERATE",
      "contrôles",
      String(token.risks.length),
      "Le niveau élevé exige au moins un signal de sévérité élevée ; sinon modéré. Ce niveau ne mesure pas la sécurité.",
      missingRisk ? ["contrôles de contrat"] : [],
    ),
    make(
      "ANALYSIS_CONFIDENCE",
      missingMarket || missingRisk ? "INSUFFICIENT_DATA" : "MODERATE",
      "couverture",
      missingMarket || missingRisk ? "partielle" : "scénario documenté",
      "Couverture du jeu fictif ; pas une probabilité de succès.",
      missingMarket || missingRisk ? ["observations complémentaires"] : [],
    ),
  ];
}
export interface Rule {
  id: string;
  name: string;
  threshold: number;
  resetBelow: number;
  cooldown: number;
  enabled: boolean;
}
export interface RuleState {
  armed: boolean;
  lastAt: number | null;
}
export function evaluateAttention(
  value: number,
  minute: number,
  rule: Rule,
  state: RuleState,
): { fire: boolean; reason: string; state: RuleState } {
  if (!rule.enabled) return { fire: false, reason: "Règle désactivée", state };
  if (value < rule.resetBelow)
    return {
      fire: false,
      reason: "Réarmement sous le seuil bas",
      state: { ...state, armed: true },
    };
  if (value < rule.threshold)
    return { fire: false, reason: "Seuil non atteint", state };
  if (!state.armed)
    return {
      fire: false,
      reason: "Hystérésis : attente du retour sous le seuil bas",
      state,
    };
  if (state.lastAt !== null && minute - state.lastAt < rule.cooldown)
    return { fire: false, reason: "Délai de récupération", state };
  return {
    fire: true,
    reason: `${value} mentions fictives / 5 min, seuil ${rule.threshold}`,
    state: { armed: false, lastAt: minute },
  };
}
export interface DemoAlert {
  id: string;
  event_id: string;
  token_id?: string;
  minute: number;
  title: string;
  reason: string;
  suppressed: boolean;
}
export function replayAlerts(
  events: Event[],
  rule: Rule,
  minute: number,
): DemoAlert[] {
  const alerts: DemoAlert[] = [];
  for (const event of events) {
    let state: RuleState = { armed: true, lastAt: null };
    event.mentions.forEach((value, index) => {
      const at = index * 5;
      if (at > minute) return;
      const result = evaluateAttention(value, at, rule, state);
      state = result.state;
      if (
        result.fire ||
        (rule.enabled && value >= rule.threshold && index % 3 === 0)
      )
        alerts.push({
          id: `${rule.id}-${event.id}-${index}`,
          event_id: event.id,
          minute: at,
          title: result.fire
            ? "Seuil d’attention atteint"
            : "Déclenchement supprimé",
          reason: result.reason,
          suppressed: !result.fire,
        });
    });
  }
  return alerts;
}
