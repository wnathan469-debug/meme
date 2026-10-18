import { recordDiagnostic } from "../../packages/db/source-repository";
import { ObservedPublicTransport } from "../../packages/sources/transport";
import type { Pool } from "pg";
import type { Origin } from "../../packages/connectors/x/contracts";
import { PgRiskRepository } from "../../packages/db/risk-repository";
import { PgMarketGate } from "../../packages/db/chart-repository";
import { GoPlusRiskProvider } from "../../packages/risks/goplus";
import { type RiskIdentity, type RiskBatch } from "../../packages/risks/model";
import { SafeHttpTransport } from "../../packages/shared/http";
import { ProviderError } from "../../packages/shared/errors";
/** Trusted host only; caller authenticates owner. No HTTP listener or automatic requests. */
export function createRiskRuntime(
  pool: Pool,
  ownerId: string,
  origin: Origin,
  enabled = false,
) {
  const repo = new PgRiskRepository(pool, ownerId, origin);
  const provider =
    origin === "REAL" && enabled
      ? new GoPlusRiskProvider(
          new ObservedPublicTransport(
            new SafeHttpTransport({
              mode: "live",
              allowedHosts: ["api.gopluslabs.io"],
              timeoutMs: 10000,
              maxBytes: 2000000,
              maxRedirects: 0,
            }),
            (d) => recordDiagnostic(pool, origin, "goplus", "default", d),
          ),
          new PgMarketGate(pool, origin, "goplus-risk-v1"),
          true,
        )
      : null;
  return {
    read: (id: RiskIdentity, asOf = new Date().toISOString()) =>
      repo.read(id, asOf),
    // Ingest decoded, address-bound read-only evidence from a trusted operator, never a renderer payload.
    ingest: (batch: RiskBatch) => repo.store(batch),
    async refresh(id: RiskIdentity, confirmed = false) {
      if (!confirmed) throw new ProviderError("ACCESS_DENIED");
      if (id.origin !== origin) throw new ProviderError("INVALID_INPUT");
      if (!provider) throw new ProviderError("NOT_CONFIGURED");
      const cached = await repo.read(id, new Date().toISOString()),
        ttl = await repo.cacheSeconds();
      const dates = cached
        .flatMap((r) => r.evidence)
        .filter((o) => o.source === "GoPlus Token Security v1")
        .map((o) => Date.parse(o.fetchedAt));
      if (
        ttl > 0 &&
        dates.length &&
        Date.now() - Math.max(...dates) < ttl * 1000
      )
        return cached;
      const batch = await provider.read(id);
      await repo.store(batch);
      return repo.read(id, new Date().toISOString());
    },
  };
}
