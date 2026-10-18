import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ProviderError } from "../../shared/errors";
import type { JsonTransport, HttpReply } from "../../shared/http";
import { systemClock, type Clock, type AuditSink } from "../../shared/runtime";
import { withRetry } from "../../shared/retry";
import type { XConfig } from "./config";
import {
  BudgetGuard,
  quotaFromHeaders,
  retryAfter,
  type ControlStore,
  type Feature,
} from "./control";
import {
  endpointNames,
  providerSchemas,
  idSchema,
  normalizePost,
  normalizeUser,
  type Endpoint,
  type XProvider,
  type XCapabilities,
  type PageOptions,
  type XUser,
  type XPost,
  type XPage,
} from "./contracts";

export function validateQuery(
  query: string,
  config: Pick<XConfig, "queryMaxLength" | "allowedOperators">,
): void {
  if (
    !query.trim() ||
    query.length > config.queryMaxLength ||
    /[\u0000-\u001f\u007f]/.test(query)
  )
    throw new ProviderError("INVALID_INPUT");
  let quoted = false,
    escaped = false,
    visible = "";
  for (const char of query) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      visible += " ";
      continue;
    }
    if (!quoted) visible += char;
  }
  if (quoted || escaped) throw new ProviderError("INVALID_INPUT");
  for (const match of visible.matchAll(/(?:^|[\s(])-?([a-zA-Z_]+):/g))
    if (!config.allowedOperators.includes(match[1].toLowerCase()))
      throw new ProviderError("INVALID_INPUT");
}
export class XApiClient implements XProvider {
  readonly dataOrigin = "REAL" as const;
  stream?: import("./stream-contracts").XStreamProvider;
  private readonly clock: Clock;
  private readonly audit: AuditSink;
  private readonly schemas = providerSchemas("REAL");
  private readonly budget: BudgetGuard;
  private readonly userCache = new Map<
    string,
    { user: XUser; until: number }
  >();
  constructor(
    private readonly config: XConfig,
    private readonly transport: JsonTransport,
    private readonly store: ControlStore,
    options: { clock?: Clock; audit?: AuditSink; random?: () => number } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.audit = options.audit ?? (() => undefined);
    this.random = options.random ?? Math.random;
    this.budget = new BudgetGuard(
      store,
      this.clock,
      config.budget,
      config.pricing,
    );
  }
  private readonly random: () => number;
  private configured(): void {
    if (this.config.mode === "demo")
      throw new ProviderError("NETWORK_DISABLED");
    if (!this.config.enabled || !this.config.token)
      throw new ProviderError("NOT_CONFIGURED");
  }
  async capabilities(): Promise<XCapabilities> {
    const result = {} as XCapabilities;
    for (const endpoint of [...endpointNames, "metrics"] as const) {
      const unavailable =
        this.config.mode !== "live" ||
        !this.config.enabled ||
        !this.config.token ||
        (endpoint !== "metrics" && this.config.declared[endpoint] === false);
      result[endpoint] = unavailable
        ? {
            state: "unavailable",
            reason: "configured",
            observedAt: new Date(this.clock.now()).toISOString(),
            windowSeconds:
              endpoint === "conversation" || endpoint === "recent"
                ? this.config.recentWindowSeconds
                : null,
          }
        : ((await this.store.capability(endpoint)) ?? {
            state: "untested",
            reason: "configured",
            observedAt: new Date(this.clock.now()).toISOString(),
            windowSeconds:
              endpoint === "conversation" || endpoint === "recent"
                ? this.config.recentWindowSeconds
                : null,
          });
    }
    return result;
  }
  private async allowed(endpoint: Endpoint): Promise<void> {
    this.configured();
    if (
      this.config.declared[endpoint] === false ||
      (await this.store.capability(endpoint))?.state === "unavailable"
    )
      throw new ProviderError("ACCESS_DENIED");
  }
  private async observe(endpoint: Endpoint, denied = false): Promise<void> {
    await this.store.setCapability(endpoint, {
      state: denied
        ? "unavailable"
        : endpoint === "conversation"
          ? "limited"
          : "available",
      reason: denied ? "denied" : "response",
      observedAt: new Date(this.clock.now()).toISOString(),
      windowSeconds:
        endpoint === "conversation" || endpoint === "recent"
          ? this.config.recentWindowSeconds
          : null,
    });
    this.audit({
      event: "capability",
      endpoint,
      code: denied ? "ACCESS_DENIED" : "AVAILABLE",
    });
  }
  private postUrl(
    endpoint: Exclude<Endpoint, "stream">,
    pathParameters: Record<string, string> = {},
    params: Record<string, string> = {},
  ): URL {
    let path = this.config.endpoints[endpoint];
    for (const [key, value] of Object.entries(pathParameters))
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    if (/[{}]/.test(path)) throw new ProviderError("INVALID_INPUT");
    const url = new URL(this.config.baseUrl + path);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return url;
  }
  private fields(minimalUsers = false): Record<string, string> {
    return {
      [this.config.postFieldsParameter]:
        "id,text,author_id,created_at,conversation_id,referenced_tweets,public_metrics,entities,lang",
      expansions: "author_id",
      "user.fields": minimalUsers
        ? "id,name,username"
        : "id,name,username,protected,public_metrics,verified_type",
    };
  }
  private pageParameters(options: PageOptions = {}): {
    params: Record<string, string>;
    size: number;
  } {
    const size = options.maxResults ?? this.config.maxResults;
    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > this.config.maxResults
    )
      throw new ProviderError("INVALID_INPUT");
    const params: Record<string, string> = { max_results: String(size) };
    if (options.nextToken) {
      if (options.nextToken.length > 4096 || /[\r\n\0]/.test(options.nextToken))
        throw new ProviderError("INVALID_INPUT");
      params.next_token = options.nextToken;
    }
    if (options.sinceId) {
      if (!idSchema("REAL").safeParse(options.sinceId).success)
        throw new ProviderError("INVALID_INPUT");
      params.since_id = options.sinceId;
    }
    return { params, size };
  }
  private ids(ids: string[]): void {
    if (
      ids.length < 1 ||
      ids.length > this.config.maxLookupIds ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !idSchema("REAL").safeParse(id).success)
    )
      throw new ProviderError("INVALID_INPUT");
  }
  private async execute<S extends z.ZodType>(
    endpoint: Exclude<Endpoint, "stream">,
    url: URL,
    schema: S,
    maxPosts: number,
    maxUsers: number,
    feature: Feature,
    kind: "posts" | "users" | "user",
  ): Promise<{
    value: z.infer<S>;
    quota: ReturnType<typeof quotaFromHeaders> | null;
    at: string;
  }> {
    await this.allowed(endpoint);
    return withRetry(
      async (attempt) => {
        await this.allowed(endpoint);
        const controlKey =
          endpointNames.find(
            (name) =>
              name !== "stream" &&
              this.config.endpoints[name] === this.config.endpoints[endpoint],
          ) ?? endpoint;
        await this.store.takeRate(
          controlKey,
          this.clock.now(),
          this.config.localIntervalMs,
        );
        const circuit = {
          threshold: this.config.circuitFailures,
          cooldownMs: this.config.circuitCooldownMs,
        };
        await this.store.enterCircuit(controlKey, this.clock.now(), circuit);
        const requestId = randomUUID();
        let reservation: { amount: string; warning: boolean };
        try {
          reservation = await this.budget.reserve(
            requestId,
            feature,
            maxPosts,
            maxUsers,
            endpoint,
          );
        } catch (error) {
          await this.store.finishCircuit(
            controlKey,
            this.clock.now(),
            "cancel",
            circuit,
          );
          throw error;
        }
        if (reservation.warning)
          this.audit({ event: "budget_warning", endpoint, requestId });
        let amount = reservation.amount,
          sent = false,
          reply: HttpReply | undefined,
          posts: number | null = null,
          users: number | null = null,
          result: z.infer<S> | undefined;
        let error: ProviderError | undefined;
        try {
          reply = await this.transport.get(url, {
            authorization: `Bearer ${this.config.token!.reveal()}`,
          });
          sent = true;
          const quota = quotaFromHeaders(reply.headers, this.clock.now());
          if (
            quota.limit !== null ||
            quota.remaining !== null ||
            quota.resetAt !== null
          )
            await this.store.updateQuota(controlKey, quota);
          if (reply.status === 401 || reply.status === 403) {
            await this.observe(endpoint, true);
            throw new ProviderError(
              "ACCESS_DENIED",
              false,
              0,
              true,
              reply.status,
            );
          }
          if (reply.status === 429) {
            const wait = retryAfter(reply.headers, this.clock.now()) || 60_000;
            await this.store.deferRate(controlKey, this.clock.now() + wait);
            throw new ProviderError("RATE_LIMITED", true, wait, true, 429);
          }
          if (reply.status >= 500)
            throw new ProviderError(
              "PROVIDER_UNAVAILABLE",
              true,
              0,
              true,
              reply.status,
            );
          if (reply.status === 404)
            throw new ProviderError("NOT_FOUND", false, 0, true, 404);
          if (reply.status < 200 || reply.status >= 300)
            throw new ProviderError(
              "INVALID_INPUT",
              false,
              0,
              true,
              reply.status,
            );
          let json: unknown;
          try {
            json = JSON.parse(reply.body);
          } catch {
            throw new ProviderError("INVALID_RESPONSE", false, 0, true);
          }
          const decoded = schema.safeParse(json);
          if (!decoded.success)
            throw new ProviderError("INVALID_RESPONSE", false, 0, true);
          result = decoded.data;
          const envelope = result as {
            data?: unknown[] | unknown;
            includes?: { users?: unknown[] };
          };
          posts =
            kind === "posts"
              ? Array.isArray(envelope.data)
                ? envelope.data.length
                : 0
              : 0;
          users =
            kind === "users"
              ? Array.isArray(envelope.data)
                ? envelope.data.length
                : 0
              : kind === "user"
                ? envelope.data
                  ? 1
                  : 0
                : (envelope.includes?.users?.length ?? 0);
          if (posts > maxPosts || users > maxUsers)
            throw new ProviderError("INVALID_RESPONSE", false, 0, true);
          amount = this.budget.cost(posts, users);
          await this.observe(endpoint);
        } catch (caught) {
          error =
            caught instanceof ProviderError
              ? caught
              : new ProviderError("NETWORK_ERROR", true, 0, true);
          sent ||= error.sent;
          if (!sent) amount = "0";
        }
        // Durable reservations preserve accounting even if settlement or usage logging fails.
        await this.budget.settle(requestId, amount);
        await this.store.appendUsage({
          requestId,
          endpoint,
          feature,
          status: reply?.status ?? null,
          posts,
          users,
          costMicros: amount,
          ...(error ? { errorCode: error.code } : {}),
          ...(reply
            ? { quota: quotaFromHeaders(reply.headers, this.clock.now()) }
            : {}),
          estimated: true,
          at: new Date(this.clock.now()).toISOString(),
        });
        const fault =
          error &&
          ["NETWORK_ERROR", "TIMEOUT", "PROVIDER_UNAVAILABLE"].includes(
            error.code,
          );
        await this.store.finishCircuit(
          controlKey,
          this.clock.now(),
          fault ? "failure" : sent ? "success" : "cancel",
          circuit,
        );
        this.audit({
          event: "request",
          endpoint,
          requestId,
          status: reply?.status,
          attempt,
          code: error?.code,
        });
        if (error) throw error;
        return {
          value: result!,
          quota: await this.store.quota(controlKey),
          at: new Date(this.clock.now()).toISOString(),
        };
      },
      {
        maxRetries: this.config.maxRetries,
        baseDelayMs: this.config.baseDelayMs,
        maxWaitMs: this.config.maxWaitMs,
      },
      this.clock,
      this.random,
      this.audit,
      endpoint,
    );
  }
  private remember(users: XUser[]): void {
    for (const user of users) {
      if (this.userCache.size >= 5000)
        this.userCache.delete(this.userCache.keys().next().value!);
      this.userCache.set(user.id, { user, until: this.clock.now() + 300000 });
    }
  }
  private async postsPage(
    endpoint:
      "recent" | "archive" | "conversation" | "quotes" | "timeline" | "posts",
    url: URL,
    size: number,
    feature: Feature,
  ): Promise<XPage<XPost>> {
    const { value, quota, at } = await this.execute(
      endpoint,
      url,
      this.schemas.postPage,
      size,
      size,
      feature,
      "posts",
    );
    const minimalUsers =
      endpoint === "conversation" ||
      endpoint === "quotes" ||
      feature === "conversations";
    const users = (value.includes?.users ?? []).map((user) =>
      normalizeUser(
        minimalUsers
          ? { id: user.id, username: user.username, name: user.name }
          : user,
        "REAL",
        at,
      ),
    );
    if (!minimalUsers) this.remember(users);
    const data = (value.data ?? []).map((post) =>
      normalizePost(post, "REAL", at),
    );
    if (data.length) {
      const metrics = data.flatMap((post) => Object.values(post.metrics));
      await this.store.setCapability("metrics", {
        state: metrics.every((value) => value !== null)
          ? "available"
          : metrics.every((value) => value === null)
            ? "unavailable"
            : "limited",
        reason: "response",
        observedAt: at,
        windowSeconds: null,
      });
    }
    return {
      data,
      users,
      nextToken: value.meta?.next_token ?? null,
      quota,
      problems: (value.errors ?? []).map((error) => ({
        resourceId: error.resource_id ?? null,
        code: "PROVIDER_ITEM_ERROR",
      })),
      partial:
        !!value.errors?.length ||
        data.some(
          (post) =>
            post.authorId !== null &&
            !users.some((user) => user.id === post.authorId),
        ),
      collectedAt: at,
      dataOrigin: "REAL",
    };
  }
  private async search(
    endpoint: "recent" | "archive" | "conversation",
    query: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    validateQuery(query, this.config);
    const { params, size } = this.pageParameters(options);
    return this.postsPage(
      endpoint,
      this.postUrl(
        endpoint,
        {},
        { ...this.fields(endpoint === "conversation"), ...params, query },
      ),
      size,
      options.feature ??
        (endpoint === "conversation" ? "conversations" : "watch"),
    );
  }
  async searchRecent(
    query: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.search("recent", query, options);
  }
  async searchFullArchive(
    query: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    return this.search("archive", query, options);
  }
  async getConversation(
    conversationId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    this.ids([conversationId]);
    return this.search(
      "conversation",
      `conversation_id:${conversationId}`,
      options,
    );
  }
  async getPostsByIds(
    ids: string[],
    options: Pick<PageOptions, "feature"> = {},
  ): Promise<XPage<XPost>> {
    this.ids(ids);
    return this.postsPage(
      "posts",
      this.postUrl(
        "posts",
        {},
        {
          ...this.fields(options.feature === "conversations"),
          ids: ids.join(","),
        },
      ),
      ids.length,
      options.feature ?? "watch",
    );
  }
  async getQuotePosts(
    postId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    this.ids([postId]);
    if (options.sinceId) throw new ProviderError("INVALID_INPUT");
    const { params, size } = this.pageParameters(options);
    if (params.next_token) {
      params.pagination_token = params.next_token;
      delete params.next_token;
    }
    return this.postsPage(
      "quotes",
      this.postUrl(
        "quotes",
        { id: postId },
        { ...this.fields(true), ...params },
      ),
      size,
      options.feature ?? "conversations",
    );
  }
  async getUserByUsername(username: string): Promise<XUser | null> {
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(username))
      throw new ProviderError("INVALID_INPUT");
    try {
      const { value, at } = await this.execute(
        "username",
        this.postUrl(
          "username",
          { username },
          {
            "user.fields":
              "id,name,username,protected,public_metrics,verified_type",
          },
        ),
        this.schemas.singleUser,
        0,
        1,
        "people",
        "user",
      );
      if (!value.data) return null;
      const user = normalizeUser(value.data, "REAL", at);
      this.remember([user]);
      return user;
    } catch (error) {
      if (error instanceof ProviderError && error.code === "NOT_FOUND")
        return null;
      throw error;
    }
  }
  async getUsersByIds(ids: string[]): Promise<XUser[]> {
    this.ids(ids);
    const { value, at } = await this.execute(
      "users",
      this.postUrl(
        "users",
        {},
        {
          ids: ids.join(","),
          "user.fields":
            "id,name,username,protected,public_metrics,verified_type",
        },
      ),
      this.schemas.users,
      0,
      ids.length,
      "people",
      "users",
    );
    const users = (value.data ?? []).map((user) =>
      normalizeUser(user, "REAL", at),
    );
    this.remember(users);
    return users;
  }
  async getUserPosts(
    userId: string,
    options: PageOptions = {},
  ): Promise<XPage<XPost>> {
    this.ids([userId]);
    this.pageParameters(options);
    await this.allowed("timeline");
    let user = this.userCache.get(userId);
    const ttl = (await this.store.cacheSeconds?.("profiles", 300)) ?? 300;
    if (
      !user ||
      user.until <= this.clock.now() ||
      this.clock.now() - Date.parse(user.user.observedAt) >= ttl * 1000
    ) {
      await this.getUsersByIds([userId]);
      user = this.userCache.get(userId);
    }
    if (!user) throw new ProviderError("NOT_FOUND");
    if (user.user.protected === true)
      throw new ProviderError("PROTECTED_ACCOUNT");
    if (user.user.protected !== false) throw new ProviderError("ACCESS_DENIED");
    const { params, size } = this.pageParameters(options);
    if (params.next_token) {
      params.pagination_token = params.next_token;
      delete params.next_token;
    }
    return this.postsPage(
      "timeline",
      this.postUrl("timeline", { id: userId }, { ...this.fields(), ...params }),
      size,
      options.feature ?? "people",
    );
  }
}
export function collectionStatus(
  capabilities: XCapabilities,
  options: {
    origin: "DEMO" | "REAL";
    enabled: boolean;
    streamConnected: boolean;
    pollingActive: boolean;
    pollIntervalSeconds: number;
  },
): { mode: "demo" | "stream" | "polling" | "disabled"; label: string } {
  if (options.origin === "DEMO")
    return { mode: "demo", label: "Simulation — rejeu local" };
  if (!options.enabled) return { mode: "disabled", label: "Non connecté" };
  if (options.streamConnected && capabilities.stream.state === "available")
    return { mode: "stream", label: "Temps réel (flux filtré)" };
  if (options.pollingActive && capabilities.recent.state === "available")
    return {
      mode: "polling",
      label: `Mise à jour toutes les ${options.pollIntervalSeconds} secondes`,
    };
  return { mode: "disabled", label: "Non connecté" };
}
