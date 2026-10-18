import type { CollectionRepository, CollectionRule, Lease } from "./contracts";
import type { XProvider } from "../connectors/x/contracts";
import { ProviderError } from "../shared/errors";
import { systemClock, type Clock } from "../shared/runtime";
export interface CollectorOptions {
  mode: "auto" | "stream" | "polling" | "disabled";
  maxPages: number;
  maxResults: number;
  leaseMs: number;
  defaultIntervalSeconds: number;
  highPriorityIntervalSeconds: number;
  maxReconnects: number;
  streamLockKey?: string;
}
const rank = { critical: 0, high: 1, normal: 2, low: 3 };
const hardStop = new Set([
  "BUDGET_EXCEEDED",
  "PRICING_UNKNOWN",
  "STORE_UNAVAILABLE",
  "NOT_CONFIGURED",
]);
export class XCollector {
  private stopped = false;
  private activeStream?: { stop(): void };
  readonly status = {
    mode: "disabled" as "disabled" | "polling" | "stream" | "demo",
    connected: false,
    lastCollectionAt: null as string | null,
    nextCollectionAt: null as string | null,
    newPosts: 0,
    errorCode: null as string | null,
  };
  constructor(
    private readonly provider: XProvider,
    private readonly repository: CollectionRepository,
    private readonly options: CollectorOptions,
    private readonly clock: Clock = systemClock,
  ) {
    if (
      provider.dataOrigin !== repository.origin ||
      !Number.isInteger(options.maxPages) ||
      options.maxPages < 1 ||
      options.maxPages > 100 ||
      !Number.isInteger(options.maxResults) ||
      options.maxResults < 1 ||
      options.leaseMs < 1000
    )
      throw new ProviderError("INVALID_INPUT");
  }
  stop() {
    this.stopped = true;
    this.activeStream?.stop();
    this.status.connected = false;
  }
  private interval(rule: CollectionRule) {
    return (
      Math.max(
        rule.intervalSeconds,
        rule.priority === "critical" || rule.priority === "high"
          ? this.options.highPriorityIntervalSeconds
          : this.options.defaultIntervalSeconds,
      ) * 1000
    );
  }
  async tick(
    force = false,
  ): Promise<{ calls: number; newPosts: number; skipped: number }> {
    const result = { calls: 0, newPosts: 0, skipped: 0 };
    if (this.options.mode === "disabled" || this.stopped) return result;
    this.status.mode = this.provider.dataOrigin === "DEMO" ? "demo" : "polling";
    this.status.connected = false;
    const capabilities = await this.provider.capabilities();
    if (capabilities.recent.state === "unavailable") {
      this.status.errorCode = "ACCESS_DENIED";
      return result;
    }
    const rules = (await this.repository.rules())
      .filter((r) => r.status === "active")
      .sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id),
      );
    const byQuery = new Map<string, CollectionRule[]>();
    for (const rule of rules) {
      const key = rule.query.trim();
      byQuery.set(key, [...(byQuery.get(key) ?? []), rule]);
    }
    for (const candidates of byQuery.values()) {
      if (this.stopped) break;
      // Acquire shortly before work, rather than letting unrelated queries exhaust leases.
      const groups = new Map<string, Lease[]>();
      for (const rule of candidates) {
        const lease = await this.repository.claim(
          rule,
          "search",
          this.clock.now(),
          this.options.leaseMs,
          force,
        );
        if (!lease) {
          result.skipped++;
          continue;
        }
        const key = JSON.stringify([
          lease.checkpoint.sinceId,
          lease.checkpoint.nextToken,
        ]);
        groups.set(key, [...(groups.get(key) ?? []), lease]);
      }
      for (const leases of groups.values()) {
        try {
          let nextToken = leases[0].checkpoint.nextToken;
          for (
            let pageIndex = 0;
            pageIndex < this.options.maxPages;
            pageIndex++
          ) {
            if (this.stopped) throw new ProviderError("NETWORK_DISABLED");
            const page = await this.provider.searchRecent(
              leases[0].rule.query,
              {
                maxResults: this.options.maxResults,
                sinceId: leases[0].checkpoint.sinceId ?? undefined,
                nextToken: nextToken ?? undefined,
                feature: "watch",
              },
            );
            result.calls++;
            for (const lease of leases) {
              const ingested = await this.repository.ingest(
                lease,
                page,
                "search",
                this.clock.now(),
                this.options.leaseMs,
              );
              result.newPosts += ingested.newPosts;
            }
            nextToken = page.nextToken;
            if (!nextToken) break;
          }
          for (const lease of leases) await this.close(lease, "completed");
          this.status.errorCode = null;
          this.status.lastCollectionAt = new Date(
            this.clock.now(),
          ).toISOString();
        } catch (error) {
          const failure =
            error instanceof ProviderError
              ? error
              : new ProviderError("NETWORK_ERROR");
          this.status.errorCode = failure.code;
          for (const lease of leases)
            try {
              await this.close(
                lease,
                "failed",
                failure.code,
                failure.retryAfterMs,
              );
            } catch {
              /* A stale lease cannot overwrite its successor. */
            }
          if (hardStop.has(failure.code) || failure.code === "ACCESS_DENIED") {
            for (const remaining of groups.values())
              if (remaining !== leases)
                for (const lease of remaining)
                  try {
                    await this.close(
                      lease,
                      "interrupted",
                      failure.code,
                      failure.retryAfterMs,
                    );
                  } catch {}
            this.status.newPosts = result.newPosts;
            return result;
          }
        }
      }
    }
    this.status.newPosts = result.newPosts;
    return result;
  }
  private async close(
    lease: Lease,
    status: "completed" | "failed" | "interrupted",
    errorCode?: string,
    retryAfterMs = 0,
  ) {
    const nextDueAt =
      this.clock.now() + Math.max(this.interval(lease.rule), retryAfterMs);
    await this.repository.finish(lease, {
      now: this.clock.now(),
      nextDueAt,
      status,
      errorCode,
      retryAfterMs,
    });
    this.status.nextCollectionAt = new Date(nextDueAt).toISOString();
  }
  async run(signal: AbortSignal): Promise<void> {
    this.stopped = false;
    if (this.options.mode === "disabled") return;
    let attempts = 0;
    while (!signal.aborted && !this.stopped) {
      const caps = await this.provider.capabilities();
      const useStream =
        this.options.mode === "stream" ||
        (this.options.mode === "auto" &&
          !!this.provider.stream &&
          caps.stream.state !== "unavailable");
      if (this.options.mode === "stream" && !this.provider.stream) {
        this.status.errorCode = "NOT_CONFIGURED";
        return;
      }
      if (useStream && this.provider.stream) {
        try {
          if (this.repository.withStreamLock) {
            const held = await this.repository.withStreamLock(
              this.options.streamLockKey ?? "default",
              () => this.streamWindow(signal),
            );
            if (!held) await this.wait(1000, signal);
          } else await this.streamWindow(signal);
          attempts = 0;
        } catch (error) {
          const failure =
            error instanceof ProviderError
              ? error
              : new ProviderError("NETWORK_ERROR");
          this.status.connected = false;
          this.status.errorCode = failure.code;
          if (signal.aborted || this.stopped || hardStop.has(failure.code))
            return;
          await this.tick(true);
          if (hardStop.has(this.status.errorCode ?? "")) return;
          if (
            this.options.mode === "stream" &&
            (failure.code === "ACCESS_DENIED" ||
              attempts >= this.options.maxReconnects)
          )
            return;
          if (
            this.options.mode === "auto" &&
            (failure.code === "ACCESS_DENIED" ||
              attempts >= this.options.maxReconnects)
          ) {
            await this.pollLoop(signal);
            return;
          }
          await this.wait(
            Math.max(
              failure.retryAfterMs,
              Math.min(30000, 500 * 2 ** attempts),
            ),
            signal,
          );
          attempts++;
        }
      } else {
        await this.pollLoop(signal);
        return;
      }
    }
  }
  private async pollLoop(signal: AbortSignal) {
    while (!signal.aborted && !this.stopped) {
      await this.tick();
      if (hardStop.has(this.status.errorCode ?? "")) return;
      await this.wait(1000, signal);
    }
  }
  private async wait(ms: number, signal: AbortSignal) {
    if (signal.aborted || this.stopped) return;
    await new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      signal.addEventListener("abort", done, { once: true });
      if (this.clock === systemClock) timer = setTimeout(done, ms);
      else void this.clock.sleep(ms).then(done);
      if (signal.aborted) done();
    });
  }
  private async streamWindow(signal: AbortSignal) {
    const stream = this.provider.stream!;
    const rules = (await this.repository.rules())
      .filter((r) => r.status === "active")
      .sort((a, b) => rank[a.priority] - rank[b.priority]);
    if (!rules.length) {
      await this.wait(1000, signal);
      return;
    }
    await stream.setRules(
      rules.map((rule) => ({ localId: rule.id, query: rule.query })),
    );
    const leases: Lease[] = [];
    for (const rule of rules) {
      const lease = await this.repository.claim(
        rule,
        "stream",
        this.clock.now(),
        this.options.leaseMs,
        true,
      );
      if (lease) leases.push(lease);
    }
    if (!leases.length) {
      await this.wait(1000, signal);
      return;
    }
    let handle: ReturnType<typeof stream.connect> | undefined;
    try {
      if (signal.aborted || this.stopped) {
        for (const lease of leases)
          await this.close(lease, "interrupted", "NETWORK_DISABLED");
        return;
      }
      handle = stream.connect(
        async (page, matchedIds) => {
          const matched = new Set(matchedIds);
          for (const lease of leases)
            if (matched.has(lease.rule.id)) {
              const result = await this.repository.ingest(
                lease,
                page,
                "stream",
                this.clock.now(),
                this.options.leaseMs,
              );
              this.status.newPosts += result.newPosts;
            }
          this.status.lastCollectionAt = new Date(
            this.clock.now(),
          ).toISOString();
        },
        {
          signal,
          onConnected: () => {
            this.status.mode =
              this.provider.dataOrigin === "DEMO" ? "demo" : "stream";
            this.status.connected = this.provider.dataOrigin === "REAL";
          },
        },
      );
      this.activeStream = handle;
      const outcome = await handle.done;
      if (outcome.reason === "disconnected")
        throw new ProviderError("NETWORK_ERROR", true);
      for (const lease of leases) await this.close(lease, "completed");
    } catch (error) {
      for (const lease of leases)
        try {
          await this.close(
            lease,
            "interrupted",
            error instanceof ProviderError ? error.code : "NETWORK_ERROR",
          );
        } catch {}
      throw error;
    } finally {
      handle?.stop();
      this.activeStream = undefined;
      this.status.connected = false;
    }
  }
}
