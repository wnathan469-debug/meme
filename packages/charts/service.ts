import type { PgChartRepository, ChartRequest } from "../db/chart-repository";
import type { MarketProvider } from "./provider";
import { ProviderError } from "../shared/errors";
export class ChartService {
  constructor(
    private repo: PgChartRepository,
    private provider: MarketProvider | null,
  ) {
    if (provider && provider.origin !== repo.origin)
      throw new ProviderError("INVALID_INPUT");
  }
  read(input: ChartRequest) {
    return this.repo.read(input);
  }
  async discover(
    input: Pick<ChartRequest, "chain" | "address">,
    confirmed = false,
  ) {
    if (!confirmed) throw new ProviderError("ACCESS_DENIED");
    if (!this.provider) throw new ProviderError("NOT_CONFIGURED");
    const result = await this.provider.pools(input.chain, input.address);
    await this.repo.storePools(
      input.chain,
      input.address,
      result.pools,
      this.provider.name,
      result.sourceUrl,
    );
    return {
      pools: result.pools,
      partial: result.partial,
      networkCalls: this.provider.origin === "DEMO" ? 0 : 1,
    };
  }
  async refresh(input: ChartRequest, confirmed = false, includeTrades = false) {
    if (!confirmed) throw new ProviderError("ACCESS_DENIED");
    if (!this.provider) throw new ProviderError("NOT_CONFIGURED");
    const old = await this.repo.read(input);
    if (!old.selected) return { status: "no_pool", snapshot: old };
    if (old.selected.provider !== this.provider.name)
      return { status: "pool_unverified", snapshot: old };
    const selected = { ...input, pool: old.selected.address },
      claim = await this.repo.claim(selected, this.provider.name);
    if (!claim) return { status: "cached_or_loading", snapshot: old };
    try {
      const batch = await this.provider.history({
        ...input,
        pool: old.selected,
      });
      if (includeTrades) {
        try {
          const result = await this.provider.trades({
            ...input,
            pool: old.selected,
          });
          batch.trades = result.trades;
          batch.tradesStatus = result.partial ? "partial" : "available";
          batch.fetchedAt =
            Date.parse(result.fetchedAt) > Date.parse(batch.fetchedAt)
              ? result.fetchedAt
              : batch.fetchedAt;
        } catch (e) {
          batch.tradesStatus = "error";
          batch.tradesError =
            e instanceof ProviderError ? e.code : "PROVIDER_UNAVAILABLE";
        }
      }
      await this.repo.finish(selected, claim, this.provider.name, batch);
      return { status: "refreshed", snapshot: await this.repo.read(input) };
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : "PROVIDER_UNAVAILABLE";
      await this.repo.finish(selected, claim, this.provider.name, null, code);
      return {
        status: "stale_or_error",
        error: code,
        snapshot: await this.repo.read(input),
      };
    }
  }
}
