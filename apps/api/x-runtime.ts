/** Composition only: no HTTP listener, no background collection, no paid startup probe. */
import Redis from "ioredis";
import { SafeStreamTransport } from "../../packages/shared/stream-http";
import { XFilteredStream } from "../../packages/connectors/x/stream-client";
import pg from "pg";
import { DurableXControlStore } from "../../packages/db/x-control-store";
import { loadXConfig, type XConfig } from "../../packages/connectors/x/config";
import {
  XApiClient,
  collectionStatus,
} from "../../packages/connectors/x/client";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { RedisControlStore } from "../../packages/connectors/x/redis-control";
import { SafeHttpTransport } from "../../packages/shared/http";
import { ProviderError } from "../../packages/shared/errors";
import type { XProvider } from "../../packages/connectors/x/contracts";
export interface XRuntime {
  provider: XProvider | null;
  status: "demo" | "not_configured" | "ready";
  close(): Promise<void>;
}
export async function createXRuntime(config: XConfig): Promise<XRuntime> {
  if (config.mode === "demo")
    return {
      provider: new DemoXProvider(),
      status: "demo",
      close: async () => undefined,
    };
  if (!config.enabled || !config.token)
    return {
      provider: null,
      status: "not_configured",
      close: async () => undefined,
    };
  if (!config.pricing || !config.budget)
    throw new ProviderError("PRICING_UNKNOWN");
  if (!config.redisUrl || !config.databaseUrl)
    throw new ProviderError("STORE_UNAVAILABLE");
  let redis: Redis | undefined;
  let pool: pg.Pool | undefined;
  try {
    const url = new URL(config.redisUrl.reveal());
    if (!["redis:", "rediss:"].includes(url.protocol)) throw new Error();
    redis = new Redis(config.redisUrl.reveal(), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      connectTimeout: 5000,
    });
    redis.on("error", () => {
      /* Request methods return sanitised STORE_UNAVAILABLE; never log connection strings. */
    });
    await redis.connect();
    pool = new pg.Pool({
      connectionString: config.databaseUrl.reveal(),
      max: 8,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    pool.on("error", () => {});
    const schema = await pool.query(
      "SELECT 1 FROM memeradar.schema_migrations WHERE version='0006_x_collection_state'",
    );
    if (schema.rowCount !== 1) throw new Error();
  } catch {
    redis?.disconnect();
    await pool?.end();
    throw new ProviderError("STORE_UNAVAILABLE");
  }
  const store = new DurableXControlStore(
    pool!,
    new RedisControlStore(redis, config.namespace),
    config.namespace,
  );
  const transport = new SafeHttpTransport({
    mode: "live",
    allowedHosts: [new URL(config.baseUrl).hostname],
    timeoutMs: config.timeoutMs,
  });
  const provider = new XApiClient(config, transport, store);
  if (
    config.streaming.billingBoundVerified &&
    config.streaming.billableMaxPosts !== null &&
    config.declared.stream !== false
  )
    provider.stream = new XFilteredStream(
      config,
      config.streaming,
      new SafeStreamTransport({
        mode: "live",
        allowedHosts: [new URL(config.baseUrl).hostname],
        connectTimeoutMs: config.timeoutMs,
      }),
      store,
      transport,
    );
  return {
    provider,
    status: "ready",
    close: async () => {
      redis.disconnect();
      await pool!.end();
    },
  };
}
export async function diagnoseX(
  env: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const config = await loadXConfig(env);
  // Even diagnosis does not connect to Redis or X in live mode.
  if (config.mode === "live")
    return {
      origin: "REAL",
      status:
        !config.enabled || !config.token
          ? "Accès X non configuré"
          : "Configuration présente, connexion non testée",
      pricingConfigured: !!config.pricing,
      budgetConfigured: !!config.budget,
      sharedStoreConfigured: !!config.redisUrl,
      durableStoreConfigured: !!config.databaseUrl,
      networkCalls: 0,
    };
  const provider = new DemoXProvider();
  const capabilities = await provider.capabilities();
  const page = await provider.searchRecent("fict");
  return {
    origin: "DEMO",
    status: collectionStatus(capabilities, {
      origin: "DEMO",
      enabled: true,
      streamConnected: false,
      pollingActive: false,
      pollIntervalSeconds: 300,
    }),
    capabilities,
    fixturePosts: page.data.length,
    networkCalls: 0,
  };
}
