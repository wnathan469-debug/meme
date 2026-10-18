import { z } from "zod";
import type { Origin } from "../connectors/x/contracts";
import { normalizeAddress, CHAINS, type Chain } from "../social/identity";
import {
  compare,
  decimal,
  percentChange,
  project,
  sum,
  multiply,
  changedAtLeast,
} from "./decimal";
export const intervals = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
} as const;
export type Interval = keyof typeof intervals;
export const ttlSeconds: Record<Interval, number> = {
  "1m": 30,
  "5m": 60,
  "15m": 180,
  "1h": 300,
  "4h": 900,
  "1d": 3600,
};
const exact = z.string().refine((v) => {
  try {
    decimal(v);
    return true;
  } catch {
    return false;
  }
});
const stamp = z.iso.datetime({ offset: true });
export const candleSchema = z
  .object({
    at: stamp,
    open: exact,
    high: exact,
    low: exact,
    close: exact,
    volume: exact.nullable(),
    fetchedAt: stamp,
  })
  .refine(
    (v) =>
      compare(v.high, v.open) >= 0 &&
      compare(v.high, v.close) >= 0 &&
      compare(v.high, v.low) >= 0 &&
      compare(v.low, v.open) <= 0 &&
      compare(v.low, v.close) <= 0,
    "Invalid OHLC",
  );
export type Candle = z.infer<typeof candleSchema>;
export const poolSchema = z.object({
  address: z.string().min(1).max(100),
  tokenSide: z.enum(["base", "quote"]).default("base"),
  provider: z.string().max(100).optional(),
  dex: z.string().min(1).max(100),
  quote: z.string().min(1).max(100),
  liquidity: exact.nullable(),
  createdAt: stamp.nullable(),
  updatedAt: stamp,
});
export type ChartPool = z.infer<typeof poolSchema>;
export const metricSchema = z
  .object({
    at: stamp,
    value: exact.nullable(),
    source: z.string().max(100),
    fetchedAt: stamp,
    reason: z.string().max(500).nullable(),
  })
  .refine((x) => (x.value === null) === (x.reason !== null));
