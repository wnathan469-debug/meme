import type { Origin, XPost } from "../connectors/x/contracts";
import type { Confidence } from "../core/domain";
import { normalizeAddress, type Chain } from "./identity";
export type Method = "exact_address" | "token_page_url" | "cashtag" | "name";
export const METHOD_LABELS: Record<Method, string> = {
  exact_address: "Adresse exacte",
  token_page_url: "Page de token autorisée",
  cashtag: "Cashtag (indice faible)",
  name: "Nom (indice faible)",
};
export interface Candidate {
  method: Method;
  chain: Chain | null;
  address: string | null;
  value: string;
  context: "url" | "operator" | "solana_syntax" | "unknown";
}
export interface SocialToken {
  id: string;
  chain: Chain;
  address: string;
  name: string | null;
  symbol: string | null;
  createdAt: string | null;
}
export interface Mention extends Candidate {
  tokenId: string;
  postId: string;
  publishedAt: string | null;
  collectedAt: string;
  authorId: string | null;
  eventLinked: boolean;
}
const explorerChains: Record<string, Chain> = {
  "etherscan.io": "ethereum",
  "basescan.org": "base",
  "bscscan.com": "bsc",
  "arbiscan.io": "arbitrum",
  "solscan.io": "solana",
};
export function parseTokenUrl(raw: string, origin: Origin): Candidate | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash)
      return null;
    let chain: Chain | undefined = explorerChains[u.hostname],
      address: string | undefined;
    const path = u.pathname.split("/");
    if (origin === "DEMO") {
      if (
        u.hostname !== "demo.memeradar.invalid" ||
        path.length !== 4 ||
        path[1] !== "token" ||
        !["ethereum", "base", "bsc", "arbitrum", "solana"].includes(path[2]) ||
        u.search
      )
        return null;
      chain = path[2] as Chain;
      address = path[3];
    } else if (chain && path.length === 3 && path[1] === "token" && !u.search)
      address = path[2];
    else if (
      u.hostname === "birdeye.so" &&
      path.length === 3 &&
      path[1] === "token" &&
      u.searchParams.get("chain") === "solana" &&
      [...u.searchParams].length === 1
    ) {
      chain = "solana";
      address = path[2];
    } else return null;
    const normalized = normalizeAddress(chain!, address!, origin);
    return normalized
      ? {
          method: "token_page_url",
          chain: chain!,
          address: normalized,
          value: raw,
          context: "url",
        }
      : null;
  } catch {
    return null;
  }
}
const words = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function extractCandidates(
  post: Pick<XPost, "text" | "entities" | "type">,
  origin: Origin,
  contextChain?: Chain,
): Candidate[] {
  if (post.type === "repost" || post.type === "unknown" || !post.text)
    return [];
  const candidates: Candidate[] = [],
    urls = [
      ...(post.text.match(/https?:\/\/[^\s<>]+/gi) ?? []).map((s) =>
        s.replace(/[),.;!?]+$/, ""),
      ),
      ...post.entities.urls,
    ];
  for (const url of new Set(urls.slice(0, 200))) {
    const c = parseTokenUrl(url, origin);
    if (c) candidates.push(c);
  }
  // Never turn an address inside an untrusted URL into a plain-text exact-address proof.
  const text = post.text.replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, " ");
  const pattern =
    origin === "DEMO"
      ? /(?<![\p{L}\p{N}_])(?:0xDEMO[0-9]{36}|DEMo[1-9A-HJ-NP-Za-km-z]{28,40})(?![\p{L}\p{N}_])/gu
      : /(?<![\p{L}\p{N}_])(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})(?![\p{L}\p{N}_])/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0],
      evm = raw.startsWith("0x"),
      norm = normalizeAddress(evm ? "base" : "solana", raw, origin);
    if (!norm) continue;
    const urlChains = [
      ...new Set(
        candidates.filter((c) => c.address === norm).map((c) => c.chain!),
      ),
    ];
    const chain = evm
      ? urlChains.length === 1
        ? urlChains[0]
        : urlChains.length > 1
          ? null
          : contextChain && contextChain !== "solana"
            ? contextChain
            : null
      : "solana";
    candidates.push({
      method: "exact_address",
      chain,
      address: norm,
      value: raw,
      context:
        urlChains.length === 1
          ? "url"
          : chain
            ? evm
              ? "operator"
              : "solana_syntax"
            : "unknown",
    });
  }
  for (const symbol of new Set(
    [
      ...(
        text.match(
          /(?<![\p{L}\p{N}_])\$[A-Za-z][A-Za-z0-9_]{0,19}(?![\p{L}\p{N}_])/gu,
        ) ?? []
      ).map((s) => s.slice(1)),
      ...post.entities.cashtags,
    ].map((s) => s.toUpperCase()),
  )) {
    if (/^[A-Z][A-Z0-9_]{0,19}$/.test(symbol))
      candidates.push({
        method: "cashtag",
        chain: null,
        address: null,
        value: symbol,
        context: "unknown",
      });
  }
  return [
    ...new Map(candidates.map((c) => [JSON.stringify(c), c])).values(),
  ].slice(0, 100);
}
export function resolveMentions(
  post: Pick<
    XPost,
    | "id"
    | "text"
    | "entities"
    | "type"
    | "publishedAt"
    | "collectedAt"
    | "authorId"
  >,
  candidates: Candidate[],
  tokens: SocialToken[],
  origin: Origin,
  eventLinked = false,
): Mention[] {
  const result: Mention[] = [];
  for (const t of tokens) {
    const address = normalizeAddress(t.chain, t.address, origin);
    if (!address) continue;
    for (const c of candidates)
      if (
        (c.address && c.chain === t.chain && c.address === address) ||
        (c.method === "cashtag" &&
          t.symbol &&
          c.value === t.symbol.toUpperCase())
      )
        result.push({
          ...c,
          tokenId: t.id,
          postId: post.id,
          publishedAt: post.publishedAt,
          collectedAt: post.collectedAt,
          authorId: post.authorId,
          eventLinked,
        });
    const name = t.name && words(t.name),
      text = words(post.text.replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, " "));
    if (
      post.type !== "repost" &&
      post.type !== "unknown" &&
      name &&
      name.length >= 4 &&
      ` ${text} `.includes(` ${name} `)
    )
      result.push({
        method: "name",
        chain: t.chain,
        address: null,
        value: t.name!,
        context: "unknown",
        tokenId: t.id,
        postId: post.id,
        publishedAt: post.publishedAt,
        collectedAt: post.collectedAt,
        authorId: post.authorId,
        eventLinked,
      });
  }
  return result;
}
export function summarizeSocial(
  token: SocialToken,
  mentions: Mention[],
  options: {
    asOf: string;
    signalAt: string;
    officialPostIds?: string[];
    officialClaim?: boolean;
  },
) {
  const known = mentions.filter(
    (m) =>
      m.tokenId === token.id &&
      Date.parse(m.collectedAt) <= Date.parse(options.asOf) &&
      (!m.publishedAt || Date.parse(m.publishedAt) <= Date.parse(options.asOf)),
  );
  const strong = known.filter(
    (m) => m.method === "exact_address" || m.method === "token_page_url",
  );
  const dated = strong
    .filter((m) => m.publishedAt)
    .sort(
      (a, b) =>
        Date.parse(a.publishedAt!) - Date.parse(b.publishedAt!) ||
        Date.parse(a.collectedAt) - Date.parse(b.collectedAt) ||
        a.postId.localeCompare(b.postId),
    );
  const confirmed = strong.some(
    (m) =>
      m.method === "exact_address" &&
      m.eventLinked &&
      options.officialPostIds?.includes(m.postId),
  );
  const reasons: string[] = [],
    counterReasons: string[] = [],
    flags: string[] = [];
  const linked = strong.some((m) => m.eventLinked);
  const level: Confidence = confirmed
    ? "CONFIRMED"
    : linked
      ? "PLAUSIBLE"
      : strong.length
        ? "WEAK"
        : "INSUFFICIENT_DATA";
  if (confirmed)
    reasons.push(
      "Adresse exacte publiée pour cet événement par un compte officiellement attesté ; publication vérifiée manuellement.",
    );
  if (linked)
    reasons.push(
      "Adresse ou page de token identifiée dans une publication liée à l’événement ; association interprétée.",
    );
  if (!strong.length)
    counterReasons.push(
      "Aucune adresse exacte ni page de token reconnue dans ce périmètre ; un nom ou cashtag ne suffit pas.",
    );
  if (
    token.createdAt &&
    Date.parse(token.createdAt) < Date.parse(options.signalAt)
  )
    counterReasons.push(
      "Token créé avant le premier signal connu de l’événement.",
    );
  if (options.officialClaim && !confirmed)
    flags.push(
      "Revendication officielle sans publication exacte vérifiée pour ce token.",
    );
  if (
    token.name &&
    /[\u0400-\u052f\u0370-\u03ff]/u.test(token.name) &&
    /[a-z]/i.test(token.name)
  )
    flags.push(
      "Alphabets mêlés : possible homoglyphie, à examiner ; ce signal ne prouve pas une usurpation.",
    );
  return {
    level,
    reasons,
    counterReasons,
    flags,
    first_social_seen_at: dated[0]?.publishedAt ?? null,
    first_social_post_id: dated[0]?.postId ?? null,
    first_observed_at: strong.length
      ? strong.reduce(
          (min, m) =>
            Date.parse(m.collectedAt) < Date.parse(min) ? m.collectedAt : min,
          strong[0].collectedAt,
        )
      : null,
    mentions: known.sort(
      (a, b) =>
        ["exact_address", "token_page_url", "cashtag", "name"].indexOf(
          a.method,
        ) -
        ["exact_address", "token_page_url", "cashtag", "name"].indexOf(
          b.method,
        ),
    ),
    algorithm_version: "social-association@1.0.0",
    knowledge: "INTERPRETED" as const,
    limitations:
      "Première apparition observée dans les données collectées, pas la première sur X. Une mention, même officielle, ne prouve ni soutien, ni légitimité, ni sécurité. Âge des comptes inconnu : concentration de comptes récents non évaluée.",
  };
}
