import { z } from "zod";
import { endpointNames } from "../connectors/x/contracts";
import { ProviderError } from "../shared/errors";

// Renderer-safe definitions: no credential, config object, query, raw URL or provider body.
export const providers = {
  x: {
    name: "X",
    docs: "https://docs.x.com/",
    terms: "https://developer.x.com/en/developer-terms/agreement-and-policy",
  },
  gecko: {
    name: "GeckoTerminal",
    docs: "https://apiguide.geckoterminal.com/",
    terms: "https://www.coingecko.com/en/terms",
  },
  goplus: {
    name: "GoPlus",
    docs: "https://docs.gopluslabs.io/",
    terms: "https://gopluslabs.io/terms",
  },
} as const;
export type ProviderId = keyof typeof providers;
export const providerSchema = z.enum(["x", "gecko", "goplus"]);
export const namespaceSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const micros = z.string().regex(/^(0|[1-9]\d{0,39})$/);
const cap = z.object({ daily: micros, monthly: micros });
export const settingsSchema = z
  .object({
    enabled: z.boolean(),
    budget: cap.extend({
      warningPercent: z.number().int().min(1).max(100),
      features: z.object({
        watch: cap.optional(),
        people: cap.optional(),
        conversations: cap.optional(),
      }),
    }),
    priorities: z.object({
      critical: z.number().int().min(60).max(86400),
      high: z.number().int().min(60).max(86400),
      normal: z.number().int().min(60).max(86400),
      low: z.number().int().min(60).max(86400),
    }),
    cache: z.object({
      posts: z.number().int().min(60).max(3600),
      profiles: z.number().int().min(0).max(300),
      market: z.number().int().min(0).max(86400),
      risks: z.number().int().min(0).max(300),
    }),
  })
  .strict();
export type ProviderSettings = z.infer<typeof settingsSchema>;
export const defaultSettings = (): ProviderSettings => ({
  enabled: false,
  budget: { daily: "0", monthly: "0", warningPercent: 80, features: {} },
  priorities: { critical: 60, high: 300, normal: 900, low: 3600 },
  cache: { posts: 300, profiles: 300, market: 60, risks: 300 },
});
export const diagnosticCodes = [
  "NETWORK_DISABLED",
  "NOT_CONFIGURED",
  "INVALID_INPUT",
  "UNSAFE_URL",
  "TIMEOUT",
  "NETWORK_ERROR",
  "INVALID_RESPONSE",
  "ACCESS_DENIED",
  "RATE_LIMITED",
  "CIRCUIT_OPEN",
  "PROVIDER_UNAVAILABLE",
  "BUDGET_EXCEEDED",
  "PRICING_UNKNOWN",
  "STORE_UNAVAILABLE",
  "PROTECTED_ACCOUNT",
  "NOT_FOUND",
  "COLLECTION_LEASE_LOST",
] as const;
export const diagnosticSchema = z
  .object({
    id: z.uuid(),
    endpoint: z.enum([
      ...endpointNames,
      "metrics",
      "pools",
      "history",
      "trades",
      "networks",
      "supported_chains",
      "token_security",
    ]),
    at: z.iso.datetime(),
    code: z.enum(diagnosticCodes).nullable(),
    status: z.number().int().min(100).max(599).nullable(),
    quota: z
      .object({
        limit: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER)
          .nullable(),
        remaining: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER)
          .nullable(),
        resetAt: z.iso.datetime().nullable(),
      })
      .nullable(),
    retryAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ProviderDiagnostic = z.infer<typeof diagnosticSchema>;