export type SeriesMetric = z.infer<typeof metricSchema>;
export const tradeSchema = z.object({
  id: z.string().min(1).max(200),
  at: stamp,
  side: z.enum(["buy", "sell"]),
  usd: exact.nullable(),
  tokenAmount: exact.nullable(),
  wallet: z.string().min(1).max(100).nullable(),
  source: z.string().min(1).max(100),
});
export type Trade = z.infer<typeof tradeSchema>;
export interface Marker {
  id: string;
  at: string;
  kind:
    | "event"
    | "x_post"
    | "alert"
    | "pool_created"
    | "price_change"
    | "liquidity_change";
  label: string;
  target: string | null;
  knowledge: "OBSERVED" | "CALCULATED" | "INTERPRETED";
}
export function tokenPath(chain: Chain, address: string) {
  return "/tokens/" + chain + "/" + encodeURIComponent(address);
}
export function parseTokenPath(
  path: string,
  origin: Origin,
): { chain: Chain; address: string } | null {
  try {
    const parts = path.split("/");
    if (
      parts.length !== 4 ||
      parts[1] !== "tokens" ||
      !CHAINS.includes(parts[2] as Chain)
    )
      return null;
    const chain = parts[2] as Chain,
      address = decodeURIComponent(parts[3]);
    const normalized = normalizeAddress(chain, address, origin);
    return normalized ? { chain, address: normalized } : null;
  } catch {
    return null;
  }
}
const domains = {
  ethereum: "etherscan.io",
  base: "basescan.org",
  bsc: "bscscan.com",
  arbitrum: "arbiscan.io",
  solana: "solscan.io",
};
export function buildExternalTokenUrls(
  chain: Chain,
  address: string,
  allowedHosts: readonly string[] = Object.values(domains),
): { label: string; url: string }[] {
  const normalized = CHAINS.includes(chain)
    ? normalizeAddress(chain, address, "REAL")
    : null;
  if (!normalized || !allowedHosts.includes(domains[chain])) return [];
  return [
    {
      label: domains[chain],
      url: `https://${domains[chain]}/token/${normalized}`,
    },
  ];
}
export function buildExternalWalletUrl(
  chain: Chain,
  address: string,
  allowedHosts: readonly string[] = Object.values(domains),
): string | null {
  const normalized = CHAINS.includes(chain)
    ? normalizeAddress(chain, address, "REAL")
    : null;
  return normalized && allowedHosts.includes(domains[chain])
    ? `https://${domains[chain]}/${chain === "solana" ? "account" : "address"}/${normalized}`
    : null;
}
export function defaultPool(pools: ChartPool[]): ChartPool | null {
  return (
    [...pools].sort((a, b) =>
      a.liquidity === null
        ? b.liquidity === null
          ? a.address.localeCompare(b.address)
          : 1
        : b.liquidity === null
          ? -1
          : compare(b.liquidity, a.liquidity) ||
            a.address.localeCompare(b.address),
    )[0] ?? null
  );
}
export interface ChartSlot {
  at: string;
  candle: Candle | null;
  reason: string | null;
}
export function candleSlots(
  candles: Candle[],
  interval: Interval,
  start: string,
  end: string,
  asOf: string,
): ChartSlot[] {
  const step = intervals[interval] * 1000,
    a = Date.parse(start),
    b = Date.parse(end),
    now = Date.parse(asOf);
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(now) ||
    b <= a ||
    Math.ceil((b - a) / step) > 1500 ||
    a % step !== 0
  )
    throw new Error("Invalid chart window");
  const map = new Map<number, Candle>();
  for (const c of candles) {
    const p = candleSchema.safeParse(c);
    if (!p.success) throw new Error("Invalid candle");
    const t = Date.parse(c.at);
    if (t % step !== 0) throw new Error("Unaligned candle");
    if (Date.parse(c.fetchedAt) > now) continue;
    const old = map.get(t);
    if (!old || Date.parse(old.fetchedAt) < Date.parse(c.fetchedAt))
      map.set(t, c);
    else if (
      Date.parse(old.fetchedAt) === Date.parse(c.fetchedAt) &&
      JSON.stringify(old) !== JSON.stringify(c)
    )
      throw new Error("Conflicting duplicate candle");
  }
  const slots: ChartSlot[] = [];
  for (let t = a; t < b; t += step) {
    const c = map.get(t) ?? null;
    slots.push({
      at: new Date(t).toISOString(),
      candle:
        t + step <= now && (!c || Date.parse(c.fetchedAt) >= t + step)
          ? c
          : null,
      reason:
        t + step > now
          ? "Tranche en cours ou future"
          : !c
            ? "Donnée absente : aucune interpolation"
            : Date.parse(c.fetchedAt) < t + step
              ? "Bougie non clôturée lors de la récupération"
              : null,
    });
  }
  return slots;
}
export function chartSummary(
  slots: ChartSlot[],
  asOf: string,
  interval: Interval,
  inconsistent = false,
) {
  const present = slots.filter((s) => s.candle).map((s) => s.candle!),
    complete = slots.length > 0 && present.length === slots.length;
  return {
    complete,
    change:
      complete && !inconsistent
        ? percentChange(present[0].open, present.at(-1)!.close)
        : null,
    volume:
      complete && !inconsistent && present.every((c) => c.volume !== null)
        ? sum(present.map((c) => c.volume!))
        : null,
    observedVolume: sum(
      present.flatMap((c) => (c.volume === null ? [] : [c.volume])),
    ),
    stale:
      !!present.length &&
      Date.parse(asOf) - Date.parse(present.at(-1)!.fetchedAt) >
        ttlSeconds[interval] * 1000,
    gaps: slots.length - present.length,
    lastPrice: present.at(-1)?.close ?? null,
    unprojectable: present.some((c) =>
      [c.open, c.high, c.low, c.close, c.volume ?? "0"].some(
        (v) => project(v) === null,
      ),
    ),
  };
}
export function marketCap(
  price: string | null,
  circulatingSupply: string | null,
) {
  return price === null || circulatingSupply === null
    ? null
    : multiply(price, circulatingSupply);
}
export function importantChanges(
  slots: ChartSlot[],
  liquidity: SeriesMetric[],
  threshold = "20",
): Marker[] {
  const out: Marker[] = [];
  for (let i = 1; i < slots.length; i++) {
    const a = slots[i - 1],
      b = slots[i];
    if (!a.candle || !b.candle) continue;
    const change = percentChange(a.candle.close, b.candle.close);
    if (
      change !== null &&
      changedAtLeast(a.candle.close, b.candle.close, threshold)
    )
      out.push({
        id: "price-" + b.at,
        at: new Date(
          Date.parse(b.at) +
            (slots.length > 1
              ? Date.parse(slots[1].at) - Date.parse(slots[0].at)
              : 60000),
        ).toISOString(),
        kind: "price_change",
        label: `Variation de clôture ${change} % entre tranches consécutives`,
        target: null,
        knowledge: "CALCULATED",
      });
  }
  const sorted = [...liquidity].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1],
      b = sorted[i];
    if (a.value === null || b.value === null || a.source !== b.source) continue;
    const change = percentChange(a.value, b.value);
    if (change !== null && changedAtLeast(a.value, b.value, threshold))
      out.push({
        id: "liq-" + b.at,
        at: b.at,
        kind: "liquidity_change",
        label: `Liquidité observée : ${change} % ; cause non vérifiée`,
        target: null,
        knowledge: "CALCULATED",
      });
  }
  return out;
}

/** Untrusted labels cannot use bidi/control characters to disguise token identity. */
export function displayText(value: string) {
  return value.replace(
    /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    "�",
  );
}
