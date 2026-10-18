import { matchEvent } from "../events/model";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import type { Origin } from "../connectors/x/contracts";
import { normalizeAddress, CHAINS, type Chain } from "../social/identity";
import {
  intervals,
  ttlSeconds,
  candleSchema,
  poolSchema,
  metricSchema,
  tradeSchema,
  defaultPool,
  candleSlots,
  chartSummary,
  displayText,
  type ChartPool,
  type Interval,
  type Candle,
  type SeriesMetric,
  type Trade,
  type Marker,
} from "../charts/model";
import { socialVisibility } from "./social-visibility";
import type { ChartBatch, MarketGate } from "../charts/provider";
export interface ChartRequest {
  chain: Chain;
  address: string;
  pool?: string;
  interval: Interval;
  start: string;
  end: string;
  asOf: string;
}
const requestSchema = z.object({
  chain: z.enum(CHAINS),
  address: z.string(),
  pool: z.string().optional(),
  interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  asOf: z.iso.datetime(),
});
export class PgChartRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: Origin,
    private now = () => Date.now(),
  ) {
    if (!z.uuid().safeParse(ownerId).success)
      throw new ProviderError("INVALID_INPUT");
  }
  private tx<T>(fn: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, fn);
  }
  private parse(input: ChartRequest) {
    const p = requestSchema.safeParse(input);
    if (
      !p.success ||
      !normalizeAddress(input.chain, input.address, this.origin) ||
      (input.pool && !normalizeAddress(input.chain, input.pool, this.origin))
    )
      throw new ProviderError("INVALID_INPUT");
    try {
      candleSlots([], input.interval, input.start, input.end, input.asOf);
    } catch {
      throw new ProviderError("INVALID_INPUT");
    }
  }
  private async token(c: PoolClient, chain: Chain, address: string) {
    const t = (
      await c.query(
        "SELECT t.*,ch.slug FROM memeradar.tokens t JOIN memeradar.chains ch ON ch.id=t.chain_id AND ch.data_origin=t.data_origin WHERE ch.slug=$1 AND t.address_identity=$2 AND t.data_origin=$3",
        [
          chain,
          chain === "solana"
            ? normalizeAddress(chain, address, this.origin)
            : normalizeAddress(chain, address, this.origin)?.toLowerCase(),
          this.origin,
        ],
      )
    ).rows[0];
    if (!t) throw new ProviderError("NOT_FOUND");
    return t;
  }
  private url(source: string) {
    try {
      const u = new URL(source);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        (this.origin === "DEMO"
          ? u.hostname !== "demo.memeradar.invalid"
          : u.hostname !== "api.geckoterminal.com")
      )
        throw new Error();
    } catch {
      throw new ProviderError("INVALID_INPUT");
    }
  }
  async storePools(
    chain: Chain,
    address: string,
    pools: ChartPool[],
    provider: string,
    sourceUrl: string,
  ) {
    if (
      !CHAINS.includes(chain) ||
      !normalizeAddress(chain, address, this.origin) ||
      pools.length > 20 ||
      !["geckoterminal-v2", "demo-market-v1"].includes(provider)
    )
      throw new ProviderError("INVALID_INPUT");
    this.url(sourceUrl);
    const values = pools.map((raw) => {
      const p = poolSchema.safeParse(raw);
      if (
        !p.success ||
        !normalizeAddress(chain, p.data.address, this.origin) ||
        Date.parse(p.data.updatedAt) > this.now() + 1000
      )
        throw new ProviderError("INVALID_INPUT");
      return p.data;
    });
    return this.tx(async (c) => {
      const t = await this.token(c, chain, address);
      for (const p of values) {
        await c.query(
          "INSERT INTO memeradar.pools(data_origin,token_id,dex,pool_address,quote_token,created_at_onchain,liquidity_usd,lp_locked_status,last_updated_at,price_token_side,market_provider) VALUES($1,$2,$3,$4,$5,$6,$7,'unknown',$8,$9,$10) ON CONFLICT(data_origin,token_id,pool_address) DO UPDATE SET dex=EXCLUDED.dex,quote_token=EXCLUDED.quote_token,liquidity_usd=EXCLUDED.liquidity_usd,last_updated_at=EXCLUDED.last_updated_at,price_token_side=EXCLUDED.price_token_side,market_provider=EXCLUDED.market_provider WHERE pools.last_updated_at<=EXCLUDED.last_updated_at",
          [
            this.origin,
            t.id,
            p.dex,
            p.address,
            p.quote,
            p.createdAt,
            p.liquidity,
            p.updatedAt,
            p.tokenSide,
            provider,
          ],
        );
        await c.query(
          "INSERT INTO memeradar.pool_market_samples(data_origin,token_id,pool_address,metric,observed_at,value,missing_reason,provider,fetched_at,source_url) VALUES($1,$2,$3,'liquidity_usd',$4,$5,$6,$7,$4,$8) ON CONFLICT(data_origin,token_id,pool_address,metric,observed_at,provider) DO NOTHING",
          [
            this.origin,
            t.id,
            p.address,
            p.updatedAt,
            p.liquidity,
            p.liquidity === null ? "Liquidité non fournie" : null,
            provider,
            sourceUrl,
          ],
        );
      }
      return values.length;
    });
  }
  async read(input: ChartRequest) {
    this.parse(input);
    return this.tx(async (c) => {
      const t = await this.token(c, input.chain, input.address);
      const rows = (
        await c.query(
          "SELECT * FROM memeradar.pools WHERE token_id=$1 AND data_origin=$2 ORDER BY pool_address LIMIT 101",
          [t.id, this.origin],
        )
      ).rows;
      if (rows.length > 100) throw new ProviderError("INVALID_INPUT");
      const pools: ChartPool[] = rows.map((p) => ({
        address: p.pool_address,
        dex: displayText(p.dex),
        quote: p.quote_token,
        tokenSide: p.price_token_side,
        provider: p.market_provider,
        createdAt: p.created_at_onchain?.toISOString() ?? null,
        liquidity:
          p.last_updated_at <= new Date(input.asOf) ? p.liquidity_usd : null,
        updatedAt: p.last_updated_at.toISOString(),
      }));
      const selected = input.pool
        ? pools.find((p) => p.address === input.pool)
        : defaultPool(pools);
      if (input.pool && !selected) throw new ProviderError("NOT_FOUND");
      const token = {
        id: t.id,
        name: t.name === null ? null : displayText(t.name),
        symbol: t.symbol === null ? null : displayText(t.symbol),
        chain: input.chain,
        address: t.contract_address,
        createdAt: t.created_at_onchain?.toISOString() ?? null,
      };
      if (!selected)
        return {
          token,
          pools,
          selected: null,
          slots: candleSlots(
            [],
            input.interval,
            input.start,
            input.end,
            input.asOf,
          ),
          candles: [] as Candle[],
          liquidity: [] as SeriesMetric[],
          marketCaps: [] as SeriesMetric[],
          trades: [] as Trade[],
          markers: [] as Marker[],
          conflicts: [] as {
            at: string;
            values: { provider: string; close: string }[];
          }[],
          cache: null,
          reason: "Aucun pool connu dans les données collectées",
        };
      const candlesRows = (
        await c.query(
          "SELECT * FROM memeradar.price_candles WHERE token_id=$1 AND data_origin=$2 AND pool_address=$3 AND interval=$4 AND bucket_start>=$5 AND bucket_start<$6 AND fetched_at<=$7 ORDER BY bucket_start,provider LIMIT 3001",
          [
            t.id,
            this.origin,
            selected.address,
            input.interval,
            input.start,
            input.end,
            input.asOf,
          ],
        )
      ).rows;
      if (candlesRows.length > 3000) throw new ProviderError("INVALID_INPUT");
      const byTime = new Map<string, any[]>();
      for (const r of candlesRows) {
        const key = r.bucket_start.toISOString();
        byTime.set(key, [...(byTime.get(key) ?? []), r]);
      }
      const conflicts: {
          at: string;
          values: { provider: string; close: string }[];
        }[] = [],
        candles: Candle[] = [];
      for (const [at, values] of byTime) {
        if (
          new Set(
            values.map((v) =>
              [v.open, v.high, v.low, v.close, v.volume].join(":"),
            ),
          ).size > 1
        )
          conflicts.push({
            at,
            values: values.map((v) => ({
              provider: v.provider,
              close: v.close,
            })),
          });
        const v = [...values].sort(
          (a, b) =>
            b.fetched_at - a.fetched_at || a.provider.localeCompare(b.provider),
        )[0];
        candles.push({
          at,
          open: v.open,
          high: v.high,
          low: v.low,
          close: v.close,
          volume: v.volume,
          fetchedAt: v.fetched_at.toISOString(),
        });
      }
      const samples = (
        await c.query(
          "SELECT * FROM memeradar.pool_market_samples WHERE token_id=$1 AND data_origin=$2 AND pool_address=$3 AND observed_at>=$4 AND observed_at<$5 AND fetched_at<=$6 ORDER BY observed_at,provider LIMIT 3001",
          [
            t.id,
            this.origin,
            selected.address,
            input.start,
            input.end,
            input.asOf,
          ],
        )
      ).rows;
      if (samples.length > 3000) throw new ProviderError("INVALID_INPUT");
      const metric = (name: string): SeriesMetric[] =>
        samples
          .filter((s) => s.metric === name)
          .map((s) => ({
            at: s.observed_at.toISOString(),
            value: s.value,
            reason: s.missing_reason,
            source: s.provider,
            fetchedAt: s.fetched_at.toISOString(),
          }));
      const tr = (
        await c.query(
          "SELECT * FROM memeradar.pool_trades WHERE token_id=$1 AND data_origin=$2 AND pool_address=$3 AND occurred_at>=$4 AND occurred_at<$5 AND fetched_at<=$6 ORDER BY occurred_at DESC,external_id LIMIT 301",
          [
            t.id,
            this.origin,
            selected.address,
            input.start,
            input.end,
            input.asOf,
          ],
        )
      ).rows;
      const trades: Trade[] = tr.slice(0, 300).map((r) => ({
        id: r.external_id,
        at: r.occurred_at.toISOString(),
        side: r.side,
        usd: r.usd,
        tokenAmount: r.token_amount,
        wallet: r.wallet_address,
        source: r.provider,
      }));
      const cache =
        (
          await c.query(
            "SELECT fetched_at,status,error_code,source_url,provider,trades_status,trades_error_code FROM memeradar.chart_cache_windows WHERE token_id=$1 AND data_origin=$2 AND pool_address=$3 AND interval=$4 AND starts_at<=$5 AND ends_at>=$6 AND (fetched_at IS NULL OR fetched_at<=$7) ORDER BY fetched_at DESC NULLS LAST LIMIT 1",
            [
              t.id,
              this.origin,
              selected.address,
              input.interval,
              input.start,
              input.end,
              input.asOf,
            ],
          )
        ).rows[0] ?? null;
      const markers: Marker[] = [];
      const links = (
        await c.query(
          "SELECT e.id,e.title,e.first_published_at FROM memeradar.token_event_links l JOIN memeradar.events e ON e.id=l.event_id AND e.data_origin=l.data_origin WHERE l.token_id=$1 AND l.data_origin=$2 AND e.first_published_at<=$3 ORDER BY e.id LIMIT 101",
          [t.id, this.origin, input.asOf],
        )
      ).rows;
      const socialEvents = (
        await c.query(
          `SELECT e.id,e.title,e.first_published_at,p.text,p.post_type,p.entities,w.terms FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id AND p.data_origin=m.data_origin JOIN memeradar.post_event_links l ON l.post_id=p.id AND l.data_origin=p.data_origin JOIN memeradar.event_watches w ON w.id=l.watch_id AND w.owner_user_id=l.owner_user_id AND w.data_origin=l.data_origin AND w.revision=l.watch_revision JOIN memeradar.events e ON e.id=l.event_id AND e.data_origin=l.data_origin WHERE m.token_id=$1 AND m.data_origin=$2 AND l.owner_user_id=$3 AND ${socialVisibility("m", "p", "$3")} AND m.detection_method IN ('exact_address','token_page_url') AND p.availability_status='available' AND p.collected_at<=$4 AND p.published_at<=$4 AND e.first_published_at<=$4 AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$3) ORDER BY e.id,p.published_at LIMIT 101`,
          [t.id, this.origin, this.ownerId, input.asOf],
        )
      ).rows;
      for (const e of socialEvents.slice(0, 100))
        if (
          matchEvent(
            {
              text: e.text,
              type: e.post_type,
              entities: {
                hashtags: [],
                cashtags: [],
                mentions: [],
                urls: [],
                ...e.entities,
              },
            },
            e.terms,
          ) &&
          !links.some((l) => l.id === e.id)
        )
          links.push(e);
      for (const e of links.slice(0, 100))
        markers.push({
          id: e.id,
          at: e.first_published_at.toISOString(),
          kind: "event",
          label: e.title,
          target: "#page=events&event=" + e.id,
          knowledge: "INTERPRETED",
        });
      const posts = (
        await c.query(
          `SELECT DISTINCT p.x_post_id,p.published_at,EXISTS(SELECT 1 FROM memeradar.tracked_people tp WHERE tp.owner_user_id=$3 AND tp.data_origin=p.data_origin AND tp.x_user_id=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)) AS followed,EXISTS(SELECT 1 FROM memeradar.event_watches ew JOIN memeradar.post_event_links el ON el.watch_id=ew.id AND el.data_origin=ew.data_origin AND el.owner_user_id=ew.owner_user_id AND el.watch_revision=ew.revision CROSS JOIN LATERAL jsonb_array_elements(ew.official_accounts) a WHERE ew.owner_user_id=$3 AND ew.data_origin=p.data_origin AND el.post_id=p.id AND a->>'userId'=coalesce(p.author_x_user_id,p.unresolved_author_x_user_id)) AS official_attested FROM memeradar.post_token_mentions m JOIN memeradar.x_posts p ON p.id=m.post_id AND p.data_origin=m.data_origin WHERE m.token_id=$1 AND m.data_origin=$2 AND ${socialVisibility("m", "p", "$3")} AND m.detection_method IN ('exact_address','token_page_url') AND p.availability_status='available' AND p.published_at>=$4 AND p.published_at<$5 AND p.collected_at<=$6 AND EXISTS(SELECT 1 FROM memeradar.x_post_rules pr JOIN memeradar.x_rules r ON r.id=pr.rule_id AND r.data_origin=pr.data_origin WHERE pr.post_id=p.id AND pr.data_origin=p.data_origin AND r.owner_user_id=$3) ORDER BY p.published_at LIMIT 101`,
          [t.id, this.origin, this.ownerId, input.start, input.end, input.asOf],
        )
      ).rows;
      for (const p of posts.slice(0, 100))
        markers.push({
          id: p.x_post_id,
          at: p.published_at.toISOString(),
          kind: "x_post",
          label:
            "Mention exacte connue · " +
            (p.official_attested
              ? "compte officiellement attesté manuellement · "
              : p.followed
                ? "personne actuellement suivie · "
                : "") +
            p.x_post_id,
          target:
            this.origin === "DEMO"
              ? null
              : `https://x.com/i/status/${p.x_post_id}`,
          knowledge: "OBSERVED",
        });
      const alerts = (
        await c.query(
          "SELECT a.id,a.triggered_at,a.reason FROM memeradar.alerts a JOIN memeradar.alert_rules r ON r.id=a.rule_id AND r.data_origin=a.data_origin WHERE a.token_id=$1 AND a.data_origin=$2 AND r.user_id=$3 AND a.triggered_at>=$4 AND a.triggered_at<$5 AND a.triggered_at<=$6 ORDER BY a.triggered_at LIMIT 101",
          [t.id, this.origin, this.ownerId, input.start, input.end, input.asOf],
        )
      ).rows;
      for (const a of alerts.slice(0, 100))
        markers.push({
          id: a.id,
          at: a.triggered_at.toISOString(),
          kind: "alert",
          label: a.reason,
          target: "#page=alerts",
          knowledge: "OBSERVED",
        });
      if (selected.createdAt)
        markers.push({
          id: "pool-" + selected.address,
          at: selected.createdAt,
          kind: "pool_created",
          label: "Création du pool enregistrée",
          target: null,
          knowledge: "OBSERVED",
        });
      return {
        token,
        pools,
        selected,
        slots: candleSlots(
          candles,
          input.interval,
          input.start,
          input.end,
          input.asOf,
        ),
        candles,
        liquidity: metric("liquidity_usd"),
        marketCaps: metric("market_cap_estimated"),
        trades,
        markers,
        conflicts,
        cache,
        tradesPartial: tr.length > 300 || cache?.trades_status !== "available",
        markersPartial:
          posts.length > 100 ||
          alerts.length > 100 ||
          links.length > 100 ||
          socialEvents.length > 100,
        summary: chartSummary(
          candleSlots(
            candles,
            input.interval,
            input.start,
            input.end,
            input.asOf,
          ),
          input.asOf,
          input.interval,
          conflicts.length > 0,
        ),
        reason: candles.length
          ? null
          : "Aucune donnée de prix disponible dans le cache pour ce token/pool",
      };
    });
  }
  async claim(input: ChartRequest, provider: string, now = this.now()) {
    this.parse(input);
    if (
      !input.pool ||
      !["geckoterminal-v2", "demo-market-v1"].includes(provider)
    )
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const t = await this.token(c, input.chain, input.address),
        lease = randomUUID(),
        ttl = ttlSeconds[input.interval] * 1000;
      const row = (
        await c.query(
          "INSERT INTO memeradar.chart_cache_windows(data_origin,token_id,pool_address,interval,starts_at,ends_at,provider,status,lease_id,lease_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) ON CONFLICT(data_origin,token_id,pool_address,interval,starts_at,ends_at,provider) DO UPDATE SET lease_id=EXCLUDED.lease_id,lease_expires_at=EXCLUDED.lease_expires_at WHERE (chart_cache_windows.lease_expires_at IS NULL OR chart_cache_windows.lease_expires_at<=$10) AND (chart_cache_windows.fetched_at IS NULL OR chart_cache_windows.fetched_at<=$11 OR chart_cache_windows.status='error') RETURNING id",
          [
            this.origin,
            t.id,
            input.pool,
            input.interval,
            input.start,
            input.end,
            provider,
            lease,
            new Date(now + 60000),
            new Date(now),
            new Date(now - ttl),
          ],
        )
      ).rows[0];
      return row ? { id: row.id, lease, tokenId: t.id } : null;
    });
  }
  async finish(
    input: ChartRequest,
    claim: { id: string; lease: string; tokenId: string },
    provider: string,
    batch: ChartBatch | null,
    errorCode: string | null = null,
  ) {
    this.parse(input);
    if (
      !input.pool ||
      !z.uuid().safeParse(claim.id).success ||
      !z.uuid().safeParse(claim.lease).success ||
      !["geckoterminal-v2", "demo-market-v1"].includes(provider) ||
      (errorCode && !/^[A-Z_]{1,60}$/.test(errorCode))
    )
      throw new ProviderError("INVALID_INPUT");
    if (batch) {
      this.url(batch.sourceUrl);
      if (
        !z.iso.datetime().safeParse(batch.fetchedAt).success ||
        Date.parse(batch.fetchedAt) > this.now() + 1000 ||
        batch.candles.length > 300 ||
        batch.trades.length > 300 ||
        batch.liquidity.length > 1500 ||
        batch.marketCaps.length > 1500
      )
        throw new ProviderError("INVALID_INPUT");
      for (const raw of batch.candles) {
        const p = candleSchema.safeParse(raw);
        if (
          !p.success ||
          Date.parse(raw.at) % (intervals[input.interval] * 1000) !== 0 ||
          Date.parse(raw.at) < Date.parse(input.start) ||
          Date.parse(raw.at) >= Date.parse(input.end) ||
          Date.parse(raw.fetchedAt) > Date.parse(batch.fetchedAt)
        )
          throw new ProviderError("INVALID_INPUT");
      }
      for (const raw of [...batch.liquidity, ...batch.marketCaps])
        if (!metricSchema.safeParse(raw).success)
          throw new ProviderError("INVALID_INPUT");
      for (const raw of batch.trades)
        if (!tradeSchema.safeParse(raw).success)
          throw new ProviderError("INVALID_INPUT");
    }
    return this.tx(async (c) => {
      const t = await this.token(c, input.chain, input.address);
      const row = (
        await c.query(
          "SELECT * FROM memeradar.chart_cache_windows WHERE id=$1 AND data_origin=$2 AND token_id=$3 AND lease_id=$4 AND lease_expires_at>$5 FOR UPDATE",
          [claim.id, this.origin, t.id, claim.lease, new Date(this.now())],
        )
      ).rows[0];
      if (
        !row ||
        row.pool_address !== input.pool ||
        row.interval !== input.interval ||
        row.provider !== provider ||
        row.starts_at.getTime() !== Date.parse(input.start) ||
        row.ends_at.getTime() !== Date.parse(input.end)
      )
        throw new ProviderError("COLLECTION_LEASE_LOST");
      if (batch) {
        for (const v of batch.candles)
          await c.query(
            "INSERT INTO memeradar.price_candles(data_origin,token_id,pool_address,interval,bucket_start,open,high,low,close,volume,provider,fetched_at,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(data_origin,token_id,pool_address,interval,bucket_start,provider) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,fetched_at=EXCLUDED.fetched_at,source_url=EXCLUDED.source_url WHERE price_candles.fetched_at<=EXCLUDED.fetched_at",
            [
              this.origin,
              t.id,
              input.pool,
              input.interval,
              v.at,
              v.open,
              v.high,
              v.low,
              v.close,
              v.volume,
              provider,
              v.fetchedAt,
              batch.sourceUrl,
            ],
          );
        for (const [name, values] of [
          ["liquidity_usd", batch.liquidity],
          ["market_cap_estimated", batch.marketCaps],
        ] as const)
          for (const v of values)
            await c.query(
              "INSERT INTO memeradar.pool_market_samples(data_origin,token_id,pool_address,metric,observed_at,value,missing_reason,provider,fetched_at,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(data_origin,token_id,pool_address,metric,observed_at,provider) DO UPDATE SET value=EXCLUDED.value,missing_reason=EXCLUDED.missing_reason,fetched_at=EXCLUDED.fetched_at WHERE pool_market_samples.fetched_at<=EXCLUDED.fetched_at",
              [
                this.origin,
                t.id,
                input.pool,
                name,
                v.at,
                v.value,
                v.reason,
                provider,
                v.fetchedAt,
                batch.sourceUrl,
              ],
            );
        for (const v of batch.trades)
          await c.query(
            "INSERT INTO memeradar.pool_trades(data_origin,token_id,pool_address,external_id,occurred_at,side,usd,token_amount,wallet_address,provider,fetched_at,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(data_origin,token_id,pool_address,external_id,provider) DO NOTHING",
            [
              this.origin,
              t.id,
              input.pool,
              v.id,
              v.at,
              v.side,
              v.usd,
              v.tokenAmount,
              v.wallet,
              provider,
              batch.fetchedAt,
              batch.sourceUrl,
            ],
          );
      }
      await c.query(
        "UPDATE memeradar.chart_cache_windows SET status=$1,error_code=$2,fetched_at=$3,source_url=coalesce($4,source_url),trades_status=$7,trades_error_code=$8,lease_id=NULL,lease_expires_at=NULL WHERE id=$5 AND data_origin=$6",
        [
          batch
            ? batch.candles.length
              ? batch.partial
                ? "partial"
                : "available"
              : "empty"
            : "error",
          errorCode,
          batch ? batch.fetchedAt : new Date(this.now()).toISOString(),
          batch?.sourceUrl ?? null,
          claim.id,
          this.origin,
          batch?.tradesStatus ?? "not_requested",
          batch?.tradesError ?? null,
        ],
      );
      return { status: batch ? "stored" : "error" };
    });
  }
}
/** Shared PostgreSQL gate for the free public endpoint: 20 attempts/minute, no retry loop. */
export class PgMarketGate implements MarketGate {
  constructor(
    private pool: Pool,
    private origin: Origin,
    private provider = "geckoterminal-v2",
    private now = () => Date.now(),
  ) {}
  async reserve() {
    const n = this.now(),
      window = new Date(Math.floor(n / 60000) * 60000);
    const r = await this.pool.query(
      "INSERT INTO memeradar.market_request_controls(data_origin,provider,window_start,requests) VALUES($1,$2,$3,1) ON CONFLICT(data_origin,provider) DO UPDATE SET window_start=EXCLUDED.window_start,requests=CASE WHEN market_request_controls.window_start<EXCLUDED.window_start THEN 1 ELSE market_request_controls.requests+1 END WHERE (market_request_controls.blocked_until IS NULL OR market_request_controls.blocked_until<=$4) AND (market_request_controls.window_start<EXCLUDED.window_start OR market_request_controls.requests<20) RETURNING id",
      [this.origin, this.provider, window, new Date(n)],
    );
    if (!r.rowCount) throw new ProviderError("RATE_LIMITED", true, 60000);
  }
  async backoff(seconds: number) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600)
      throw new ProviderError("INVALID_INPUT");
    await this.pool.query(
      "UPDATE memeradar.market_request_controls SET blocked_until=greatest(coalesce(blocked_until,$1),$1) WHERE data_origin=$2 AND provider=$3",
      [new Date(this.now() + seconds * 1000), this.origin, this.provider],
    );
  }
}
