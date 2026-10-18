import { idSchema, type XProvider } from "../connectors/x/contracts";
import type {
  CollectionRepository,
  CollectionRule,
} from "../collection/contracts";
import { systemClock, type Clock } from "../shared/runtime";
import { ProviderError } from "../shared/errors";
import { intervals } from "./model";
import type { Pricing } from "../connectors/x/control";
export function estimateFollowing(
  pricing: Pricing | null,
  priority: keyof typeof intervals,
  maxResults: number,
  maxPages: number,
  maxRetries: number,
) {
  if (!pricing) return null;
  if (
    ![maxResults, maxPages, maxRetries].every(Number.isSafeInteger) ||
    maxResults < 1 ||
    maxPages < 1 ||
    maxRetries < 0
  )
    throw new ProviderError("INVALID_INPUT");
  // Upper bound includes a fresh public-profile check on every page and every retry.
  const cycle =
    BigInt(maxPages) *
    BigInt(maxRetries + 1) *
    (2n * BigInt(pricing.request) +
      BigInt(pricing.user) +
      BigInt(maxResults) * BigInt(pricing.post));
  return {
    currency: "USD",
    cycleMicros: cycle.toString(),
    dayMicros: (
      cycle * BigInt(Math.ceil(86400 / intervals[priority]))
    ).toString(),
    method:
      "Borne estimée, pages et reprises maximales ; hors validation initiale, pas une facture.",
  };
}
export class PeopleCollector {
  private stopped = false;
  stop() {
    this.stopped = true;
  }
  async run(signal: AbortSignal) {
    if (this.options.mode === "disabled") return;
    this.stopped = false;
    const stop = () => this.stop();
    signal.addEventListener("abort", stop, { once: true });
    try {
      while (!signal.aborted && !this.stopped) {
        await this.tick();
        if (!signal.aborted && !this.stopped) await this.clock.sleep(1000);
      }
    } finally {
      signal.removeEventListener("abort", stop);
    }
  }
  constructor(
    private provider: XProvider,
    private people: { collectionRules(): Promise<CollectionRule[]> },
    private repository: CollectionRepository,
    private options: {
      maxPages: number;
      maxResults: number;
      leaseMs: number;
      mode: string;
    },
    private clock: Clock = systemClock,
  ) {
    if (
      provider.dataOrigin !== repository.origin ||
      ![options.maxPages, options.maxResults, options.leaseMs].every(
        Number.isSafeInteger,
      ) ||
      options.maxPages < 1 ||
      options.maxPages > 100 ||
      options.maxResults < 1 ||
      options.maxResults > 100 ||
      options.leaseMs < 1 ||
      options.leaseMs > 3600000
    )
      throw new ProviderError("INVALID_INPUT");
  }
  async tick() {
    const result = { calls: 0, newPosts: 0, errorCode: null as string | null };
    if (this.options.mode === "disabled" || this.stopped) return result;
    const rules = (await this.people.collectionRules()).sort(
      (a, b) =>
        intervals[a.priority] - intervals[b.priority] ||
        a.id.localeCompare(b.id),
    );
    for (const rule of rules) {
      if (this.stopped) break;
      const lease = await this.repository.claim(
        rule,
        "user_timeline",
        this.clock.now(),
        this.options.leaseMs,
      );
      if (!lease) continue;
      let failure: ProviderError | null = null;
      try {
        let next = lease.checkpoint.nextToken;
        for (let i = 0; i < this.options.maxPages; i++) {
          if (this.stopped) throw new ProviderError("NETWORK_DISABLED");
          // Recheck pause/deletion before every page. An already sent request cannot be recalled.
          if (
            !(await this.people.collectionRules()).some((r) => r.id === rule.id)
          )
            throw new ProviderError("ACCESS_DENIED");
          if (
            !rule.query.startsWith("user:") ||
            !idSchema(this.repository.origin).safeParse(rule.query.slice(5))
              .success
          )
            throw new ProviderError("INVALID_INPUT");
          const page = await this.provider.getUserPosts(rule.query.slice(5), {
            maxResults: this.options.maxResults,
            nextToken: next ?? undefined,
            sinceId: lease.checkpoint.sinceId ?? undefined,
            feature: "people",
          });
          result.calls++;
          const ingested = await this.repository.ingest(
            lease,
            page,
            "user_timeline",
            this.clock.now(),
            this.options.leaseMs,
          );
          result.newPosts += ingested.newPosts;
          next = page.nextToken;
          if (!next) break;
        }
      } catch (error) {
        failure =
          error instanceof ProviderError
            ? error
            : new ProviderError("NETWORK_ERROR");
        result.errorCode = failure.code;
      }
      await this.repository.finish(lease, {
        now: this.clock.now(),
        nextDueAt:
          this.clock.now() +
          Math.max(rule.intervalSeconds * 1000, failure?.retryAfterMs ?? 0),
        status: failure ? "failed" : "completed",
        errorCode: failure?.code,
        retryAfterMs: failure?.retryAfterMs,
      });
      // Stop this cycle on any failure: never consume lower-priority budget after a refusal.
      if (failure) break;
    }
    return result;
  }
}
