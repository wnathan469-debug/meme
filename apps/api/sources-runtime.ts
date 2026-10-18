import type { Pool } from "pg";
import {
  PgSourceRepository,
  recordDiagnostic,
} from "../../packages/db/source-repository";
import { SourcesService, type Probe } from "../../packages/sources/service";
import {
  defaultSettings,
  type SourceBinding,
} from "../../packages/sources/model";
import type { XConfig } from "../../packages/connectors/x/config";
import type { XProvider } from "../../packages/connectors/x/contracts";
import { SafeHttpTransport } from "../../packages/shared/http";
import { ObservedPublicTransport } from "../../packages/sources/transport";
import { PgMarketGate } from "../../packages/db/chart-repository";
import { DurableXControlStore } from "../../packages/db/x-control-store";
import { XApiClient } from "../../packages/connectors/x/client";
import { ProviderError } from "../../packages/shared/errors";

/** Trusted authenticated operator. No constructor probe, no secrets in returned snapshots. */
export function createSourcesRuntime(
  pool: Pool,
  ownerId: string,
  config: XConfig,
  provider: XProvider,
  coordination?: import("../../packages/connectors/x/control").ControlStore,
  options: {
    marketAllowed?: boolean;
    risksAllowed?: boolean;
    probeUsername?: string;
  } = {},
) {
  const origin = config.mode === "demo" ? "DEMO" : "REAL",
    x = defaultSettings();
  x.enabled = config.enabled;
  x.budget = config.budget ? structuredClone(config.budget) : x.budget;
  const bindings: SourceBinding[] = [
    {
      provider: "x",
      namespace: config.namespace,
      configured:
        origin === "DEMO" ||
        !!(config.token && config.pricing && config.budget && coordination),
      hostAllowed: origin === "DEMO" || config.enabled,
      pricing: config.pricing,
      settings: x,
      collectionMode: config.collection.mode,
      minimumIntervalSeconds: config.collection.defaultIntervalSeconds,
    },
    ...["gecko", "goplus"].map((p) => ({
      provider: p as "gecko" | "goplus",
      namespace: "default",
      configured: true,
      hostAllowed:
        p === "gecko" ? !!options.marketAllowed : !!options.risksAllowed,
      pricing: null,
      settings: defaultSettings(),
      collectionMode: "explicit_read_only",
      minimumIntervalSeconds: 3,
    })),
  ];
  const probes: Partial<Record<"x" | "gecko" | "goplus", Probe>> = {};
  if (origin === "DEMO")
    probes.x = {
      run: async () => {
        await provider.getUserByUsername("demo_analyste_julie");
      },
      capabilities: () => provider.capabilities(),
    };
  else if (
    coordination &&
    options.probeUsername &&
    /^[a-zA-Z0-9_]{1,15}$/.test(options.probeUsername)
  ) {
    const client = new XApiClient(
      { ...config, maxRetries: 0 },
      new SafeHttpTransport({
        mode: "live",
        allowedHosts: [new URL(config.baseUrl).hostname],
        timeoutMs: config.timeoutMs,
      }),
      new DurableXControlStore(pool, coordination, config.namespace),
    );
    probes.x = {
      run: async () => {
        const user = await client.getUserByUsername(options.probeUsername!);
        if (!user) throw new ProviderError("NOT_FOUND");
      },
      capabilities: () => provider.capabilities(),
    };
  } else
    probes.x = {
      ready: false,
      run: async () => {
        throw new ProviderError("NOT_CONFIGURED");
      },
      capabilities: () => provider.capabilities(),
    };
  for (const p of ["gecko", "goplus"] as const)
    if (origin === "REAL") {
      const host =
          p === "gecko" ? "api.geckoterminal.com" : "api.gopluslabs.io",
        path = p === "gecko" ? "/api/v2/networks" : "/api/v1/supported_chains",
        gate = new PgMarketGate(
          pool,
          origin,
          p === "gecko" ? "geckoterminal-v2" : "goplus-risk-v1",
        );
      const transport = new ObservedPublicTransport(
        new SafeHttpTransport({
          mode: "live",
          allowedHosts: [host],
          timeoutMs: 10000,
          maxBytes: 2000000,
          maxRedirects: 0,
        }),
        (d) => recordDiagnostic(pool, origin, p, "default", d),
        () => Date.now(),
        (body) => {
          if (!body || typeof body !== "object") return false;
          const value = body as Record<string, unknown>;
          return p === "gecko"
            ? Array.isArray(value.data)
            : value.code === 1 && Array.isArray(value.result);
        },
      );
      probes[p] = {
        run: async () => {
          await gate.reserve();
          const r = await transport.get(new URL("https://" + host + path), {});
          if (r.status !== 200)
            throw new ProviderError(
              r.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
            );
          const data = JSON.parse(r.body);
          if (
            p === "gecko"
              ? !Array.isArray(data.data)
              : data.code !== 1 || !Array.isArray(data.result)
          )
            throw new ProviderError("INVALID_RESPONSE");
        },
      };
    }
  return new SourcesService(
    new PgSourceRepository(pool, ownerId, origin),
    bindings,
    probes,
  );
}
