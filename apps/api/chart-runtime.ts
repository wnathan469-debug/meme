import { recordDiagnostic } from "../../packages/db/source-repository";
import { ObservedPublicTransport } from "../../packages/sources/transport";
import type { Pool } from "pg";
import type { Origin } from "../../packages/connectors/x/contracts";
import {
  PgChartRepository,
  PgMarketGate,
} from "../../packages/db/chart-repository";
import { ChartService } from "../../packages/charts/service";
import { DemoMarketProvider } from "../../packages/charts/demo-data";
import { GeckoTerminalProvider } from "../../packages/connectors/market/gecko";
import { SafeHttpTransport } from "../../packages/shared/http";
/** Explicit trusted-host opt-in. Construction never sends a request or starts a timer. */
export function createChartRuntime(
  pool: Pool,
  ownerId: string,
  origin: Origin,
  enabled = false,
) {
  const repository = new PgChartRepository(pool, ownerId, origin);
  const provider =
    origin === "DEMO"
      ? new DemoMarketProvider()
      : enabled
        ? new GeckoTerminalProvider(
            new ObservedPublicTransport(
              new SafeHttpTransport({
                mode: "live",
                allowedHosts: ["api.geckoterminal.com"],
                maxRedirects: 0,
                timeoutMs: 10000,
                maxBytes: 2000000,
              }),
              (d) => recordDiagnostic(pool, origin, "gecko", "default", d),
            ),
            new PgMarketGate(pool, origin),
            true,
          )
        : null;
  return new ChartService(repository, provider);
}