export const publicPricingSchema = z.object({
  currency: z.literal("USD"),
  request: micros,
  post: micros,
  user: micros,
  verifiedAt: z.iso.datetime(),
});
export type PricingView = z.infer<typeof publicPricingSchema>;
export interface SourceBinding {
  provider: ProviderId;
  namespace: string;
  configured: boolean;
  hostAllowed: boolean;
  pricing: PricingView | null;
  settings: ProviderSettings;
  collectionMode: string;
  minimumIntervalSeconds: number;
}
export function usd(value: string) {
  micros.parse(value);
  const n = BigInt(value);
  return `${n / 1000000n},${String(n % 1000000n).padStart(6, "0")} USD`;
}
export function parseUsd(value: string) {
  const s = value.trim().replace(",", ".");
  if (!/^(0|[1-9]\d{0,33})(?:\.\d{1,6})?$/.test(s))
    throw new Error("Montant USD invalide (six décimales maximum).");
  const [a, b = ""] = s.split(".");
  return micros.parse(
    (BigInt(a) * 1000000n + BigInt(b.padEnd(6, "0"))).toString(),
  );
}
export function percent(spent: string, limit: string): string | null {
  micros.parse(spent);
  micros.parse(limit);
  return BigInt(limit) === 0n
    ? null
    : ((BigInt(spent) * 10000n) / BigInt(limit) / 100n).toString() +
        "," +
        String(((BigInt(spent) * 10000n) / BigInt(limit)) % 100n).padStart(
          2,
          "0",
        );
}
export function periodKeys(at: string) {
  const d = new Date(z.iso.datetime().parse(at)).toISOString().slice(0, 10);
  return {
    day: "day:" + d,
    month: "month:" + d.slice(0, 7),
    dayStart: d + "T00:00:00.000Z",
    monthStart: d.slice(0, 7) + "-01T00:00:00.000Z",
  };
}
export function scope(
  provider: ProviderId,
  namespace: string,
  origin: "DEMO" | "REAL",
) {
  if (
    !providerSchema.safeParse(provider).success ||
    !namespaceSchema.safeParse(namespace).success
  )
    throw new ProviderError("INVALID_INPUT");
  return `memeradar:provider:${origin}:${provider}:${namespace}`;
}
export const states = {
  connected: "Connecté",
  degraded: "Dégradé",
  error: "En erreur",
  disabled: "Désactivé",
  not_configured: "Non configuré",
} as const;
export function connectionState(input: {
  configured: boolean;
  hostAllowed: boolean;
  settings: ProviderSettings;
  last: ProviderDiagnostic | null;
  asOf: string;
  blockedUntil: string | null;
}) {
  if (!input.configured)
    return {
      state: "not_configured" as const,
      reason:
        "Prérequis hôte incomplets ; aucun secret n’est demandé dans cette page.",
    };
  if (!input.hostAllowed || !input.settings.enabled)
    return {
      state: "disabled" as const,
      reason: "Collecte externe désactivée par l’opérateur ou les réglages.",
    };
  if (
    input.blockedUntil &&
    Date.parse(input.blockedUntil) > Date.parse(input.asOf)
  )
    return {
      state: "degraded" as const,
      reason: "Attente ou coupe-circuit actif ; aucun appel automatique.",
    };
  if (!input.last)
    return {
      state: "degraded" as const,
      reason: "Configuration présente ; connexion non testée.",
    };
  if (input.last.code)
    return {
      state:
        input.last.code === "RATE_LIMITED" || input.last.code === "CIRCUIT_OPEN"
          ? ("degraded" as const)
          : ("error" as const),
      reason:
        "Dernier diagnostic en échec ; consulter le code nettoyé et l’échéance.",
    };
  if (Date.parse(input.asOf) - Date.parse(input.last.at) > 300000)
    return {
      state: "degraded" as const,
      reason:
        "Dernière observation ancienne ; l’état courant de connexion est inconnu.",
    };
  return {
    state: "connected" as const,
    reason:
      "Réponse récente observée ; cela ne garantit ni la couverture de toutes les capacités ni la qualité des données.",
  };
}
export function backoffUntil(
  failures: number,
  at: string,
  remote: string | null,
  jitter: number,
) {
  const now = Date.parse(at),
    remoteAt = remote ? Date.parse(remote) : 0;
  return new Date(
    Math.max(
      remoteAt,
      now +
        Math.min(300000, 1000 * 2 ** Math.min(failures, 8)) *
          (1 + Math.max(0, Math.min(1, jitter))),
      failures >= 3 ? now + 60000 : 0,
    ),
  ).toISOString();
}
