export type ErrorCode =
  | "NETWORK_DISABLED"
  | "NOT_CONFIGURED"
  | "INVALID_INPUT"
  | "UNSAFE_URL"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "CIRCUIT_OPEN"
  | "PROVIDER_UNAVAILABLE"
  | "BUDGET_EXCEEDED"
  | "PRICING_UNKNOWN"
  | "STORE_UNAVAILABLE"
  | "PROTECTED_ACCOUNT"
  | "NOT_FOUND"
  | "COLLECTION_LEASE_LOST";
const messages: Record<ErrorCode, string> = {
  COLLECTION_LEASE_LOST:
    "Collecte reprise par un autre worker ; résultat périmé refusé.",
  NETWORK_DISABLED: "Les appels externes sont désactivés en mode démo.",
  NOT_CONFIGURED: "Accès X non configuré.",
  INVALID_INPUT: "Paramètres de requête invalides.",
  UNSAFE_URL: "Destination réseau refusée.",
  TIMEOUT: "Délai de réponse du fournisseur dépassé.",
  NETWORK_ERROR: "Connexion au fournisseur interrompue.",
  INVALID_RESPONSE: "Réponse du fournisseur non conforme.",
  ACCESS_DENIED: "Accès indisponible pour cette capacité.",
  RATE_LIMITED: "Limite de débit atteinte ; reprise différée.",
  CIRCUIT_OPEN: "Point de terminaison temporairement suspendu.",
  PROVIDER_UNAVAILABLE: "Fournisseur temporairement indisponible.",
  BUDGET_EXCEEDED: "Plafond de consommation atteint.",
  PRICING_UNKNOWN:
    "Tarification ou plafonds non configurés : appel payant refusé.",
  STORE_UNAVAILABLE: "Registre partagé indisponible : collecte suspendue.",
  PROTECTED_ACCOUNT: "Compte protégé : aucune collecte autorisée.",
  NOT_FOUND: "Compte ou publication non disponible.",
};
export class ProviderError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly retryable = false,
    readonly retryAfterMs = 0,
    readonly sent = false,
    readonly status?: number,
  ) {
    super(messages[code]);
    this.name = "ProviderError";
  }
  toJSON() {
    return { code: this.code, message: this.message, status: this.status };
  }
}
export function failure(code: ErrorCode): never {
  throw new ProviderError(code);
}
export const safeFailure = (error: unknown): ProviderError =>
  error instanceof ProviderError
    ? error
    : new ProviderError("NETWORK_ERROR", true, 0, true);
