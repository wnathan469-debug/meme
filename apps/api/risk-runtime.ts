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
          new SafeHttpTransport({
            mode: "live",
            allowedHosts: ["api.gopluslabs.io"],
            timeoutMs: 10000,
            maxBytes: 2000000,
            maxRedirects: 0,
          }),
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
      await repo.read(id, new Date().toISOString());
      const batch = await provider.read(id);
      await repo.store(batch);
      return repo.read(id, new Date().toISOString());
    },
  };
}
