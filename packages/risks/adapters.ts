import { z } from "zod";
import { decimal, formatDecimal, changedAtLeast } from "../charts/decimal";
import { normalizeAddress } from "../social/identity";
import {
  observationSchema,
  type RiskIdentity,
  type RiskBatch,
  type RiskObservation,
  type Check,
  validateIdentity,
} from "./model";
type Provenance = Omit<
  RiskObservation,
  "check" | "result" | "detail" | "complete"
>;
export function observation(
  p: Provenance,
  check: Check,
  result: RiskObservation["result"],
  detail: string,
  complete = true,
): RiskObservation {
  return observationSchema.parse({ ...p, check, result, detail, complete });
}
const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/);
const holderSchema = z.object({
  supply: uint,
  complete: z.boolean(),
  holders: z
    .array(
      z.object({
        address: z.string(),
        amount: uint,
        role: z.enum(["wallet", "pool", "burn", "lock", "unknown"]),
        roleVerified: z.boolean(),
      }),
    )
    .max(1000),
});
/** Amounts and denominator are raw supply units. Only evidenced roles can be excluded. */
export function holdersObservation(
  id: RiskIdentity,
  raw: unknown,
  p: Provenance,
) {
  validateIdentity(id);
  const v = holderSchema.parse(raw),
    total = BigInt(v.supply),
    seen = new Set<string>();
  let reported = 0n;
  const included: bigint[] = [];
  let unknown = false;
  for (const h of v.holders) {
    const a = normalizeAddress(id.chain, h.address, id.origin);
    if (!a || seen.has(a)) throw new Error("Invalid or duplicate holder");
    seen.add(a);
    reported += BigInt(h.amount);
    if (["pool", "burn", "lock"].includes(h.role) && h.roleVerified) continue;
    if (!h.roleVerified || h.role === "unknown") unknown = true;
    included.push(BigInt(h.amount));
  }
  if (!total || reported > total) throw new Error("Invalid holder supply");
  const complete = v.complete && reported === total;
  included.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const top = (n: number) => included.slice(0, n).reduce((a, b) => a + b, 0n);
  const pct = (n: bigint) => formatDecimal((n * 100n * 10n ** 36n) / total);
  const signal =
    !unknown && (top(1) * 100n >= total * 10n || top(10) * 100n >= total * 50n);
  return observation(
    p,
    "holders",
    signal ? "signal" : unknown || !complete ? "unknown" : "clear",
    `Top 1 : ${pct(top(1))} % ; top 10 : ${pct(top(10))} % ; top 20 : ${pct(top(20))} % de l’offre totale brute. Seuils : top 1 ≥ 10 % ou top 10 ≥ 50 %. ${unknown ? "Rôles non vérifiés : concentration après exclusions indéterminée." : "Pools, destruction et verrouillages exclus uniquement avec rôle vérifié."} Offre : ${v.supply}. Inventaire ${complete ? "complet" : "partiel"}.`,
    complete && !unknown,
  );
}
export function liquidityObservation(
  before: string | null,
  after: string | null,
  p: Provenance,
) {
  const valid = before !== null && after !== null;
  const changed =
    valid &&
    decimal(after) < decimal(before) &&
    changedAtLeast(before, after, "20");
  if (before !== null) decimal(before);
  if (after !== null) decimal(after);
  return observation(
    p,
    "liquidity",
    !valid || decimal(before!) === 0n
      ? "unknown"
      : changed
        ? "signal"
        : "clear",
    `Liquidité du même pool et de la même source : ${before ?? "inconnue"} → ${after ?? "inconnue"} USD. Seuil de baisse : 20 %. La cause de la variation n’est pas établie.`,
    valid,
  );
}
export function lpObservation(
  state: "locked" | "burned" | "unlocked" | "unknown",
  covered: boolean,
  expires: string | null,
  p: Provenance,
) {
  if (expires !== null) z.iso.datetime().parse(expires);
  const expired =
    state === "locked" &&
    expires !== null &&
    Date.parse(expires) <= Date.parse(p.observedAt);
  return observation(
    {
      ...p,
      ...(state === "locked" && expires && !expired
        ? { validUntil: expires }
        : {}),
    },
    "lp",
    state === "unlocked" || expired
      ? "signal"
      : state === "unknown" || !covered || (state === "locked" && !expires)
        ? "unknown"
        : "clear",
    `État LP observé : ${state}. Échéance : ${expires ?? "inconnue ou sans objet"}. Couverture de toutes les positions : ${covered ? "oui" : "non"}. ${expired ? "Verrouillage expiré." : ""} Un verrouillage ne protège pas contre tous les risques ; les positions concentrées exigent une preuve spécifique.`,
    covered,
  );
}
export function movementObservation(
  id: RiskIdentity,
  supply: string,
  rows: {
    wallet: string;
    amount: string;
    direction: "in" | "out";
    creator: boolean;
    tx: string;
  }[],
  complete: boolean,
  p: Provenance,
) {
  validateIdentity(id);
  uint.parse(supply);
  const total = BigInt(supply);
  if (!total || rows.length > 100) throw new Error("Invalid movement batch");
  const details: string[] = [];
  let signal = false;
  for (const r of rows) {
    if (
      !normalizeAddress(id.chain, r.wallet, id.origin) ||
      !["in", "out"].includes(r.direction) ||
      !r.tx ||
      r.tx.length > 150
    )
      throw new Error("Invalid movement");
    uint.parse(r.amount);
    if (
      BigInt(r.amount) * 100n >= total ||
      (r.creator && r.direction === "out")
    ) {
      signal = true;
      details.push(
        `${r.wallet} : ${r.direction}, ${r.amount} unités brutes, créateur identifié : ${r.creator ? "oui" : "non"}, transaction ${r.tx}`,
      );
    }
  }
  return observation(
    p,
    "movements",
    signal ? "signal" : complete ? "clear" : "unknown",
    `Seuil par mouvement : ≥ 1 % de l’offre brute, ou sortie du créateur identifié. ${details.join(" ; ") || "Aucun mouvement répondant à ces critères dans les données récupérées."} Une sortie n’est pas nécessairement une vente.`,
    complete,
  );
}
/** Parses an already acquired, address-bound Solana getAccountInfo/jsonParsed result. Never sends RPC. */
export function solanaMintBatch(
  id: RiskIdentity,
  raw: unknown,
  p: Provenance,
): RiskBatch {
  validateIdentity(id);
  if (id.chain !== "solana") throw new Error("Not a Solana mint");
  const account = z
    .object({
      owner: z.string(),
      data: z.object({
        program: z.string(),
        parsed: z.object({
          type: z.literal("mint"),
          info: z.object({
            isInitialized: z.literal(true),
            mintAuthority: z.string().nullable(),
            freezeAuthority: z.string().nullable(),
            extensions: z
              .array(z.object({ extension: z.string().min(1).max(100) }))
              .max(100)
              .optional(),
          }),
        }),
      }),
    })
    .parse(raw);
  const classic =
    account.owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" &&
    account.data.program === "spl-token";
  const extended =
    account.owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" &&
    account.data.program === "spl-token-2022";
  if (!classic && !extended) throw new Error("Unrecognized mint program");
  const info = account.data.parsed.info;
  const authority = (a: string | null, check: Check) => {
    if (a !== null && !normalizeAddress("solana", a, "REAL"))
      throw new Error("Invalid authority");
    return observation(
      p,
      check,
      a === null ? "clear" : "signal",
      `Autorité : ${a ?? "révoquée (null explicite)"}. Programme : ${account.owner}.`,
    );
  };
  return {
    ...id,
    observations: [
      authority(info.mintAuthority, "mint_authority"),
      authority(info.freezeAuthority, "freeze_authority"),
      observation(
        p,
        "extensions",
        classic
          ? "clear"
          : info.extensions
            ? info.extensions.length
              ? "signal"
              : "clear"
            : "unknown",
        classic
          ? "Programme SPL classique : extensions Token-2022 absentes par construction."
          : `Extensions récupérées : ${info.extensions?.map((e) => e.extension).join(", ") || "aucune ou non décodées"}. Présence d’une extension ≠ preuve de comportement malveillant.`,
        classic || info.extensions !== undefined,
      ),
    ],
  };
}

/** Metaplex Metadata account decoded by a trusted reader, bound to its mint and program. */
export function solanaMetadataObservation(
  id: RiskIdentity,
  raw: unknown,
  p: Provenance,
) {
  validateIdentity(id);
  if (id.chain !== "solana") throw new Error("Not Solana metadata");
  const v = z
    .object({
      owner: z.literal("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),
      mint: z.string(),
      updateAuthority: z.string(),
      isMutable: z.boolean(),
    })
    .parse(raw);
  if (
    normalizeAddress("solana", v.mint, id.origin) !==
      normalizeAddress("solana", id.address, id.origin) ||
    !normalizeAddress("solana", v.updateAuthority, "REAL")
  )
    throw new Error("Metadata mint mismatch");
  return observation(
    p,
    "metadata_authority",
    v.isMutable ? "signal" : "clear",
    `Métadonnées Metaplex : updateAuthority ${v.updateAuthority} ; isMutable ${v.isMutable}. Ce contrôle ne couvre pas les métadonnées d’un autre programme ou une extension Token-2022.`,
  );
}
