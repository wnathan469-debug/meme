import type { Chain } from "../social/identity";
import type { Origin } from "../connectors/x/contracts";
import type { Candle, ChartPool, Interval, SeriesMetric, Trade } from "./model";
export interface ChartBatch {
  candles: Candle[];
  liquidity: SeriesMetric[];
  marketCaps: SeriesMetric[];
  trades: Trade[];
  fetchedAt: string;
  partial: boolean;
  sourceUrl: string;
  tradesStatus?: "not_requested" | "available" | "partial" | "error";
  tradesError?: string;
}
export interface MarketProvider {
  readonly origin: Origin;
  readonly name: string;
  pools(
    chain: Chain,
    address: string,
  ): Promise<{
    pools: ChartPool[];
    partial: boolean;
    fetchedAt: string;
    sourceUrl: string;
  }>;
  history(input: {
    chain: Chain;
    address: string;
    pool: ChartPool;
    interval: Interval;
    start: string;
    end: string;
  }): Promise<ChartBatch>;
  trades(input: { chain: Chain; address: string; pool: ChartPool }): Promise<{
    trades: Trade[];
    fetchedAt: string;
    partial: boolean;
    sourceUrl: string;
  }>;
}
export interface MarketGate {
  reserve(): Promise<void>;
  backoff(seconds: number): Promise<void>;
}
