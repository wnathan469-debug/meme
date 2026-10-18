import type { Event, Token, Metric, Risk, DemoAlert, NewsItem } from "./domain";
export const BASE_TIME = "2026-01-15T14:00:00.000Z";
export const at = (minute: number) =>
  new Date(Date.parse(BASE_TIME) + minute * 60_000).toISOString();
const url = (path: string) => `https://demo.memeradar.invalid/${path}`;
const series = [
  2, 3, 5, 8, 13, 18, 27, 39, 58, 73, 94, 118, 105, 92, 79, 63, 51, 40, 32, 25,
  19, 14, 10, 7, 5,
];
function items(id: string): NewsItem[] {
  const result: NewsItem[] = [
    {
      id: `${id}-press`,
      title: "[DÉMO] Communiqué d’origine fictif",
      minute: 0,
      tier: "A",
      source: "[DÉMO] Salle de presse",
      url: url(`${id}/press`),
      observed_at: at(0),
      knowledge: "OBSERVED",
      data_origin: "DEMO",
    },
  ];
  for (let i = 0; i < 5; i++)
    result.push({
      id: `${id}-media-${i}`,
      title: `[DÉMO] Reprise du média fictif ${i + 1}`,
      minute: 10 + i * 8,
      tier: "B",
      source: `[DÉMO] Média ${i + 1}`,
      url: url(`${id}/media/${i}`),
      observed_at: at(10 + i * 8),
      knowledge: "OBSERVED",
      data_origin: "DEMO",
    });
  for (let i = 0; i < 20; i++)
    result.push({
      id: `${id}-social-${i}`,
      title: `[DÉMO] Publication publique fictive ${i + 1}`,
      minute: 15 + i * 4,
      tier: "D",
      source: "[DÉMO] Réseau social local",
      url: url(`${id}/social/${i}`),
      observed_at: at(15 + i * 4),
      knowledge: "OBSERVED",
      data_origin: "DEMO",
    });
  return result;
}
export const events: Event[] = [
  {
    id: "tesla",
    title: "[DÉMO] Annonce virale d’un nouveau véhicule par Tesla",
    category: "Technologie",
    entity: "[DÉMO] Tesla",
    summary:
      "Scénario entièrement fictif : un communiqué inventé est repris par des médias et des publications sociales fictives. Aucune affirmation n’est faite sur Tesla ou ses produits réels. Quatre tokens illustrent des associations et des limites différentes.",
    reliability: "A",
    popularity: "HIGH",
    mentions: series,
    items: items("tesla"),
    first_published_at: at(0),
    first_detected_at: at(3),
    data_origin: "DEMO",
  },
  {
    id: "nebula",
    title: "[DÉMO] Le chat cosmique de Nébula devient un mème",
    category: "Culture Internet",
    entity: "[DÉMO] Nébula",
    summary:
      "Un personnage inventé de chat astronaute circule sur un réseau fictif. Les mentions montent sans qu’aucune entité ne publie de contrat officiel.",
    reliability: "B",
    popularity: "MODERATE",
    mentions: series.map((v) => Math.round(v * 0.6)),
    items: items("nebula"),
    first_published_at: at(0),
    first_detected_at: at(7),
    data_origin: "DEMO",
  },
  {
    id: "boreal",
    title: "[DÉMO] La finale des Aurores de Boréal fait réagir",
    category: "Sport",
    entity: "[DÉMO] Aurores de Boréal",
    summary:
      "Un club et une compétition imaginaires alimentent un pic de mentions. Des tokens fictifs reprennent le nom du club sans preuve de soutien officiel.",
    reliability: "A",
    popularity: "MODERATE",
    mentions: series.map((_, i) =>
      Math.round(series[Math.max(0, i - 3)] * 0.4),
    ),
    items: items("boreal"),
    first_published_at: at(0),
    first_detected_at: at(5),
    data_origin: "DEMO",
  },
];
const metric = (value: string | null, unit: string): Metric => ({
  value,
  unit,
  ...(value === null
    ? { missing_reason: "Aucun pool ni observation disponible." }
    : {}),
  source: "[DÉMO] Indexeur fictif",
  url: url("market"),
  observed_at: at(60),
  knowledge: "OBSERVED",
  data_origin: "DEMO",
});
const risk = (
  title: string,
  status: Risk["status"],
  severity: Risk["severity"],
  evidence: string,
): Risk => ({
  title,
  status,
  severity,
  evidence,
  limitations:
    "Résultat simulé localement ; aucune chaîne réelle n’a été interrogée.",
  source: "[DÉMO] Contrôleur fictif",
  observed_at: at(60),
});
function token(
  id: string,
  event_id: string,
  name: string,
  symbol: string,
  index: number,
  kind: "plausible" | "weak" | "imitator" | "missing",
): Token {
  const missing = kind === "missing";
  return {
    id,
    event_id,
    name: `[DÉMO] ${name}`,
    symbol,
    chain: index % 2 ? "Solana" : "Base",
    address:
      index % 2
        ? `DEMo${"1".repeat(31)}${index + 1}`
        : `0xDEMO${String(index + 1).padStart(36, "0")}`,
    minute: missing ? null : kind === "weak" ? -25 : 40 + index * 3,
    officialClaim: kind === "imitator",
    thematic: kind !== "weak",
    additionalEvidence: kind === "plausible",
    metadata: !missing,
    price: metric(missing ? null : "0.00000124", "USD"),
    liquidity: metric(missing ? null : index === 0 ? "18400" : "6200", "USD"),
    volume: metric(missing ? null : "42300", "USD / 24 h"),
    risks: missing
      ? [
          risk(
            "Permissions du contrat",
            "check_failed",
            "info",
            "Métadonnées et lecture du contrat indisponibles.",
          ),
        ]
      : [
          risk(
            "Autorité de création",
            "signal_detected",
            kind === "imitator" ? "high" : "medium",
            "Autorité active dans le jeu fictif.",
          ),
          risk(
            "Concentration top 10",
            "signal_detected",
            "high",
            `${42 + index * 3} % hors pools, burn, verrouillages et plateformes étiquetés ; étiquetage incomplet.`,
          ),
          risk(
            "Liquidité",
            "signal_detected",
            "medium",
            "Statut fictif : non verrouillée ; pas de preuve de verrouillage.",
          ),
        ],
    data_origin: "DEMO",
  };
}
export const tokens: Token[] = [
  token("orbit", "tesla", "Orbit Véhicule", "ORB", 0, "plausible"),
  token("retro", "tesla", "Retro Roue", "RTR", 1, "weak"),
  token(
    "official",
    "tesla",
    "Tesla Official — imitateur",
    "TFO",
    2,
    "imitator",
  ),
  token("unknown", "tesla", "Sans métadonnées", "ND", 3, "missing"),
  token("cosmocat", "nebula", "Cosmochat", "COS", 4, "plausible"),
  token(
    "nebula-copy",
    "nebula",
    "Nébula Official — imitateur",
    "NBO",
    5,
    "imitator",
  ),
  token("aurore", "boreal", "Aurore Tribune", "AUR", 6, "plausible"),
  token("boreal-unknown", "boreal", "Tribune inconnue", "TRI", 7, "missing"),
];
export const initialAlerts: DemoAlert[] = [
  {
    id: "tesla-attention",
    event_id: "tesla",
    minute: 40,
    title: "Accélération des mentions",
    reason:
      "58 mentions fictives dans la tranche, contre 13 vingt minutes auparavant (×4,46).",
    suppressed: false,
  },
  {
    id: "tesla-risk",
    event_id: "tesla",
    token_id: "official",
    minute: 60,
    title: "Usurpation potentielle et concentration",
    reason:
      "Le nom revendique un lien officiel sans adresse publiée par une source officielle ; concentration élevée dans la fixture.",
    suppressed: false,
  },
  {
    id: "tesla-suppressed",
    event_id: "tesla",
    minute: 55,
    title: "Répétition supprimée",
    reason:
      "Même sujet et même règle à moins de 30 minutes du déclenchement précédent.",
    suppressed: true,
  },
];
export const sources = [
  {
    id: "press",
    name: "[DÉMO] Salle de presse",
    type: "Communiqués fictifs",
    tier: "A",
  },
  {
    id: "media",
    name: "[DÉMO] Médias de synthèse",
    type: "5 médias inventés",
    tier: "B",
  },
  {
    id: "social",
    name: "[DÉMO] Réseau social local",
    type: "Publications fictives",
    tier: "D",
  },
  {
    id: "indexer",
    name: "[DÉMO] Indexeur blockchain",
    type: "Marché et risques simulés",
    tier: "E",
  },
] as const;
