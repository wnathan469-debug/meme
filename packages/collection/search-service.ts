import { randomUUID, createHash } from "node:crypto";
import { ProviderError } from "../shared/errors";
import { systemClock, type Clock } from "../shared/runtime";
import type { XConfig } from "../connectors/x/config";
import type { XProvider } from "../connectors/x/contracts";
import { validateQuery } from "../connectors/x/client";
import type { PgXCollectionRepository } from "../db/x-collection-repository";
export class XSearchService {
  private readonly quotes = new Map<
    string,
    {
      query: string;
      pages: number;
      cost: string;
      expiresAt: number;
      pricingHash: string;
    }
  >();
  constructor(
    private readonly provider: XProvider,
    private readonly repository: PgXCollectionRepository,
    private readonly config: XConfig,
    private readonly clock: Clock = systemClock,
  ) {
    if (provider.dataOrigin !== repository.origin)
      throw new ProviderError("INVALID_INPUT");
  }
  local(filters: unknown) {
    return this.repository.localSearch(filters);
  }
  async quote(query: string, pages = 1) {
    validateQuery(query, this.config);
    if (!Number.isInteger(pages) || pages < 1 || pages > 10)
      throw new ProviderError("INVALID_INPUT");
    const caps = await this.provider.capabilities();
    if (caps.recent.state === "unavailable")
      throw new ProviderError("ACCESS_DENIED");
    const price = this.config.pricing;
    if (this.provider.dataOrigin === "REAL" && (!price || !this.config.budget))
      throw new ProviderError("PRICING_UNKNOWN");
    const cost =
      this.provider.dataOrigin === "DEMO"
        ? "0"
        : (
            (BigInt(price!.request) +
              (BigInt(price!.post) + BigInt(price!.user)) *
                BigInt(this.config.maxResults)) *
            BigInt(pages) *
            BigInt(this.config.maxRetries + 1)
          ).toString();
    if (this.quotes.size >= 1000)
      this.quotes.delete(this.quotes.keys().next().value!);
    const id = randomUUID(),
      expiresAt = this.clock.now() + 300000,
      pricingHash = createHash("sha256")
        .update(JSON.stringify(price))
        .digest("hex");
    this.quotes.set(id, { query, pages, cost, expiresAt, pricingHash });
    return {
      id,
      source: "x_api" as const,
      dataOrigin: this.provider.dataOrigin,
      maxRequests: pages * (this.config.maxRetries + 1),
      maxCostMicros: cost,
      estimated: true,
      windowSeconds: caps.recent.windowSeconds,
      quotaKnown: false,
      expiresAt: new Date(expiresAt).toISOString(),
      confirmationRequired: true,
    };
  }
  async execute(quoteId: string, acceptedMaxCostMicros: string) {
    const quote = this.quotes.get(quoteId);
    if (
      !quote ||
      quote.expiresAt <= this.clock.now() ||
      quote.cost !== acceptedMaxCostMicros ||
      quote.pricingHash !==
        createHash("sha256")
          .update(JSON.stringify(this.config.pricing))
          .digest("hex")
    )
      throw new ProviderError("INVALID_INPUT");
    this.quotes.delete(quoteId);
    const rule = await this.repository.createRule({
        query: quote.query,
        status: "paused",
        name: "Recherche X ponctuelle",
      }),
      lease = await this.repository.claim(
        rule,
        "search",
        this.clock.now(),
        60000,
        true,
        true,
      );
    if (!lease) throw new ProviderError("COLLECTION_LEASE_LOST");
    let nextToken: string | null = null,
      count = 0,
      partial = false;
    try {
      for (let i = 0; i < quote.pages; i++) {
        const page = await this.provider.searchRecent(quote.query, {
          maxResults: this.config.maxResults,
          nextToken: nextToken ?? undefined,
        });
        const result = await this.repository.ingest(
          lease,
          page,
          "search",
          this.clock.now(),
          60000,
        );
        count += result.newPosts;
        partial ||= page.partial;
        nextToken = page.nextToken;
        if (!nextToken) break;
      }
      await this.repository.finish(lease, {
        now: this.clock.now(),
        nextDueAt: this.clock.now() + 86400000,
        status: "completed",
      });
      return {
        ruleId: rule.id,
        newPosts: count,
        partial: !!nextToken || partial,
        source: "x_api" as const,
        estimatedMaxCostMicros: quote.cost,
      };
    } catch (error) {
      try {
        await this.repository.finish(lease, {
          now: this.clock.now(),
          nextDueAt: this.clock.now() + 86400000,
          status: "failed",
          errorCode:
            error instanceof ProviderError ? error.code : "NETWORK_ERROR",
        });
      } catch {}
      throw error;
    }
  }
  async refreshAvailability(ids: string[]) {
    if (!ids.length || ids.length > this.config.maxLookupIds)
      throw new ProviderError("INVALID_INPUT");
    const page = await this.provider.getPostsByIds(ids),
      found = new Set(page.data.map((p) => p.id));
    const missing = ids.filter((id) => !found.has(id));
    await this.repository.hideUnavailable(missing, this.clock.now());
    return {
      checked: ids.length,
      hidden: missing.length,
      status: "unknown" as const,
    };
  }
}
