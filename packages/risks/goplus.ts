import { z } from "zod";
import { normalizeAddress } from "../social/identity";
import { ProviderError } from "../shared/errors";
import type { JsonTransport } from "../shared/http";
import type { MarketGate } from "../charts/provider";
import {
  validateIdentity,
  type RiskIdentity,
  type RiskBatch,
  type Check,
} from "./model";
import { observation } from "./adapters";
const networks = { ethereum: 1, base: 8453, bsc: 56, arbitrum: 42161 } as const;
const flags: [Check, string, boolean][] = [
  ["mint", "is_mintable", false],
  ["blacklist", "is_blacklisted", false],
  ["pause", "transfer_pausable", false],
  ["fees", "slippage_modifiable", false],
  ["proxy", "is_proxy", false],
  ["unverified", "is_open_source", true],
  ["sell_restriction", "cannot_sell_all", false],
  ["honeypot", "is_honeypot", false],
];
/** A provider's explicit "0" is distinct from a missing, empty or unrecognized field. */
export function parseGoPlus(
  id: RiskIdentity,
  raw: unknown,
  at: string,
): RiskBatch {
  validateIdentity(id);
  if (id.chain === "solana" || id.origin !== "REAL")
    throw new ProviderError("INVALID_INPUT");
  const address = normalizeAddress(id.chain, id.address, "REAL")!;
  const e = z
    .object({
      code: z.literal(1),
      result: z.record(z.string(), z.record(z.string(), z.unknown())),
    })
    .parse(raw);
  const entry = Object.entries(e.result).find(
    ([a]) => a.toLowerCase() === address,
  );
  if (!entry) throw new ProviderError("INVALID_RESPONSE");
  const data = entry[1];
  const p = {
    source: "GoPlus Token Security v1",
    url: `https://api.gopluslabs.io/api/v1/token_security/${networks[id.chain]}?contract_addresses=${address}`,
    observedAt: at,
    fetchedAt: at,
    limitations:
      "Déclaration d’un service tiers, sans vérification indépendante ni simulation locale. Heure de récupération ; bloc et heure d’observation sous-jacente non fournis. Un proxy détecté n’établit pas à lui seul qu’il est modifiable. Aucun résultat ne garantit la vente ou la sécurité.",
  };
  const observations = flags.map(([check, field, invert]) => {
    const value = data[field],
      known = value === "0" || value === "1";
    const signal = known && (invert ? value === "0" : value === "1");
    const codeScope =
      !["mint", "blacklist", "pause", "fees", "proxy"].includes(check) ||
      (data.is_open_source === "1" && data.is_proxy === "0");
    const dexScope =
      !["honeypot", "sell_restriction"].includes(check) ||
      data.is_in_dex === "1";
    const covered = known && (signal || (codeScope && dexScope));
    return observation(
      p,
      check,
      !covered ? "unknown" : signal ? "signal" : "clear",
      `${field} : ${known ? value : "absent ou non interprétable"} (rapport GoPlus). ${!covered ? "Portée non confirmée : code non ouvert/proxy, présence en DEX ou champ non déterminé." : ""}`,
      covered,
    );
  });
  const owner = data.owner_address;
  const revoked = owner === "0x" + "0".repeat(40);
  const known =
    typeof owner === "string" &&
    (revoked || !!normalizeAddress(id.chain, owner, "REAL"));
  observations.push(
    observation(
      p,
      "owner",
      !known ? "unknown" : revoked ? "clear" : "signal",
      `owner_address : ${known ? owner : "inconnu"}. L’absence d’un propriétaire classique n’exclut ni rôles ni contrôle indirect.`,
      known,
    ),
  );
  return { ...id, observations };
}
/** Fixed GET endpoint only. No wallet, RPC transaction method, retries or startup calls. */
export class GoPlusRiskProvider {
  readonly origin = "REAL" as const;
  constructor(
    private transport: JsonTransport,
    private gate: MarketGate,
    private enabled = false,
    private now = () => Date.now(),
  ) {}
  async read(id: RiskIdentity): Promise<RiskBatch> {
    validateIdentity(id);
    if (id.origin !== "REAL" || id.chain === "solana")
      throw new ProviderError("INVALID_INPUT");
    if (!this.enabled) throw new ProviderError("NOT_CONFIGURED");
    const address = normalizeAddress(id.chain, id.address, "REAL")!;
    await this.gate.reserve();
    const r = await this.transport.get(
      new URL(
        `https://api.gopluslabs.io/api/v1/token_security/${networks[id.chain]}?contract_addresses=${address}`,
      ),
      {},
    );
    if (r.status === 429) {
      const n = Number(r.headers["retry-after"]);
      await this.gate.backoff(
        Number.isFinite(n) && n > 0 ? Math.min(3600, Math.ceil(n)) : 60,
      );
      throw new ProviderError("RATE_LIMITED");
    }
    if (r.status !== 200) throw new ProviderError("PROVIDER_UNAVAILABLE");
    try {
      if (r.body.length > 2000000) throw new Error();
      return parseGoPlus(
        id,
        JSON.parse(r.body),
        new Date(this.now()).toISOString(),
      );
    } catch {
      throw new ProviderError("INVALID_RESPONSE");
    }
  }
}
