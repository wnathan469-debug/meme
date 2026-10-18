import { tokens as legacyTokens, events as legacyEvents } from "../core/demo";
import { associate } from "../core/domain";
import { socialDemoTokens, demoSocialSnapshot } from "../social/demo-data";
import { eventAt } from "../events/demo-data";
import { DEMO_EVENT_ID } from "../events/model";
import { decimal, formatDecimal, compare } from "./decimal";
import {
  marketCap,
  candleSlots,
  chartSummary,
  defaultPool,
  importantChanges,
  intervals,
  type Candle,
  type ChartPool,
  type Interval,
  type Marker,
  type SeriesMetric,
  type Trade,
} from "./model";
import type { Chain } from "../social/identity";
import type { MarketProvider } from "./provider";
export const demoChartRegistry = [
  ...legacyTokens.map((t) => ({
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    chain: t.chain.toLowerCase() as Chain,
    address: t.address,
    createdAt: t.minute === null ? null : eventAt(t.minute),
    eventId: t.event_id,
    level: associate(t).level,
    flags: associate(t).counter_reasons,
  })),
  ...socialDemoTokens.map((t) => ({
    ...t,
    eventId: DEMO_EVENT_ID,
    level: "PLAUSIBLE" as const,
    flags: [],
  })),
];
export const demoPool = (i: number) =>
  "0xDEMO" + "0".repeat(32) + String(i).padStart(4, "0");
export const demoSolPool = "DEMo" + "A".repeat(32);
export type DemoChartState =
  "normal" | "empty" | "unavailable" | "stale" | "conflict";
