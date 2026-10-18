import { describe, it, expect } from "vitest";
import { addressHash, normalizeAddress } from "../../packages/social/identity";
import {
  extractCandidates,
  parseTokenUrl,
  resolveMentions,
  summarizeSocial,
  type SocialToken,
  type Mention,
} from "../../packages/social/model";
import type { XPost } from "../../packages/connectors/x/contracts";
const address = "0x52908400098527886E0F7030069857D2E4169EE7",
  lower = address.toLowerCase();
const sol = "So11111111111111111111111111111111111111112";
const at = (n: number) => new Date(Date.UTC(2026, 0, 15, 14, n)).toISOString();
const post = (text: string): XPost => ({
  id: "123",
  text,
  authorId: "1",
  publishedAt: at(2),
  collectedAt: at(3),
  conversationId: null,
  references: [],
  type: "original",
  language: "fr",
  metrics: { likes: null, replies: null, reposts: null, quotes: null },
  entities: { hashtags: [], cashtags: [], mentions: [], urls: [] },
  dataOrigin: "REAL",
  knowledge: "OBSERVED",
});
const token: SocialToken = {
  id: "base",
  chain: "base",
  address,
  name: "Nébula Mobile",
  symbol: "NEB",
  createdAt: at(1),
};
// ERC-55 vectors: https://github.com/ethereum/ercs/blob/master/ERCS/erc-55.md
describe("chain identity and EIP-55", () => {
  it.each([
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "0x8617E340B3D01FA5F11F306F4090FD50E238070D",
    "0xde709f2102306220921060314715629080e2fb77",
    "0x27b1fdb04752bbc536007a920d24acb045561c26",
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
    "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
  ])("validates published EIP-55 vector %s", (a) =>
    expect(normalizeAddress("base", a, "REAL")).toBe(a.toLowerCase()),
  );
  it("uses Keccak Ethereum padding and refuses invalid shape/checksum, zero and cross-origin identities", () => {
    expect(addressHash(lower.slice(2))).toHaveLength(64);
    expect(() => addressHash("invalid")).toThrow();
    expect(
      normalizeAddress("base", address.replace("E416", "e416"), "REAL"),
    ).toBeNull();
    for (const a of ["0x" + "0".repeat(40), "0x123", "0xDEMO" + "0".repeat(36)])
      expect(normalizeAddress("base", a, "REAL")).toBeNull();
    expect(normalizeAddress("base", address, "DEMO")).toBeNull();
    expect(
      normalizeAddress("base", "0xDEMO" + "0".repeat(36), "DEMO"),
    ).toBeTruthy();
    expect(
      normalizeAddress("solana", "DEMo" + "A".repeat(32), "DEMO"),
    ).toBeTruthy();
    expect(normalizeAddress("solana", sol, "REAL")).toBe(sol);
    for (const a of [
      "1".repeat(32),
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "z".repeat(44),
      "0".repeat(32),
      "A".repeat(32),
    ])
      expect(normalizeAddress("solana", a, "REAL")).toBeNull();
  });
});
it("parses only exact allowlisted HTTPS token paths and never confuses DEX pool URLs with a mint", () => {
  for (const [host, chain] of [
    ["etherscan.io", "ethereum"],
    ["basescan.org", "base"],
    ["bscscan.com", "bsc"],
    ["arbiscan.io", "arbitrum"],
  ])
    expect(
      parseTokenUrl(`https://${host}/token/${address}`, "REAL"),
    ).toMatchObject({ chain, address: lower });
  expect(
    parseTokenUrl(`https://solscan.io/token/${sol}`, "REAL"),
  ).toMatchObject({ chain: "solana", address: sol });
  expect(
    parseTokenUrl(`https://birdeye.so/token/${sol}?chain=solana`, "REAL"),
  ).toMatchObject({ chain: "solana" });
  for (const u of [
    `http://basescan.org/token/${address}`,
    `https://basescan.org.evil.test/token/${address}`,
    `https://basescan.org@evil.test/token/${address}`,
    `https://evil.test/token/${address}`,
    `https://basescan.org/address/${address}`,
    `https://basescan.org/token/${address}?x=1`,
    `https://basescan.org/token/${address}#x`,
    `https://basescan.org:444/token/${address}`,
    `https://dexscreener.com/base/${address}`,
    `https://solscan.io/account/${sol}`,
    "bad url",
    `https://basescan.org/token/%30${address}`,
    `https://birdeye.so/token/${sol}?chain=base`,
  ])
    expect(parseTokenUrl(u, "REAL")).toBeNull();
  const demo = "0xDEMO" + "0".repeat(36);
  expect(
    parseTokenUrl(`https://demo.memeradar.invalid/token/base/${demo}`, "DEMO"),
  ).toMatchObject({ chain: "base" });
  expect(
    parseTokenUrl(`https://basescan.org/token/${address}`, "DEMO"),
  ).toBeNull();
});
it("keeps raw EVM chain unknown without URL or explicit context; never borrows a chain from a symbol", () => {
  const p = post(`${address} $NEB Nébula Mobile`),
    c = extractCandidates(p, "REAL");
  expect(c.find((x) => x.method === "exact_address")).toMatchObject({
    chain: null,
    context: "unknown",
  });
  expect(resolveMentions(p, c, [token], "REAL").map((m) => m.method)).toEqual([
    "cashtag",
    "name",
  ]);
  expect(extractCandidates(p, "REAL", "base")[0]).toMatchObject({
    chain: "base",
    context: "operator",
  });
  expect(extractCandidates(p, "REAL", "solana")[0].chain).toBeNull();
  const withUrl = post(`${address} https://basescan.org/token/${address}`);
  expect(
    extractCandidates(withUrl, "REAL").find((c) => c.method === "exact_address")
      ?.chain,
  ).toBe("base");
  const two = post(
    `${address} https://basescan.org/token/${address} https://etherscan.io/token/${address}`,
  );
  expect(
    extractCandidates(two, "REAL", "base").find(
      (c) => c.method === "exact_address",
    )?.chain,
  ).toBeNull();
  expect(
    extractCandidates(post(`https://evil.test/${address}`), "REAL", "base"),
  ).toEqual([]);
  expect(extractCandidates(post(`x${address}y`), "REAL", "base")).toEqual([]);
});
it("deduplicates expanded URL and text evidence, validates cashtags and Solana length, excludes reposts", () => {
  const p = post(
    `${sol} $NEB $neb Nébula Mobile https://basescan.org/token/${address}`,
  );
  p.entities.urls = [`https://basescan.org/token/${address}`];
  p.entities.cashtags = ["NEB", "invalid!"];
  const c = extractCandidates(p, "REAL");
  expect(c.filter((x) => x.method === "token_page_url")).toHaveLength(1);
  expect(c.filter((x) => x.method === "cashtag")).toHaveLength(1);
  expect(c.find((x) => x.address === sol)?.chain).toBe("solana");
  expect(extractCandidates({ ...p, type: "repost" }, "REAL")).toEqual([]);
  expect(extractCandidates({ ...p, type: "unknown" }, "REAL")).toEqual([]);
  expect(extractCandidates(post(""), "REAL")).toEqual([]);
  expect(
    resolveMentions(
      p,
      c,
      [
        token,
        { ...token, id: "eth", chain: "ethereum" },
        { ...token, id: "invalid", address: "bad" },
      ],
      "REAL",
    )
      .filter((x) => x.method === "token_page_url")
      .map((x) => x.tokenId),
  ).toEqual(["base"]);
});
it("never confirms names, cashtags, a URL alone or an unreviewed official claim; requires exact event-linked reviewed publication", () => {
  const p = post(`${address} $NEB Nébula Mobile`),
    m = resolveMentions(
      p,
      extractCandidates(p, "REAL", "base"),
      [token],
      "REAL",
      true,
    ),
    options = { asOf: at(60), signalAt: at(0) };
  expect(summarizeSocial(token, m, options).level).toBe("PLAUSIBLE");
  expect(
    summarizeSocial(token, m, { ...options, officialPostIds: ["123"] }).level,
  ).toBe("CONFIRMED");
  expect(
    summarizeSocial(
      token,
      m.filter((x) => x.method !== "exact_address"),
      { ...options, officialPostIds: ["123"], officialClaim: true },
    ),
  ).toMatchObject({ level: "INSUFFICIENT_DATA", first_social_seen_at: null });
  expect(
    summarizeSocial(
      token,
      m.map((x) => ({ ...x, eventLinked: false })),
      { ...options, officialPostIds: ["123"] },
    ).level,
  ).toBe("WEAK");
  const urlOnly = resolveMentions(
    post(`https://basescan.org/token/${address}`),
    extractCandidates(post(`https://basescan.org/token/${address}`), "REAL"),
    [token],
    "REAL",
    true,
  );
  expect(
    summarizeSocial(token, urlOnly, { ...options, officialPostIds: ["123"] })
      .level,
  ).toBe("PLAUSIBLE");
});
it("uses earliest known publication, separates collection time, handles offsets/unknown dates and future observations", () => {
  const p = post(address),
    base = resolveMentions(
      p,
      extractCandidates(p, "REAL", "base"),
      [token],
      "REAL",
    )[0];
  const m: Mention[] = [
    base,
    {
      ...base,
      postId: "early",
      publishedAt: "2026-01-15T15:01:00+01:00",
      collectedAt: at(4),
    },
    { ...base, postId: "unknown", publishedAt: null, collectedAt: at(0) },
    {
      ...base,
      postId: "future-known",
      publishedAt: at(-5),
      collectedAt: at(61),
    },
    { ...base, postId: "future-pub", publishedAt: at(61) },
  ];
  const s = summarizeSocial(
    { ...token, createdAt: at(-60), name: "Nеbula officiel" },
    m,
    { asOf: at(60), signalAt: at(0), officialClaim: true },
  );
  expect(s.first_social_post_id).toBe("early");
  expect(s.first_observed_at).toBe(at(0));
  expect(s.counterReasons.join()).toContain("avant");
  expect(s.flags).toHaveLength(2);
  expect(s.mentions.map((x) => x.method)).toEqual([
    "exact_address",
    "exact_address",
    "exact_address",
  ]);
  expect(
    summarizeSocial(token, [{ ...base, publishedAt: null }], {
      asOf: at(60),
      signalAt: at(0),
    }).first_social_seen_at,
  ).toBeNull();
  expect(
    summarizeSocial({ ...token, createdAt: null }, [], {
      asOf: at(60),
      signalAt: at(0),
    }).level,
  ).toBe("INSUFFICIENT_DATA");
});

it("replays only collected social evidence, preserves missing sources and does not invent an official contract in the demo", async () => {
  const { demoSocialSnapshot } =
    await import("../../packages/social/demo-data");
  const at60 = demoSocialSnapshot(60);
  expect(at60).toHaveLength(3);
  expect(at60.some((s) => s.level === "CONFIRMED")).toBe(false);
  expect(at60[0].level).toBe("PLAUSIBLE");
  expect(at60[0].first_social_seen_at).toBe(at(12));
  expect(at60[1].level).toBe("INSUFFICIENT_DATA");
  expect(at60[1].flags).toHaveLength(2);
  expect(at60[2].counterReasons.join()).toContain("avant");
  expect(demoSocialSnapshot(10)[0].first_social_seen_at).toBeNull();
  expect(
    demoSocialSnapshot(60, true).every((s) => s.mentions.length === 0),
  ).toBe(true);
  expect(
    demoSocialSnapshot(60, false, true)[0].counterReasons.join(),
  ).not.toContain("avant");
  expect(demoSocialSnapshot(1)[0].token.createdAt).toBeNull();
});
