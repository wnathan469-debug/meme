import type { Clock } from "../../shared/runtime";
import { ProviderError } from "../../shared/errors";
export type Feature = "watch" | "people" | "conversations";
export type CapabilityState =
  "available" | "limited" | "unavailable" | "untested";
export interface CapabilityObservation {
  state: CapabilityState;
  observedAt: string;
  reason: "response" | "denied" | "configured" | "demo";
  windowSeconds: number | null;
}
export interface Quota {
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
  observedAt: number;
}
export interface BudgetLimit {
  key: string;
  amount: string;
}
export interface Reservation {
  endpoint?: string;
  feature?: Feature;
  id: string;
  amount: string;
  limits: BudgetLimit[];
  expiresAt: number;
  warningPercent: number;
}
export interface Usage {
  requestId: string;
  endpoint: string;
  feature: Feature;
  status: number | null;
  posts: number | null;
  users: number | null;
  costMicros: string;
  estimated: boolean;
  at: string;
}
export interface CircuitPolicy {
  threshold: number;
  cooldownMs: number;
}
export interface ControlStore {
  readonly scope: "local" | "shared";
  reserve(reservation: Reservation): Promise<{ warning: boolean }>;
  settle(id: string, actual: string): Promise<void>;
  takeRate(endpoint: string, now: number, intervalMs: number): Promise<void>;
  deferRate(endpoint: string, until: number): Promise<void>;
  updateQuota(endpoint: string, quota: Quota): Promise<void>;
  quota(endpoint: string): Promise<Quota | null>;
  enterCircuit(
    endpoint: string,
    now: number,
    policy: CircuitPolicy,
  ): Promise<void>;
  finishCircuit(
    endpoint: string,
    now: number,
    result: "success" | "failure" | "cancel",
    policy: CircuitPolicy,
  ): Promise<void>;
  capability(endpoint: string): Promise<CapabilityObservation | null>;
  setCapability(endpoint: string, value: CapabilityObservation): Promise<void>;
  appendUsage(usage: Usage): Promise<void>;
  usage(): Promise<Usage[]>;
}
interface Ticket {
  value: Reservation;
  settled: string | null;
}
interface Circuit {
  failures: number;
  until: number;
  lease: number;
}
export class MemoryControlStore implements ControlStore {
  readonly scope = "local" as const;
  readonly balances = new Map<string, bigint>();
  private readonly limits = new Map<string, string>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly quotas = new Map<string, Quota>();
  private readonly next = new Map<string, number>();
  private readonly circuits = new Map<string, Circuit>();
  private readonly capabilities = new Map<string, CapabilityObservation>();
  private readonly ledger: Usage[] = [];
  async reserve(value: Reservation): Promise<{ warning: boolean }> {
    if (
      !unsigned(value.amount) ||
      value.limits.some((limit) => !unsigned(limit.amount))
    )
      throw new ProviderError("INVALID_INPUT");
    if (this.tickets.has(value.id))
      throw new ProviderError("STORE_UNAVAILABLE");
    const amount = BigInt(value.amount);
    let warning = false;
    for (const limit of value.limits) {
      if (
        this.limits.has(limit.key) &&
        this.limits.get(limit.key) !== limit.amount
      )
        throw new ProviderError("STORE_UNAVAILABLE");
      const next = (this.balances.get(limit.key) ?? 0n) + amount;
      if (next > BigInt(limit.amount))
        throw new ProviderError("BUDGET_EXCEEDED");
      warning ||=
        next * 100n >= BigInt(limit.amount) * BigInt(value.warningPercent);
    }
    for (const limit of value.limits) {
      this.limits.set(limit.key, limit.amount);
      this.balances.set(
        limit.key,
        (this.balances.get(limit.key) ?? 0n) + amount,
      );
    }
    this.tickets.set(value.id, { value, settled: null });
    return { warning };
  }
  async settle(id: string, actual: string): Promise<void> {
    if (!unsigned(actual)) throw new ProviderError("INVALID_INPUT");
    const ticket = this.tickets.get(id);
    if (!ticket || BigInt(actual) > BigInt(ticket.value.amount))
      throw new ProviderError("STORE_UNAVAILABLE");
    if (ticket.settled !== null) {
      if (ticket.settled !== actual)
        throw new ProviderError("STORE_UNAVAILABLE");
      return;
    }
    const refund = BigInt(ticket.value.amount) - BigInt(actual);
    for (const limit of ticket.value.limits)
      this.balances.set(
        limit.key,
        (this.balances.get(limit.key) ?? 0n) - refund,
      );
    ticket.settled = actual;
  }
  async takeRate(
    endpoint: string,
    now: number,
    intervalMs: number,
  ): Promise<void> {
    const quota = this.quotas.get(endpoint);
    if (quota && quota.resetAt !== null && quota.resetAt <= now)
      this.quotas.delete(endpoint);
    const active = this.quotas.get(endpoint);
    const remoteUntil =
      active?.remaining === 0
        ? (active.resetAt ?? active.observedAt + 60_000)
        : 0;
    const until = Math.max(remoteUntil, this.next.get(endpoint) ?? 0);
    if (until > now) throw new ProviderError("RATE_LIMITED", true, until - now);
    if (active?.remaining !== null && active?.remaining !== undefined)
      active.remaining = Math.max(0, active.remaining - 1);
    this.next.set(endpoint, now + intervalMs);
  }
  async deferRate(endpoint: string, until: number): Promise<void> {
    this.next.set(endpoint, Math.max(until, this.next.get(endpoint) ?? 0));
  }
  async updateQuota(endpoint: string, value: Quota): Promise<void> {
    const previous = this.quotas.get(endpoint);
    if (previous?.resetAt && value.resetAt && value.resetAt < previous.resetAt)
      return;
    if (
      previous &&
      previous.resetAt === value.resetAt &&
      previous.remaining !== null &&
      value.remaining !== null
    )
      value = {
        ...value,
        remaining: Math.min(previous.remaining, value.remaining),
      };
    this.quotas.set(endpoint, { ...value });
  }
  async quota(endpoint: string): Promise<Quota | null> {
    return structuredClone(this.quotas.get(endpoint) ?? null);
  }
  async enterCircuit(
    endpoint: string,
    now: number,
    policy: CircuitPolicy,
  ): Promise<void> {
    const value = this.circuits.get(endpoint) ?? {
      failures: 0,
      until: 0,
      lease: 0,
    };
    if (value.until > now || value.lease > now)
      throw new ProviderError(
        "CIRCUIT_OPEN",
        false,
        Math.max(value.until, value.lease) - now,
      );
    if (value.failures >= policy.threshold)
      value.lease = now + policy.cooldownMs;
    this.circuits.set(endpoint, value);
  }
  async finishCircuit(
    endpoint: string,
    now: number,
    result: "success" | "failure" | "cancel",
    policy: CircuitPolicy,
  ): Promise<void> {
    const value = this.circuits.get(endpoint) ?? {
      failures: 0,
      until: 0,
      lease: 0,
    };
    value.lease = 0;
    if (result === "success") {
      value.failures = 0;
      value.until = 0;
    }
    if (result === "failure") {
      value.failures++;
      if (value.failures >= policy.threshold)
        value.until = now + policy.cooldownMs;
    }
    this.circuits.set(endpoint, value);
  }
  async capability(endpoint: string): Promise<CapabilityObservation | null> {
    return structuredClone(this.capabilities.get(endpoint) ?? null);
  }
  async setCapability(
    endpoint: string,
    value: CapabilityObservation,
  ): Promise<void> {
    this.capabilities.set(endpoint, structuredClone(value));
  }
  async appendUsage(value: Usage): Promise<void> {
    this.ledger.push(structuredClone(value));
    if (this.ledger.length > 10_000) this.ledger.shift();
  }
  async usage(): Promise<Usage[]> {
    return structuredClone(this.ledger);
  }
}
const unsigned = (value: string) => /^(0|[1-9][0-9]{0,39})$/.test(value);
export interface Pricing {
  currency: "USD";
  request: string;
  post: string;
  user: string;
  verifiedAt: string;
}
export interface BudgetPolicy {
  daily: string;
  monthly: string;
  warningPercent: number;
  features: Partial<Record<Feature, { daily: string; monthly: string }>>;
}
export class BudgetGuard {
  constructor(
    readonly store: ControlStore,
    private readonly clock: Clock,
    private readonly policy: BudgetPolicy | null,
    private readonly pricing: Pricing | null,
  ) {
    if (
      policy &&
      (!unsigned(policy.daily) ||
        !unsigned(policy.monthly) ||
        policy.warningPercent < 1 ||
        policy.warningPercent > 100)
    )
      throw new ProviderError("INVALID_INPUT");
    if (
      pricing &&
      ![pricing.request, pricing.post, pricing.user].every(unsigned)
    )
      throw new ProviderError("INVALID_INPUT");
    if (
      policy &&
      Object.values(policy.features).some(
        (value) => !value || !unsigned(value.daily) || !unsigned(value.monthly),
      )
    )
      throw new ProviderError("INVALID_INPUT");
  }
  cost(posts: number, users: number): string {
    if (!this.pricing || !this.policy)
      throw new ProviderError("PRICING_UNKNOWN");
    if (
      !Number.isSafeInteger(posts) ||
      !Number.isSafeInteger(users) ||
      posts < 0 ||
      users < 0
    )
      throw new ProviderError("INVALID_INPUT");
    return (
      BigInt(this.pricing.request) +
      BigInt(this.pricing.post) * BigInt(posts) +
      BigInt(this.pricing.user) * BigInt(users)
    ).toString();
  }
  async reserve(
    id: string,
    feature: Feature,
    maxPosts: number,
    maxUsers: number,
    endpoint?: string,
  ): Promise<{ amount: string; warning: boolean }> {
    const amount = this.cost(maxPosts, maxUsers),
      date = new Date(this.clock.now());
    const day = date.toISOString().slice(0, 10),
      month = day.slice(0, 7);
    const policy = this.policy!;
    const limits: BudgetLimit[] = [
      { key: `day:${day}`, amount: policy.daily },
      { key: `month:${month}`, amount: policy.monthly },
    ];
    const featurePolicy = policy.features[feature];
    if (featurePolicy)
      limits.push(
        { key: `feature:${feature}:day:${day}`, amount: featurePolicy.daily },
        {
          key: `feature:${feature}:month:${month}`,
          amount: featurePolicy.monthly,
        },
      );
    const expiresAt = Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      3,
    );
    const result = await this.store.reserve({
      id,
      endpoint,
      feature,
      amount,
      limits,
      expiresAt,
      warningPercent: policy.warningPercent,
    });
    return { amount, warning: result.warning };
  }
  async settle(id: string, amount: string): Promise<void> {
    await this.store.settle(id, amount);
  }
}
export function quotaFromHeaders(
  headers: Record<string, string>,
  now: number,
): Quota {
  const integer = (key: string): number | null => {
    const raw = headers[key];
    if (raw === undefined || !/^\d+$/.test(raw)) return null;
    const number = Number(raw);
    return Number.isSafeInteger(number) ? number : null;
  };
  const reset = integer("x-rate-limit-reset");
  return {
    limit: integer("x-rate-limit-limit"),
    remaining: integer("x-rate-limit-remaining"),
    resetAt:
      reset !== null && reset <= Number.MAX_SAFE_INTEGER / 1000
        ? reset * 1000
        : null,
    observedAt: now,
  };
}
export function retryAfter(
  headers: Record<string, string>,
  now: number,
): number {
  const value = headers["retry-after"];
  let retry = 0;
  if (value && /^\d+(\.\d+)?$/.test(value)) retry = Number(value) * 1000;
  else if (value) {
    const date = Date.parse(value);
    if (Number.isFinite(date)) retry = Math.max(0, date - now);
  }
  const quota = quotaFromHeaders(headers, now);
  return Math.max(
    Number.isFinite(retry) ? retry : 0,
    quota.resetAt !== null ? quota.resetAt - now : 0,
    0,
  );
}
