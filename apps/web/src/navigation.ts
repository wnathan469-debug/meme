export const navigation = [
  { id: "dashboard", icon: "◈", label: "Tableau de bord" },
  { id: "watch", icon: "⌁", label: "Veille X" },
  { id: "conversations", icon: "◌", label: "Conversations" },
  { id: "people", icon: "♙", label: "Personnes suivies" },
  { id: "events", icon: "◎", label: "Événements" },
  { id: "tokens", icon: "⬡", label: "Tokens détectés" },
  { id: "alerts", icon: "♧", label: "Alertes" },
  { id: "sources", icon: "◫", label: "Sources et API" },
  { id: "settings", icon: "⚙", label: "Paramètres" },
] as const;
export type Page = (typeof navigation)[number]["id"] | "analysis";
export const globalKeys = [
  "q",
  "chain",
  "confidence",
  "period",
  "personFilter",
  "categoryFilter",
  "tag",
  "eventFilter",
  "risk",
  "quality",
] as const;
export function routeParams(hash: string) {
  const value = hash.replace(/^#/, "");
  return new URLSearchParams(
    value.startsWith("/tokens") ? (value.split("?")[1] ?? "") : value,
  );
}
export function readRoute(hash: string) {
  const value = hash.replace(/^#/, ""),
    params = routeParams(hash),
    raw = params.get("page");
  const chartPath = value.startsWith("/tokens") ? value.split("?")[0] : null;
  const known =
    raw === null || raw === "analysis" || navigation.some((n) => n.id === raw);
  const invalid =
    value.length > 8192 ||
    Array.from(params.values()).some((v) => v.length > 300) ||
    Array.from(params.keys()).some((k) => params.getAll(k).length > 1);
  return {
    chartPath,
    page: chartPath
      ? ("analysis" as Page)
      : known && raw
        ? (raw as Page)
        : ("dashboard" as Page),
    query: params.get("q") ?? "",
    chain: params.get("chain") ?? "Toutes",
    confidence: params.get("confidence") ?? "Tous",
    event: chartPath ? null : params.get("event"),
    token: chartPath ? null : params.get("token"),
    conversation: chartPath ? null : params.get("conversation"),
    error: !known
      ? "Cette page n’existe pas."
      : invalid
        ? "Les paramètres du lien sont invalides ou trop longs."
        : null,
  };
}
export function pageHref(
  page: Page,
  hash: string,
  extra: Record<string, string> = {},
) {
  const old = routeParams(hash),
    params = new URLSearchParams({ page });
  for (const key of globalKeys)
    if (old.has(key)) params.set(key, old.get(key)!);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return "#" + params.toString();
}
export function filterHref(
  hash: string,
  changes: Record<string, string | null>,
) {
  const params = routeParams(hash),
    value = hash.replace(/^#/, "");
  for (const [key, v] of Object.entries(changes))
    if (v) params.set(key, v);
    else params.delete(key);
  const prefix = value.startsWith("/tokens") ? value.split("?")[0] + "?" : "";
  return "#" + prefix + params.toString();
}
