import { z } from "zod";
import type { JsonTransport } from "../../shared/http";
import { ProviderError } from "../../shared/errors";
import { normalizeAddress, type Chain } from "../../social/identity";
import { plainDecimal } from "../../charts/decimal";
import {
  candleSchema,
  poolSchema,
  tradeSchema,
  type ChartPool,
  type Interval,
} from "../../charts/model";
import type {
  MarketProvider,
  MarketGate,
  ChartBatch,
} from "../../charts/provider";
const networks: Record<Chain, string> = {
  ethereum: "eth",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  solana: "solana",
};
/** Preserve monetary JSON numeric lexemes before JSON.parse converts them to binary floats. */
export function losslessMarketJson(body: string): unknown {
  if (body.length > 2000000) throw new ProviderError("INVALID_RESPONSE");
  try {
    return JSON.parse(
      body.replace(
        /"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
        (s) => (s.startsWith('"') ? s : JSON.stringify(s)),
      ),
    );
  } catch {
    throw new ProviderError("INVALID_RESPONSE");
  }
}
const exact = z.string().transform((s, ctx) => {
  try {
    return plainDecimal(s);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid exact decimal" });
    return z.NEVER;
  }
});
const stamp = z.iso.datetime({ offset: true });
const envelope = z.object({
  data: z
    .array(
      z.object({
        id: z.string().max(200),
        attributes: z.record(z.string(), z.unknown()),
        relationships: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(300),
});
export class GeckoTerminalProvider implements MarketProvider {
  readonly origin = "REAL" as const;
  readonly name = "geckoterminal-v2";
  constructor(
    private transport: JsonTransport,
    private gate: MarketGate,
    private enabled = false,
    private now = () => Date.now(),
  ) {}
  private token(chain: Chain, address: string) {
    if (!networks[chain] || !normalizeAddress(chain, address, "REAL"))
      throw new ProviderError("INVALID_INPUT");
    return normalizeAddress(chain, address, "REAL")!;
  }
  private url(path: string) {
    return new URL("https://api.geckoterminal.com/api/v2/" + path);
  }
  private async get(url: URL): Promise<unknown> {
    if (!this.enabled) throw new ProviderError("NOT_CONFIGURED");
    await this.gate.reserve();
    const r = await this.transport.get(url, {});
    if (r.status === 429) {
      const n = Number(r.headers["retry-after"]);
      const seconds =
        Number.isFinite(n) && n > 0 ? Math.min(3600, Math.ceil(n)) : 60;
      await this.gate.backoff(seconds);
      throw new ProviderError("RATE_LIMITED", true, seconds * 1000, true, 429);
    }
    if (r.status === 401 || r.status === 403)
      throw new ProviderError("ACCESS_DENIED");
    if (r.status !== 200)
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        r.status >= 500,
        0,
        true,
        r.status,
      );
    const type = r.headers["content-type"] ?? "";
    if (!type.toLowerCase().includes("application/json"))
      throw new ProviderError("INVALID_RESPONSE");
    return losslessMarketJson(r.body);
  }
  async pools(chain: Chain, address: string) {
    const token = this.token(chain, address),
      network = networks[chain],
      url = this.url(`networks/${network}/tokens/${token}/pools`);
    url.searchParams.set("page", "1");
    try {
      const raw = envelope.parse(await this.get(url)),
        fetchedAt = new Date(this.now()).toISOString();
      const pools = raw.data.map((row) => {
        const a = z
          .object({
            address: z.string(),
            name: z.string(),
            reserve_in_usd: exact.nullable(),
            pool_created_at: stamp.nullable(),
          })
          .parse(row.attributes);
        const rel = z
          .object({
            base_token: z.object({ data: z.object({ id: z.string() }) }),
            quote_token: z.object({ data: z.object({ id: z.string() }) }),
          })
          .parse(row.relationships);
        const identity = (s: string) =>
          s.startsWith(network + "_")
            ? normalizeAddress(chain, s.slice(network.length + 1), "REAL")
            : null;
        const base = identity(rel.base_token.data.id),
          quote = identity(rel.quote_token.data.id),
          pool = normalizeAddress(chain, a.address, "REAL");
        if (!pool || (base !== token && quote !== token) || base === quote)
          throw new Error();
        return poolSchema.parse({
          address: pool,
          dex: a.name,
          quote: base === token ? quote : base,
          tokenSide: base === token ? "base" : "quote",
          provider: this.name,
          liquidity: a.reserve_in_usd,
          createdAt: a.pool_created_at,
          updatedAt: fetchedAt,
        });
      });
      return { pools, partial: true, fetchedAt, sourceUrl: url.toString() };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("INVALID_RESPONSE");
    }
  }
  async history(input: {
    chain: Chain;
    address: string;
    pool: ChartPool;
    interval: Interval;
    start: string;
    end: string;
  }): Promise<ChartBatch> {
    this.token(input.chain, input.address);
    const pool = this.token(input.chain, input.pool.address),
      m: Record<Interval, [string, string]> = {
        "1m": ["minute", "1"],
        "5m": ["minute", "5"],
        "15m": ["minute", "15"],
        "1h": ["hour", "1"],
        "4h": ["hour", "4"],
        "1d": ["day", "1"],
      };
    if (
      !m[input.interval] ||
      !z.iso.datetime().safeParse(input.start).success ||
      !z.iso.datetime().safeParse(input.end).success ||
      Date.parse(input.end) <= Date.parse(input.start)
    )
      throw new ProviderError("INVALID_INPUT");
    const [frame, aggregate] = m[input.interval],
      url = this.url(
        `networks/${networks[input.chain]}/pools/${pool}/ohlcv/${frame}`,
      );
    for (const [k, v] of Object.entries({
      aggregate,
      limit: "300",
      currency: "usd",
      token: input.pool.tokenSide,
      before_timestamp: String(Math.floor(Date.parse(input.end) / 1000) - 1),
      include_empty_intervals: "false",
    }))
      url.searchParams.set(k, v);
    try {
      const data = z
        .object({
          data: z.object({
            attributes: z.object({
              ohlcv_list: z
                .array(
                  z.tuple([
                    z.string().regex(/^\d{1,12}$/),
                    exact,
                    exact,
                    exact,
                    exact,
                    exact.nullable(),
                  ]),
                )
                .max(300),
            }),
          }),
        })
        .parse(await this.get(url));
      const fetchedAt = new Date(this.now()).toISOString();
      const candles = data.data.attributes.ohlcv_list
        .map((r) =>
          candleSchema.parse({
            at: new Date(Number(r[0]) * 1000).toISOString(),
            open: r[1],
            high: r[2],
            low: r[3],
            close: r[4],
            volume: r[5],
            fetchedAt,
          }),
        )
        .filter(
          (c) =>
            Date.parse(c.at) >= Date.parse(input.start) &&
            Date.parse(c.at) < Date.parse(input.end),
        );
      return {
        candles,
        liquidity: [],
        marketCaps: [],
        trades: [],
        fetchedAt,
        partial: true,
        sourceUrl: url.toString(),
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("INVALID_RESPONSE");
    }
  }
  async trades(input: { chain: Chain; address: string; pool: ChartPool }) {
    const token = this.token(input.chain, input.address),
      pool = this.token(input.chain, input.pool.address),
      url = this.url(`networks/${networks[input.chain]}/pools/${pool}/trades`);
    try {
      const raw = envelope.parse(await this.get(url)),
        fetchedAt = new Date(this.now()).toISOString();
      const trades = raw.data.map((r) => {
        const a = z
          .object({
            block_timestamp: stamp,
            from_token_address: z.string(),
            to_token_address: z.string(),
            from_token_amount: exact.nullable(),
            to_token_amount: exact.nullable(),
            volume_in_usd: exact.nullable(),
            tx_from_address: z.string().nullable(),
          })
          .parse(r.attributes);
        const from = normalizeAddress(
            input.chain,
            a.from_token_address,
            "REAL",
          ),
          to = normalizeAddress(input.chain, a.to_token_address, "REAL");
        if (from === to || ![from, to].includes(token)) throw new Error();
        return tradeSchema.parse({
          id: r.id,
          at: a.block_timestamp,
          side: to === token ? "buy" : "sell",
          usd: a.volume_in_usd,
          tokenAmount: to === token ? a.to_token_amount : a.from_token_amount,
          wallet: a.tx_from_address
            ? normalizeAddress(input.chain, a.tx_from_address, "REAL")
            : null,
          source: this.name,
        });
      });
      return { trades, fetchedAt, partial: true, sourceUrl: url.toString() };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("INVALID_RESPONSE");
    }
  }
}