export function demoChartSnapshot(input: {
  chain: Chain;
  address: string;
  interval: Interval;
  range: string;
  minute: number;
  pool?: string;
  simulation?: DemoChartState;
  socialDisabled?: boolean;
  indexerDisabled?: boolean;
}) {
  const token = demoChartRegistry.find(
    (t) => t.chain === input.chain && t.address === input.address,
  );
  if (!token) return null;
  const asOf = eventAt(input.minute),
    step = intervals[input.interval] * 1000,
    end = Math.floor(Date.parse(asOf) / step) * step;
  const hours: Record<string, number> = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 168,
  };
  const creation = token.createdAt
    ? Date.parse(token.createdAt)
    : Date.parse(eventAt(0));
  const rawStart =
    input.range === "creation"
      ? creation
      : end - (hours[input.range] ?? 1) * 3600000;
  const start = Math.floor(Math.min(rawStart, end - step) / step) * step;
  // Progressive rendering is capped to the most recent 1,500 slots; older data is never fabricated.
  const boundedStart = Math.max(start, end - step * 1500);
  const missing =
    token.id === "unknown" ||
    token.id.endsWith("72") ||
    input.indexerDisabled ||
    input.simulation === "empty" ||
    input.simulation === "unavailable";
  const updatedAt =
    input.simulation === "stale" ? eventAt(input.minute - 10) : asOf;
  const pools: ChartPool[] = missing
    ? []
    : [
        {
          address: token.chain === "solana" ? demoSolPool : demoPool(801),
          dex: "[DÉMO] Pool principal",
          tokenSide: "base",
          quote: "[DÉMO] USD fictif",
          liquidity: "18000",
          createdAt: eventAt(
            Math.max(8, Math.ceil((creation - Date.parse(eventAt(0))) / 60000)),
          ),
          updatedAt,
        },
        ...(token.chain === "solana"
          ? []
          : [
              {
                address: demoPool(802),
                dex: "[DÉMO] Pool secondaire",
                tokenSide: "base" as const,
                quote: "[DÉMO] USD fictif",
                liquidity: "2400",
                createdAt: eventAt(
                  Math.max(
                    10,
                    Math.ceil((creation - Date.parse(eventAt(0))) / 60000),
                  ),
                ),
                updatedAt,
              },
            ]),
      ];
  const selected = input.pool
    ? (pools.find((p) => p.address === input.pool) ?? null)
    : defaultPool(pools);
  const scale = selected?.address === demoPool(802) ? 2n : 1n;
  const knownUntil =
    input.simulation === "stale" ? input.minute - 10 : input.minute;
  const base: Candle[] = [];
  if (selected)
    for (
      let m = Math.max(
        8,
        Math.ceil((creation - Date.parse(eventAt(0))) / 60000),
      );
      m < Math.min(knownUntil, 120);
      m++
    ) {
      if ((m >= 15 && m < 20) || m === 45) continue;
      const open = BigInt(1000 + m * 3 + (m >= 30 ? 600 : 0)) * scale,
        close = open + 5n,
        lo = open - 3n,
        hi = close + 6n;
      const price = (n: bigint) => formatDecimal(n * decimal("0.000001"));
      base.push({
        at: eventAt(m),
        open: price(open),
        high: price(hi),
        low: price(lo),
        close: price(close),
        volume: m === 25 ? null : String(100 + m * 2),
        fetchedAt: updatedAt,
      });
    }
  const grouped = new Map<number, Candle[]>();
  for (const c of base) {
    const k = Math.floor(Date.parse(c.at) / step) * step;
    grouped.set(k, [...(grouped.get(k) ?? []), c]);
  }
  const candles: Candle[] = [];
  for (const [t, values] of grouped) {
    if (values.length !== step / 60000) continue;
    const sorted = values.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    candles.push({
      at: new Date(t).toISOString(),
      open: sorted[0].open,
      close: sorted.at(-1)!.close,
      high: sorted.reduce(
        (a, c) => (compare(c.high, a) > 0 ? c.high : a),
        sorted[0].high,
      ),
      low: sorted.reduce(
        (a, c) => (compare(c.low, a) < 0 ? c.low : a),
        sorted[0].low,
      ),
      volume: sorted.some((c) => c.volume === null)
        ? null
        : formatDecimal(sorted.reduce((s, c) => s + decimal(c.volume!), 0n)),
      fetchedAt: updatedAt,
    });
  }
  const slots = candleSlots(
    candles,
    input.interval,
    new Date(boundedStart).toISOString(),
    new Date(Math.max(end, boundedStart + step)).toISOString(),
    asOf,
  );
  const within = (at: string) =>
    Date.parse(at) >= boundedStart &&
    Date.parse(at) < end &&
    Date.parse(at) <= Date.parse(asOf);
  const liquidity: SeriesMetric[] = selected
    ? [10, 20, 30, 40, 50, 60, 90, 110]
        .filter((m) => m <= knownUntil)
        .map((m) => ({
          at: eventAt(m),
          value: m === 40 ? "10000" : selected.liquidity,
          reason: null,
          source: "[DÉMO] Indexeur local",
          fetchedAt: updatedAt,
        }))
        .filter((m) => within(m.at))
    : [];
  const marketCaps: SeriesMetric[] = candles
    .filter((c) => within(c.at))
    .map((c) => ({
      at: new Date(Date.parse(c.at) + step).toISOString(),
      value: marketCap(c.close, "100000000"),
      reason: null,
      source:
        "[DÉMO] prix de clôture × offre circulante fictive constante 100000000",
      fetchedAt: updatedAt,
    }));
  const trades: Trade[] = selected
    ? Array.from({ length: 24 }, (_, i) => ({
        id: "DEMO_TRADE_" + i,
        at: eventAt(10 + i * 2),
        side: i % 3 === 0 ? ("sell" as const) : ("buy" as const),
        usd: i === 5 ? null : String(20 + i * 3),
        tokenAmount: String(1000 + i * 10),
        wallet: "0xDEMO" + "0".repeat(32) + String(i + 1).padStart(4, "0"),
        source: "[DÉMO] Transactions préenregistrées",
      })).filter(
        (t) =>
          within(t.at) &&
          Date.parse(t.at) >= creation &&
          Date.parse(t.at) <= Date.parse(eventAt(knownUntil)),
      )
    : [];
  const social = demoSocialSnapshot(
    input.minute,
    input.socialDisabled,
    input.indexerDisabled,
  ).find((s) => s.token.id === token.id);
  const event = legacyEvents.find((e) => e.id === token.eventId);
  const markers: Marker[] = (
    [
      {
        id: "event",
        kind: "event",
        at: eventAt(0),
        label: event?.title ?? "[DÉMO] Annonce Nébula Mobile",
        target: "#page=events&event=" + token.eventId,
        knowledge: "INTERPRETED",
      },
      ...(social?.mentions
        .filter((m) => m.method === "exact_address")
        .slice(0, 20)
        .map((m) => ({
          id: m.postId,
          kind: "x_post" as const,
          at: m.publishedAt!,
          label:
            "Mention exacte · auteur du scénario " + (m.authorId ?? "inconnu"),
          target: "#page=conversations&conversation=DEMO_POST_ROOT",
          knowledge: "OBSERVED" as const,
        })) ?? []),
      {
        id: "pool",
        kind: "pool_created",
        at: eventAt(8),
        label: "[DÉMO] Création du pool",
        target: null,
        knowledge: "OBSERVED",
      },
      {
        id: "alert",
        kind: "alert",
        at: eventAt(32),
        label: "[DÉMO] Alerte historique préenregistrée, moteur non exécuté",
        target: "#page=alerts",
        knowledge: "OBSERVED",
      },
      ...importantChanges(slots, liquidity).filter(
        (m) => input.simulation !== "conflict" || m.kind !== "price_change",
      ),
    ] satisfies Marker[]
  ).filter(
    (m) => within(m.at) && (!input.socialDisabled || m.kind !== "x_post"),
  );
  return {
    token: {
      ...token,
      createdAt:
        token.createdAt &&
        Date.parse(token.createdAt) <= Date.parse(asOf) &&
        !input.indexerDisabled
          ? token.createdAt
          : null,
      level: social?.level ?? token.level,
      flags: social?.flags ?? token.flags,
    },
    pools,
    selected,
    slots,
    candles,
    liquidity,
    marketCaps,
    trades,
    markers,
    summary: chartSummary(
      slots,
      asOf,
      input.interval,
      input.simulation === "conflict",
    ),
    asOf,
    start: new Date(boundedStart).toISOString(),
    end: new Date(end).toISOString(),
    limited: boundedStart > start,
    conflicts:
      input.simulation === "conflict" && candles.length
        ? [
            {
              at: candles.at(-1)!.at,
              values: [
                {
                  provider: "[DÉMO] Indexeur local",
                  close: candles.at(-1)!.close,
                },
                { provider: "[DÉMO] Source témoin", close: "0.009999" },
              ],
            },
          ]
        : [],
    reason: input.indexerDisabled
      ? "Source de marché exclue"
      : input.simulation === "unavailable"
        ? "Fournisseur fictif indisponible"
        : input.simulation === "empty"
          ? "Aucun pool connu pour ce scénario"
          : !selected
            ? "Pool demandé absent"
            : !candles.length
              ? "Token trop récent, granularité ou période sans données disponibles"
              : null,
    source: "[DÉMO] Jeu de marché local, aucune donnée réelle",
    updatedAt,
    capMethod:
      "Prix de clôture du pool × offre circulante fictive constante de 100000000 tokens. Estimation pédagogique, sans recoupement ; ce n’est pas une capitalisation réelle ni une FDV.",
    tradesPartial: true,
  };
}
export class DemoMarketProvider implements MarketProvider {
  readonly origin = "DEMO" as const;
  readonly name = "demo-market-v1";
  async pools(chain: Chain, address: string) {
    const s = demoChartSnapshot({
      chain,
      address,
      interval: "1m",
      range: "1h",
      minute: 60,
    });
    return {
      pools: s?.pools ?? [],
      partial: false,
      fetchedAt: eventAt(60),
      sourceUrl: "https://demo.memeradar.invalid/market/pools",
    };
  }
  async history(input: Parameters<MarketProvider["history"]>[0]) {
    const minute = (Date.parse(input.end) - Date.parse(eventAt(0))) / 60000;
    const s = demoChartSnapshot({
      ...input,
      range: "24h",
      minute,
      pool: input.pool.address,
    });
    return {
      candles: (s?.candles ?? [])
        .filter(
          (c) =>
            Date.parse(c.at) >= Date.parse(input.start) &&
            Date.parse(c.at) < Date.parse(input.end),
        )
        .slice(-300),
      liquidity: s?.liquidity ?? [],
      marketCaps: s?.marketCaps ?? [],
      trades: [],
      fetchedAt: eventAt(minute),
      partial: true,
      sourceUrl: "https://demo.memeradar.invalid/market/history",
    };
  }
  async trades(input: Parameters<MarketProvider["trades"]>[0]) {
    const s = demoChartSnapshot({
      ...input,
      interval: "1m",
      range: "1h",
      minute: 60,
      pool: input.pool.address,
    });
    return {
      trades: s?.trades ?? [],
      fetchedAt: eventAt(60),
      partial: true,
      sourceUrl: "https://demo.memeradar.invalid/market/trades",
    };
  }
}
