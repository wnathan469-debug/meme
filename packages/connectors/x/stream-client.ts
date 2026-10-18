import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { XConfig } from "./config";
import type { ControlStore } from "./control";
import { BudgetGuard, quotaFromHeaders, retryAfter } from "./control";
import { ProviderError } from "../../shared/errors";
import { systemClock, type Clock } from "../../shared/runtime";
import type { HttpReply } from "../../shared/http";
import { ndjson, type StreamTransport } from "../../shared/stream-http";
import { providerSchemas, normalizePost, normalizeUser } from "./contracts";
import type {
  XStreamProvider,
  XStreamRule,
  RuleSyncResult,
  StreamHandle,
  StreamOutcome,
} from "./stream-contracts";
import { withRetry } from "../../shared/retry";
import { validateQuery } from "./client";
export interface StreamSettings {
  path: string;
  rulesPath: string;
  maxRules: number;
  windowMs: number;
  idleMs: number;
  maxPosts: number;
  billableMaxPosts: number | null;
  billingBoundVerified: boolean;
  tagPrefix: string;
}
export interface RuleTransport {
  send(
    url: URL,
    headers: Record<string, string>,
    method: "GET" | "POST",
    body?: string,
  ): Promise<HttpReply>;
}
export class XFilteredStream implements XStreamProvider {
  private synced: RuleSyncResult = { rules: [] };
  private active = false;
  private readonly budget: BudgetGuard;
  constructor(
    private readonly config: XConfig,
    private readonly settings: StreamSettings,
    private readonly transport: StreamTransport,
    private readonly control: ControlStore,
    private readonly rulesTransport: RuleTransport,
    private readonly clock: Clock = systemClock,
  ) {
    if (
      settings.maxPosts < 1 ||
      settings.windowMs < 1 ||
      settings.idleMs < 1 ||
      (settings.billableMaxPosts !== null &&
        settings.maxPosts > settings.billableMaxPosts)
    )
      throw new ProviderError("INVALID_INPUT");
    this.budget = new BudgetGuard(
      control,
      clock,
      config.budget,
      config.pricing,
    );
  }
  private async allowed() {
    if (this.config.mode === "demo")
      throw new ProviderError("NETWORK_DISABLED");
    if (!this.config.enabled || !this.config.token)
      throw new ProviderError("NOT_CONFIGURED");
    if (
      !this.settings.billingBoundVerified ||
      this.settings.billableMaxPosts === null
    )
      throw new ProviderError("PRICING_UNKNOWN");
    if (
      this.config.declared.stream === false ||
      (await this.control.capability("stream"))?.state === "unavailable"
    )
      throw new ProviderError("ACCESS_DENIED");
  }
  private async reserve(maxPosts: number, rateKey = "stream") {
    await this.allowed();
    await this.control.takeRate(
      rateKey,
      this.clock.now(),
      this.config.localIntervalMs,
    );
    const policy = {
      threshold: this.config.circuitFailures,
      cooldownMs: this.config.circuitCooldownMs,
    };
    await this.control.enterCircuit("stream", this.clock.now(), policy);
    const id = randomUUID();
    try {
      const result = await this.budget.reserve(
        id,
        "watch",
        maxPosts,
        maxPosts,
        "stream",
      );
      return { id, ...result };
    } catch (error) {
      await this.control.finishCircuit(
        "stream",
        this.clock.now(),
        "cancel",
        policy,
      );
      throw error;
    }
  }
  private async status(
    status: number,
    headers: Record<string, string>,
    rateKey = "stream",
  ) {
    const quota = quotaFromHeaders(headers, this.clock.now());
    await this.control.updateQuota(rateKey, quota);
    if (status === 401 || status === 403) {
      await this.control.setCapability("stream", {
        state: "unavailable",
        reason: "denied",
        observedAt: new Date(this.clock.now()).toISOString(),
        windowSeconds: null,
      });
      throw new ProviderError("ACCESS_DENIED", false, 0, true, status);
    }
    if (status === 429) {
      const wait = retryAfter(headers, this.clock.now()) || 60000;
      await this.control.deferRate(rateKey, this.clock.now() + wait);
      throw new ProviderError("RATE_LIMITED", true, wait, true, status);
    }
    if (status >= 500)
      throw new ProviderError("PROVIDER_UNAVAILABLE", true, 0, true, status);
    if (status < 200 || status >= 300)
      throw new ProviderError("INVALID_RESPONSE", false, 0, true, status);
  }
  private async record(
    id: string,
    cost: string,
    status: number | null,
    posts: number | null,
    users: number | null,
    error?: ProviderError,
  ) {
    await this.budget.settle(id, cost);
    await this.control.appendUsage({
      requestId: id,
      endpoint: "stream",
      feature: "watch",
      status,
      posts,
      users,
      costMicros: cost,
      estimated: true,
      at: new Date(this.clock.now()).toISOString(),
    });
    await this.control.finishCircuit(
      "stream",
      this.clock.now(),
      error &&
        ["TIMEOUT", "NETWORK_ERROR", "PROVIDER_UNAVAILABLE"].includes(
          error.code,
        )
        ? "failure"
        : "success",
      {
        threshold: this.config.circuitFailures,
        cooldownMs: this.config.circuitCooldownMs,
      },
    );
  }
  private async ruleRequest(
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    return withRetry(
      () => this.ruleAttempt(method, body),
      {
        maxRetries: this.config.maxRetries,
        baseDelayMs: this.config.baseDelayMs,
        maxWaitMs: this.config.maxWaitMs,
      },
      this.clock,
      Math.random,
      () => {},
      "stream",
    );
  }
  private async ruleAttempt(
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    const reservation = await this.reserve(0, "stream_rules");
    let status: number | null = null;
    try {
      const response = await this.rulesTransport.send(
        new URL(this.config.baseUrl + this.settings.rulesPath),
        {
          authorization: `Bearer ${this.config.token!.reveal()}`,
          "content-type": "application/json",
        },
        method,
        body === undefined ? undefined : JSON.stringify(body),
      );
      status = response.status;
      await this.status(response.status, response.headers, "stream_rules");
      let result: unknown;
      try {
        result = JSON.parse(response.body);
      } catch {
        throw new ProviderError("INVALID_RESPONSE", false, 0, true);
      }
      await this.record(reservation.id, reservation.amount, status, 0, 0);
      return result;
    } catch (error) {
      const failure =
        error instanceof ProviderError
          ? error
          : new ProviderError("NETWORK_ERROR", true, 0, true);
      await this.record(
        reservation.id,
        failure.sent ? reservation.amount : "0",
        status,
        null,
        null,
        failure,
      );
      if (method === "POST" && failure.sent)
        throw new ProviderError(
          failure.code,
          false,
          failure.retryAfterMs,
          true,
          failure.status,
        );
      throw failure;
    }
  }
  async setRules(rules: XStreamRule[]): Promise<RuleSyncResult> {
    await this.allowed();
    if (this.active) throw new ProviderError("INVALID_INPUT");
    const groups = new Map<string, string[]>();
    for (const rule of rules) {
      if (!/^[a-f0-9-]{36}$/i.test(rule.localId))
        throw new ProviderError("INVALID_INPUT");
      validateQuery(rule.query, this.config);
      const query = rule.query.trim();
      groups.set(query, [...(groups.get(query) ?? []), rule.localId]);
    }
    if (groups.size > this.settings.maxRules)
      throw new ProviderError("INVALID_INPUT");
    const schema = z.object({
      data: z
        .array(
          z.object({
            id: z.string().regex(/^[1-9][0-9]{0,31}$/),
            value: z.string().max(10000),
            tag: z.string().max(512).optional(),
          }),
        )
        .max(1000)
        .optional(),
      errors: z.array(z.unknown()).optional(),
    });
    const existing = schema.safeParse(await this.ruleRequest("GET"));
    if (!existing.success || existing.data.errors?.length)
      throw new ProviderError("INVALID_RESPONSE");
    const desired = [...groups].map(([query, localIds]) => ({
      query,
      localIds,
      tag:
        this.settings.tagPrefix +
        createHash("sha256").update(query).digest("hex").slice(0, 24),
    }));
    const owned = (existing.data.data ?? []).filter((rule) =>
      rule.tag?.startsWith(this.settings.tagPrefix),
    );
    const seen = new Set<string>();
    const stale = owned.filter((rule) => {
      const valid = desired.some(
          (d) => d.tag === rule.tag && d.query === rule.value,
        ),
        key = rule.tag ?? "";
      if (!valid || seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (stale.length) {
      const deleted = z
        .object({
          meta: z.object({
            summary: z.object({
              deleted: z.number().int().nonnegative(),
              not_deleted: z.number().int().nonnegative().optional(),
            }),
          }),
        })
        .safeParse(
          await this.ruleRequest("POST", {
            delete: { ids: stale.map((r) => r.id) },
          }),
        );
      if (
        !deleted.success ||
        deleted.data.meta.summary.deleted !== stale.length
      )
        throw new ProviderError("INVALID_RESPONSE");
    }
    const missing = desired.filter(
      (d) => !owned.some((r) => r.tag === d.tag && r.value === d.query),
    );
    let added: NonNullable<z.infer<typeof schema>["data"]> = [];
    if (missing.length) {
      const response = schema.safeParse(
        await this.ruleRequest("POST", {
          add: missing.map((d) => ({ value: d.query, tag: d.tag })),
        }),
      );
      if (!response.success || response.data.errors?.length)
        throw new ProviderError("INVALID_RESPONSE");
      added = response.data.data ?? [];
    }
    this.synced = {
      rules: desired.map((d) => {
        const remote = [...owned, ...added].find(
          (r) => r.tag === d.tag && r.value === d.query,
        );
        if (!remote) throw new ProviderError("INVALID_RESPONSE");
        return { remoteId: remote.id, localIds: d.localIds, query: d.query };
      }),
    };
    return this.synced;
  }
  connect(
    onPage: Parameters<XStreamProvider["connect"]>[0],
    options: Parameters<XStreamProvider["connect"]>[1] = {},
  ): StreamHandle {
    const controller = new AbortController(),
      abort = () => controller.abort();
    options?.signal?.addEventListener("abort", abort, { once: true });
    if (options?.signal?.aborted) abort();
    const done = this.window(onPage, options?.onConnected, controller).finally(
      () => options?.signal?.removeEventListener("abort", abort),
    );
    return { done, stop: abort };
  }
  private async window(
    onPage: Parameters<XStreamProvider["connect"]>[0],
    onConnected: (() => void) | undefined,
    controller: AbortController,
  ): Promise<StreamOutcome> {
    if (controller.signal.aborted) return { reason: "stopped", posts: 0 };
    if (this.active || !this.synced.rules.length)
      throw new ProviderError("INVALID_INPUT");
    this.active = true;
    let connection: Awaited<ReturnType<StreamTransport["open"]>> | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      rotated = false;
    let reservation:
        Awaited<ReturnType<XFilteredStream["reserve"]>> | undefined,
      status: number | null = null,
      posts = 0,
      users = 0,
      cost = "0",
      failure: ProviderError | undefined;
    try {
      reservation = await this.reserve(this.settings.billableMaxPosts ?? 0);
      cost = reservation.amount;
      const url = new URL(this.config.baseUrl + this.settings.path);
      url.searchParams.set(
        this.config.postFieldsParameter,
        "id,text,author_id,created_at,conversation_id,referenced_tweets,public_metrics,entities,lang",
      );
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set(
        "user.fields",
        "id,name,username,protected,public_metrics,verified_type",
      );
      connection = await this.transport.open(
        url,
        { authorization: `Bearer ${this.config.token!.reveal()}` },
        controller.signal,
      );
      status = connection.status;
      await this.status(status, connection.headers);
      await this.control.setCapability("stream", {
        state: "available",
        reason: "response",
        observedAt: new Date(this.clock.now()).toISOString(),
        windowSeconds: null,
      });
      onConnected?.();
      timer = setTimeout(() => {
        rotated = true;
        controller.abort();
      }, this.settings.windowMs);
      const schemas = providerSchemas("REAL");
      for await (const frame of ndjson(connection.body, {
        signal: controller.signal,
        idleMs: this.settings.idleMs,
        maxLineBytes: 2000000,
      })) {
        const decoded = z
          .object({
            data: schemas.post,
            includes: z
              .object({ users: z.array(schemas.user).max(1).optional() })
              .optional(),
            matching_rules: z
              .array(
                z.object({
                  id: z.string().max(32),
                  tag: z.string().optional(),
                }),
              )
              .max(1000),
          })
          .safeParse(frame);
        if (!decoded.success)
          throw new ProviderError("INVALID_RESPONSE", false, 0, true);
        posts++;
        users += decoded.data.includes?.users?.length ?? 0;
        if (
          posts > this.settings.maxPosts ||
          posts > (this.settings.billableMaxPosts ?? 0) ||
          users > (this.settings.billableMaxPosts ?? 0)
        )
          throw new ProviderError("INVALID_RESPONSE", false, 0, true);
        const matched = this.synced.rules
          .filter((rule) =>
            decoded.data.matching_rules.some((r) => r.id === rule.remoteId),
          )
          .flatMap((rule) => rule.localIds);
        if (matched.length) {
          const at = new Date(this.clock.now()).toISOString();
          await onPage(
            {
              data: [normalizePost(decoded.data.data, "REAL", at)],
              users: (decoded.data.includes?.users ?? []).map((u) =>
                normalizeUser(u, "REAL", at),
              ),
              nextToken: null,
              problems: [],
              quota: null,
              partial: false,
              collectedAt: at,
              dataOrigin: "REAL",
            },
            matched,
          );
        }
        if (posts >= this.settings.maxPosts) {
          rotated = true;
          break;
        }
      }
      // Reserve the verified contract upper bound for streaming, even if fewer frames were parsed.
      return {
        reason: rotated
          ? "rotated"
          : controller.signal.aborted
            ? "stopped"
            : "disconnected",
        posts,
      };
    } catch (error) {
      if (controller.signal.aborted)
        return { reason: rotated ? "rotated" : "stopped", posts };
      failure =
        error instanceof ProviderError
          ? error
          : new ProviderError("NETWORK_ERROR", true, 0, true);
      if (!failure.sent && !connection) cost = "0";
      throw failure;
    } finally {
      clearTimeout(timer);
      controller.abort();
      await connection?.close();
      this.active = false;
      if (reservation)
        await this.record(reservation.id, cost, status, posts, users, failure);
    }
  }
}
