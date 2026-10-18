import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { Secret } from "../../shared/runtime";
import { ProviderError } from "../../shared/errors";
import type { BudgetPolicy, Pricing } from "./control";
import { endpointNames, type Endpoint } from "./contracts";
const micros = z.string().regex(/^(0|[1-9][0-9]{0,39})$/);
export const pricingSchema = z.object({
  currency: z.literal("USD"),
  request: micros,
  post: micros,
  user: micros,
  verifiedAt: z.string().datetime(),
});
const budgetSchema = z.object({
  daily: micros,
  monthly: micros,
  warningPercent: z.number().int().min(1).max(100),
  features: z.object({
    watch: z.object({ daily: micros, monthly: micros }).optional(),
    people: z.object({ daily: micros, monthly: micros }).optional(),
    conversations: z.object({ daily: micros, monthly: micros }).optional(),
  }),
});
const endpointsSchema = z.object(
  Object.fromEntries(
    endpointNames
      .filter((e) => e !== "stream")
      .map((key) => [
        key,
        z
          .string()
          .regex(/^\/[a-z0-9_/{}-]+$/)
          .refine((s) => !s.includes("..")),
      ]),
  ) as Record<Exclude<Endpoint, "stream">, z.ZodString>,
);
export const defaultEndpoints: Record<Exclude<Endpoint, "stream">, string> = {
  recent: "/tweets/search/recent",
  archive: "/tweets/search/all",
  posts: "/tweets",
  username: "/users/by/username/{username}",
  users: "/users",
  timeline: "/users/{id}/tweets",
  conversation: "/tweets/search/recent",
  quotes: "/tweets/{id}/quote_tweets",
};
export interface XConfig {
  mode: "demo" | "live";
  enabled: boolean;
  token: Secret | null;
  baseUrl: string;
  namespace: string;
  redisUrl: Secret | null;
  endpoints: typeof defaultEndpoints;
  postFieldsParameter: "tweet.fields" | "post.fields";
  pricing: Pricing | null;
  budget: BudgetPolicy | null;
  declared: Partial<Record<Endpoint, boolean>>;
  recentWindowSeconds: number | null;
  maxResults: number;
  maxLookupIds: number;
  queryMaxLength: number;
  allowedOperators: string[];
  localIntervalMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxWaitMs: number;
  timeoutMs: number;
  circuitFailures: number;
  circuitCooldownMs: number;
}
function numeric(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new ProviderError("INVALID_INPUT");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new ProviderError("INVALID_INPUT");
  return value;
}
async function jsonFile(filename: string): Promise<unknown> {
  try {
    if ((await stat(filename)).size > 65536) throw new Error();
    const text = await readFile(filename, "utf8");
    if (Buffer.byteLength(text) > 65536) throw new Error();
    return JSON.parse(text);
  } catch {
    throw new ProviderError("INVALID_INPUT");
  }
}
export async function loadXConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<XConfig> {
  const mode = env.APP_MODE ?? "demo";
  if (!["demo", "live"].includes(mode))
    throw new ProviderError("INVALID_INPUT");
  const bool = (key: string, defaultValue = false) => {
    if (env[key] === undefined || env[key] === "") return defaultValue;
    if (env[key] !== "true" && env[key] !== "false")
      throw new ProviderError("INVALID_INPUT");
    return env[key] === "true";
  };
  const baseUrl = env.X_API_BASE_URL ?? "https://api.x.com/2";
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ProviderError("INVALID_INPUT");
  }
  if (
    !["https://api.x.com", "https://api.twitter.com"].includes(parsed.origin) ||
    parsed.pathname !== "/2" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  )
    throw new ProviderError("INVALID_INPUT");
  const namespace = env.X_CONTROL_NAMESPACE ?? "default";
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace))
    throw new ProviderError("INVALID_INPUT");
  let pricing: Pricing | null = null,
    budget: BudgetPolicy | null = null;
  if (env.X_PRICING_CONFIG_PATH) {
    const result = pricingSchema.safeParse(
      await jsonFile(env.X_PRICING_CONFIG_PATH),
    );
    if (!result.success) throw new ProviderError("PRICING_UNKNOWN");
    pricing = result.data;
  }
  if (env.X_BUDGET_DAILY_MICRO_USD && env.X_BUDGET_MONTHLY_MICRO_USD) {
    const features = env.X_FEATURE_BUDGETS_PATH
      ? await jsonFile(env.X_FEATURE_BUDGETS_PATH)
      : {};
    const result = budgetSchema.safeParse({
      daily: env.X_BUDGET_DAILY_MICRO_USD,
      monthly: env.X_BUDGET_MONTHLY_MICRO_USD,
      warningPercent: numeric(env, "X_BUDGET_WARNING_PERCENT", 80, 1, 100),
      features,
    });
    if (!result.success) throw new ProviderError("INVALID_INPUT");
    budget = result.data;
  }
  let endpoints = { ...defaultEndpoints };
  if (env.X_ENDPOINTS_CONFIG_PATH) {
    const result = endpointsSchema.safeParse(
      await jsonFile(env.X_ENDPOINTS_CONFIG_PATH),
    );
    if (!result.success) throw new ProviderError("INVALID_INPUT");
    endpoints = result.data;
  }
  const declared: Partial<Record<Endpoint, boolean>> = {};
  for (const key of endpointNames) {
    const name = `X_CAPABILITY_${key.toUpperCase()}`;
    if (env[name] !== undefined && env[name] !== "") declared[key] = bool(name);
  }
  const token = env.X_API_BEARER_TOKEN
    ? new Secret(env.X_API_BEARER_TOKEN)
    : null;
  const redisUrl = env.REDIS_URL ? new Secret(env.REDIS_URL) : null;
  const allowedOperators = (env.X_ALLOWED_OPERATORS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedOperators.some((s) => !/^[-a-z_]{1,50}$/.test(s)))
    throw new ProviderError("INVALID_INPUT");
  const postFieldsParameter = env.X_POST_FIELDS_PARAMETER ?? "tweet.fields";
  if (
    postFieldsParameter !== "tweet.fields" &&
    postFieldsParameter !== "post.fields"
  )
    throw new ProviderError("INVALID_INPUT");
  return {
    postFieldsParameter,
    mode: mode as "demo" | "live",
    enabled: bool("X_API_ENABLED"),
    token,
    redisUrl,
    baseUrl,
    namespace,
    endpoints,
    pricing,
    budget,
    declared,
    allowedOperators,
    recentWindowSeconds: env.X_RECENT_WINDOW_SECONDS
      ? numeric(env, "X_RECENT_WINDOW_SECONDS", 0, 1, 315360000)
      : null,
    maxResults: numeric(env, "X_MAX_RESULTS_PER_REQUEST", 100, 1, 1000),
    maxLookupIds: numeric(env, "X_MAX_LOOKUP_IDS", 100, 1, 1000),
    queryMaxLength: numeric(env, "X_QUERY_MAX_LENGTH", 512, 1, 10000),
    localIntervalMs: numeric(env, "X_LOCAL_MIN_INTERVAL_MS", 1000, 1, 600000),
    maxRetries: numeric(env, "X_MAX_RETRIES", 2, 0, 5),
    baseDelayMs: numeric(env, "X_RETRY_BASE_MS", 500, 1, 60000),
    maxWaitMs: numeric(env, "X_RETRY_MAX_WAIT_MS", 30000, 0, 60000),
    timeoutMs: numeric(env, "X_TIMEOUT_MS", 10000, 1, 60000),
    circuitFailures: numeric(env, "X_CIRCUIT_FAILURES", 3, 1, 20),
    circuitCooldownMs: numeric(env, "X_CIRCUIT_COOLDOWN_MS", 60000, 1, 3600000),
  };
}
