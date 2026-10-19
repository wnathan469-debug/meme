import { DatabaseSync } from "node:sqlite";
import { ProviderError } from "../../packages/shared/errors";
import type {
  ControlStore,
  Reservation,
  Usage,
  Quota,
  CircuitPolicy,
  CapabilityObservation,
} from "../../packages/connectors/x/control";
import { localSettingsSchema, micros, type LocalSettings } from "./local-model";

/** One Electron main process owns this durable store. No local HTTP server or Redis. */
export class LocalStore implements ControlStore {
  readonly scope = "local" as const;
  readonly db: DatabaseSync;
  constructor(
    filename: string,
    readonly now = () => Date.now(),
  ) {
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA max_page_count=16384;",
      );
      const version = (
        this.db.prepare("PRAGMA user_version").get() as { user_version: number }
      ).user_version;
      if (version > 1) {
        throw new ProviderError("STORE_UNAVAILABLE");
      }
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_kv(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_balances(period TEXT PRIMARY KEY,amount TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_tickets(id TEXT PRIMARY KEY,amount TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_requests(day TEXT PRIMARY KEY,requests INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS local_usage(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_people(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS local_posts(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      PRAGMA user_version=1;
    `);
      // Never resume paid collection on process restart, including crash recovery.
      this.set("stopped", true);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM local_kv WHERE key=?")
      .get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare(
        "INSERT INTO local_kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  transaction<T>(f: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = f();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  policy() {
    const settings = localSettingsSchema.parse(
      this.get<unknown>("settings", null),
    );
    const verified = this.get<number>("verifiedAt", 0);
    if (
      !Number.isFinite(verified) ||
      verified > this.now() ||
      this.now() - verified > 7 * 86400000
    )
      throw new ProviderError("PRICING_UNKNOWN");
    return settings;
  }
  configure(value: unknown) {
    const settings = localSettingsSchema.parse(value);
    this.transaction(() => {
      this.set("stopped", true);
      this.set("settings", settings);
      this.set("verifiedAt", this.now());
      this.db
        .prepare("DELETE FROM local_kv WHERE key LIKE 'capability:%'")
        .run();
    });
  }
  balance(period: string) {
    return (
      (
        this.db
          .prepare("SELECT amount FROM local_balances WHERE period=?")
          .get(period) as { amount: string } | undefined
      )?.amount ?? "0"
    );
  }
  requests(day: string) {
    return (
      (
        this.db
          .prepare("SELECT requests FROM local_requests WHERE day=?")
          .get(day) as { requests: number } | undefined
      )?.requests ?? 0
    );
  }
  async reserve(r: Reservation) {
    return this.transaction(() => {
      if (this.get("stopped", true))
        throw new ProviderError("NETWORK_DISABLED");
      const pages = (
        this.db.prepare("PRAGMA page_count").get() as { page_count: number }
      ).page_count;
      const maximum = (
        this.db.prepare("PRAGMA max_page_count").get() as {
          max_page_count: number;
        }
      ).max_page_count;
      // Leave room for the bounded response and its indexes before paying for a call.
      if (pages + 1024 >= maximum) throw new ProviderError("STORE_UNAVAILABLE");
      const policy = this.policy();
      const day = new Date(this.now()).toISOString().slice(0, 10),
        month = day.slice(0, 7);
      const expected = [
        { key: "day:" + day, amount: micros(policy.dailyUsd) },
        { key: "month:" + month, amount: micros(policy.monthlyUsd) },
      ];
      if (
        !/^(0|[1-9][0-9]{0,39})$/.test(r.amount) ||
        r.limits.length !== 2 ||
        expected.some(
          (p, i) =>
            r.limits[i]?.key !== p.key || r.limits[i]?.amount !== p.amount,
        ) ||
        !["username", "timeline"].includes(r.endpoint ?? "")
      )
        throw new ProviderError("INVALID_INPUT");
      const ceiling =
        BigInt(micros(policy.requestUsd)) +
        BigInt(micros(policy.postUsd)) * 10n +
        BigInt(micros(policy.userUsd)) * 10n;
      if (BigInt(r.amount) > ceiling)
        throw new ProviderError("PRICING_UNKNOWN");
      if (this.requests(day) >= policy.maxRequestsDay)
        throw new ProviderError("RATE_LIMITED");
      let warning = false;
      for (const p of expected) {
        const next = BigInt(this.balance(p.key)) + BigInt(r.amount);
        if (next > BigInt(p.amount)) throw new ProviderError("BUDGET_EXCEEDED");
        warning ||= next * 100n >= BigInt(p.amount) * 80n;
        this.db
          .prepare(
            "INSERT INTO local_balances VALUES(?,?) ON CONFLICT(period) DO UPDATE SET amount=excluded.amount",
          )
          .run(p.key, next.toString());
      }
      this.db
        .prepare("INSERT INTO local_tickets VALUES(?,?)")
        .run(r.id, r.amount);
      this.db
        .prepare(
          "INSERT INTO local_requests VALUES(?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1",
        )
        .run(day);
      return { warning };
    });
  }
  async settle(id: string, actual: string) {
    const ticket = this.db
      .prepare("SELECT amount FROM local_tickets WHERE id=?")
      .get(id) as { amount: string } | undefined;
    if (
      !ticket ||
      !/^(0|[1-9][0-9]{0,39})$/.test(actual) ||
      BigInt(actual) > BigInt(ticket.amount)
    )
      throw new ProviderError("STORE_UNAVAILABLE");
    // Retain the maximum reservation, including failures. This is not an invoice.
  }
  async takeRate(endpoint: string, now: number, intervalMs: number) {
    const quota = await this.quota(endpoint);
    const remote =
      quota?.remaining === 0 ? (quota.resetAt ?? quota.observedAt + 60000) : 0;
    if (Math.max(remote, this.get("rate:" + endpoint, 0)) > now)
      throw new ProviderError("RATE_LIMITED");
    this.set("rate:" + endpoint, now + intervalMs);
    if (quota && quota.remaining !== null)
      this.set("quota:" + endpoint, {
        ...quota,
        remaining: Math.max(0, quota.remaining - 1),
      });
  }
  async deferRate(endpoint: string, until: number) {
    this.set(
      "rate:" + endpoint,
      Math.max(this.get("rate:" + endpoint, 0), until),
    );
  }
  async updateQuota(endpoint: string, value: Quota) {
    const previous = await this.quota(endpoint);
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
    this.set("quota:" + endpoint, value);
  }
  async quota(endpoint: string): Promise<Quota | null> {
    const q = this.get<Quota | null>("quota:" + endpoint, null);
    return q?.resetAt !== null &&
      q?.resetAt !== undefined &&
      q.resetAt <= this.now()
      ? null
      : q;
  }
  async enterCircuit(endpoint: string, now: number, policy: CircuitPolicy) {
    const c = this.get("circuit:" + endpoint, {
      failures: 0,
      until: 0,
      lease: 0,
    });
    if (Math.max(c.until, c.lease) > now)
      throw new ProviderError("CIRCUIT_OPEN");
    if (c.failures >= policy.threshold) c.lease = now + policy.cooldownMs;
    this.set("circuit:" + endpoint, c);
  }
  async finishCircuit(
    endpoint: string,
    now: number,
    result: "success" | "failure" | "cancel",
    policy: CircuitPolicy,
  ) {
    const c = this.get("circuit:" + endpoint, {
      failures: 0,
      until: 0,
      lease: 0,
    });
    c.lease = 0;
    if (result === "success") {
      c.failures = 0;
      c.until = 0;
    }
    if (result === "failure" && ++c.failures >= policy.threshold)
      c.until = now + policy.cooldownMs;
    this.set("circuit:" + endpoint, c);
  }
  async capability(endpoint: string) {
    return this.get<CapabilityObservation | null>(
      "capability:" + endpoint,
      null,
    );
  }
  async setCapability(endpoint: string, value: CapabilityObservation) {
    this.set("capability:" + endpoint, value);
  }
  async appendUsage(value: Usage) {
    this.db
      .prepare("INSERT INTO local_usage VALUES(?,?)")
      .run(value.requestId, JSON.stringify(value));
  }
  async usage() {
    return (
      this.db
        .prepare("SELECT value FROM local_usage ORDER BY rowid DESC LIMIT 200")
        .all() as { value: string }[]
    ).map((r) => JSON.parse(r.value) as Usage);
  }
  close() {
    this.db.close();
  }
}
