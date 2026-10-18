import { ensureBudgetLimit } from "./provider-budget-policy";
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withUserContext } from "./client";
import { ProviderError } from "../shared/errors";
import {
  settingsSchema,
  diagnosticSchema,
  scope,
  periodKeys,
  micros,
  backoffUntil,
  type ProviderSettings,
  type ProviderId,
  type ProviderDiagnostic,
} from "../sources/model";
/** Enforcement metadata is public to trusted workers; journals and admin writes are owner-scoped. */
export class PgSourceRepository {
  constructor(
    private pool: Pool,
    readonly ownerId: string,
    readonly origin: "DEMO" | "REAL",
    private now = () => Date.now(),
  ) {
    z.uuid().parse(ownerId);
  }
  private tx<T>(f: (c: PoolClient) => Promise<T>) {
    return withUserContext(this.pool, this.ownerId, this.origin, f);
  }
  private async owned(c: PoolClient, p: ProviderId, ns: string, lock = false) {
    scope(p, ns, this.origin);
    const r = await c.query(
      "SELECT * FROM memeradar.provider_controls WHERE data_origin=$1 AND provider=$2 AND namespace=$3 AND owner_user_id=$4" +
        (lock ? " FOR UPDATE" : ""),
      [this.origin, p, ns, this.ownerId],
    );
    if (!r.rowCount) throw new ProviderError("NOT_FOUND");
    return r.rows[0];
  }
  async initialize(p: ProviderId, ns: string, input: ProviderSettings) {
    const settings = settingsSchema.parse(input);
    scope(p, ns, this.origin);
    return this.tx(async (c) => {
      await c.query(
        "INSERT INTO memeradar.provider_controls(data_origin,provider,namespace,owner_user_id,enabled,settings) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(data_origin,provider,namespace) DO NOTHING",
        [this.origin, p, ns, this.ownerId, settings.enabled, settings],
      );
      await this.owned(c, p, ns);
    });
  }
  async save(
    p: ProviderId,
    ns: string,
    input: ProviderSettings,
    revision: number,
  ) {
    const settings = settingsSchema.parse(input);
    return this.tx(async (c) => {
      // Same lock as monetary reservations, before the policy row lock: no reverse lock order.
      if (p === "x")
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `memeradar:x:${this.origin}:${ns}`,
        ]);
      const old = await this.owned(c, p, ns, true);
      if (old.revision !== revision) throw new ProviderError("INVALID_INPUT");
      if (p === "x") {
        const k = periodKeys(new Date(this.now()).toISOString()),
          limits = [
            { key: k.day, amount: settings.budget.daily },
            { key: k.month, amount: settings.budget.monthly },
          ];
        for (const [feature, v] of Object.entries(settings.budget.features))
          if (v)
            limits.push(
              { key: `feature:${feature}:${k.day}`, amount: v.daily },
              { key: `feature:${feature}:${k.month}`, amount: v.monthly },
            );
        // Keep existing feature caps if a caller attempts to remove a configured guard.
        for (const [feature, v] of Object.entries(
          settingsSchema.parse(old.settings).budget.features,
        ))
          if (
            v &&
            !settings.budget.features[
              feature as keyof typeof settings.budget.features
            ]
          )
            throw new ProviderError("INVALID_INPUT");
        for (const l of limits)
          await ensureBudgetLimit(
            c,
            this.origin,
            ns,
            l.key,
            l.amount,
            new Date(
              Date.UTC(
                new Date(this.now()).getUTCFullYear(),
                new Date(this.now()).getUTCMonth() + 1,
                3,
              ),
            ),
            true,
          );
      }
      if (p === "x")
        for (const priority of ["critical", "high", "normal", "low"] as const)
          if (
            settings.priorities[priority] !==
            settingsSchema.parse(old.settings).priorities[priority]
          )
            await c.query(
              "UPDATE memeradar.x_rules SET poll_interval_seconds=$1 WHERE data_origin=$2 AND owner_user_id=$3 AND priority=$4",
              [
                settings.priorities[priority],
                this.origin,
                this.ownerId,
                priority,
              ],
            );
      await c.query(
        "UPDATE memeradar.provider_controls SET settings=$1,enabled=$2,revision=revision+1,probe_id=NULL,probe_ceiling=NULL,probe_expires_at=NULL WHERE id=$3 AND data_origin=$4",
        [settings, settings.enabled, old.id, this.origin],
      );
      return old.revision + 1;
    });
  }
  async read(p: ProviderId, ns: string) {
    return this.tx(async (c) => {
      const control = await this.owned(c, p, ns),
        asOf = new Date(this.now()).toISOString(),
        k = periodKeys(asOf),
        blocked = [control.blocked_until, control.circuit_lease_until]
          .filter((v): v is Date => !!v)
          .sort((a, b) => b.getTime() - a.getTime());
      const logs = await c.query(
        "SELECT diagnostic FROM memeradar.provider_diagnostics WHERE data_origin=$1 AND provider=$2 AND namespace=$3 AND observed_at<=$4 ORDER BY observed_at DESC,id DESC LIMIT 51",
        [this.origin, p, ns, asOf],
      );
      const times = await c.query(
        "SELECT max(observed_at) FILTER(WHERE diagnostic->>'code' IS NULL) AS success,max(observed_at) FILTER(WHERE diagnostic->>'code' IS NOT NULL) AS error FROM memeradar.provider_diagnostics WHERE data_origin=$1 AND provider=$2 AND namespace=$3 AND observed_at<=$4",
        [this.origin, p, ns, asOf],
      );
      const usage =
        p === "x"
          ? await c.query(
              "SELECT count(*)::text AS calls,coalesce(sum(posts),0)::text AS posts,count(*) FILTER(WHERE posts IS NULL)::text AS unknown_posts,coalesce(sum(cost_micros),0)::text AS cost FROM memeradar.x_usage_ledger WHERE data_origin=$1 AND namespace=$2 AND observed_at >= $3 AND observed_at <= $4",
              [this.origin, ns, k.monthStart, asOf],
            )
          : await c.query(
              "SELECT count(*)::text AS calls,NULL::text AS posts,'0'::text AS unknown_posts,NULL::text AS cost FROM memeradar.provider_diagnostics WHERE data_origin=$1 AND provider=$2 AND namespace=$3 AND observed_at >= $4 AND observed_at <= $5",
              [this.origin, p, ns, k.monthStart, asOf],
            );
      const day =
        p === "x"
          ? await c.query(
              "SELECT count(*)::text AS calls,coalesce(sum(posts),0)::text AS posts,count(*) FILTER(WHERE posts IS NULL)::text AS unknown_posts,coalesce(sum(cost_micros),0)::text AS cost FROM memeradar.x_usage_ledger WHERE data_origin=$1 AND namespace=$2 AND observed_at >= $3 AND observed_at <= $4",
              [this.origin, ns, k.dayStart, asOf],
            )
          : await c.query(
              "SELECT count(*)::text AS calls,NULL::text AS posts,'0'::text AS unknown_posts,NULL::text AS cost FROM memeradar.provider_diagnostics WHERE data_origin=$1 AND provider=$2 AND namespace=$3 AND observed_at >= $4 AND observed_at <= $5",
              [this.origin, p, ns, k.dayStart, asOf],
            );
      const balances =
        p === "x"
          ? await c.query(
              "SELECT budget_key,limit_micros::text,spent_micros::text FROM memeradar.provider_budgets WHERE data_origin=$1 AND provider='x' AND namespace=$2 AND (budget_key=$3 OR budget_key=$4 OR budget_key LIKE $5 OR budget_key LIKE $6) ORDER BY budget_key",
              [
                this.origin,
                ns,
                k.day,
                k.month,
                `feature:%:${k.day}`,
                `feature:%:${k.month}`,
              ],
            )
          : { rows: [] };
      return {
        origin: this.origin,
        provider: p,
        namespace: ns,
        asOf,
        settings: settingsSchema.parse(control.settings),
        revision: control.revision,
        blockedUntil: blocked.length ? blocked[0].toISOString() : null,
        lastSuccess: times.rows[0].success?.toISOString() ?? null,
        lastError: times.rows[0].error?.toISOString() ?? null,
        diagnostics: logs.rows
          .slice(0, 50)
          .map((r) => diagnosticSchema.parse(r.diagnostic)),
        partial: logs.rows.length > 50,
        month: usage.rows[0] as UsageTotals,
        day: day.rows[0] as UsageTotals,
        balances: balances.rows as Balance[],
        period: k,
      };
    });
  }
  async quote(p: ProviderId, ns: string, ceiling: string) {
    micros.parse(ceiling);
    return this.tx(async (c) => {
      if (p === "x")
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          `memeradar:x:${this.origin}:${ns}`,
        ]);
      const row = await this.owned(c, p, ns, true);
      if (!row.enabled) throw new ProviderError("NETWORK_DISABLED");
      if (row.blocked_until && Date.parse(row.blocked_until) > this.now())
        throw new ProviderError("RATE_LIMITED");
      if (p === "x") {
        const s = settingsSchema.parse(row.settings),
          k = periodKeys(new Date(this.now()).toISOString()),
          limits = [
            { key: k.day, amount: s.budget.daily },
            { key: k.month, amount: s.budget.monthly },
          ];
        if (s.budget.features.people)
          limits.push(
            {
              key: `feature:people:${k.day}`,
              amount: s.budget.features.people.daily,
            },
            {
              key: `feature:people:${k.month}`,
              amount: s.budget.features.people.monthly,
            },
          );
        for (const l of limits) {
          const b = await ensureBudgetLimit(
            c,
            this.origin,
            ns,
            l.key,
            l.amount,
            new Date(
              Date.UTC(
                new Date(this.now()).getUTCFullYear(),
                new Date(this.now()).getUTCMonth() + 1,
                3,
              ),
            ),
          );
          if (BigInt(b.spent_micros) + BigInt(ceiling) > BigInt(l.amount))
            throw new ProviderError("BUDGET_EXCEEDED");
        }
      }
      const id = randomUUID(),
        expiresAt = new Date(this.now() + 120000).toISOString();
      await c.query(
        "UPDATE memeradar.provider_controls SET probe_id=$1,probe_ceiling=$2,probe_expires_at=$3 WHERE id=$4 AND data_origin=$5",
        [id, ceiling, expiresAt, row.id, this.origin],
      );
      return { id, ceiling, expiresAt, revision: row.revision };
    });
  }
  async consume(p: ProviderId, ns: string, id: string, ceiling: string) {
    z.uuid().parse(id);
    return this.tx(async (c) => {
      const row = await this.owned(c, p, ns, true);
      if (!row.enabled) throw new ProviderError("NETWORK_DISABLED");
      if (
        row.probe_id !== id ||
        !row.probe_expires_at ||
        Date.parse(row.probe_expires_at) <= this.now() ||
        row.probe_ceiling !== ceiling
      )
        throw new ProviderError("INVALID_INPUT");
      if (row.blocked_until && Date.parse(row.blocked_until) > this.now())
        throw new ProviderError("RATE_LIMITED");
      await c.query(
        "UPDATE memeradar.provider_controls SET probe_id=NULL,probe_ceiling=NULL,probe_expires_at=NULL WHERE id=$1 AND data_origin=$2",
        [row.id, this.origin],
      );
    });
  }
  async rules() {
    return this.tx(async (c) => {
      const rows = (
        await c.query(
          "SELECT id,name,priority,poll_interval_seconds,status FROM memeradar.x_rules WHERE data_origin=$1 AND owner_user_id=$2 ORDER BY created_at,id LIMIT 201",
          [this.origin, this.ownerId],
        )
      ).rows;
      if (rows.length > 200) throw new ProviderError("INVALID_INPUT");
      return rows;
    });
  }
  async setInterval(id: string, seconds: number) {
    z.uuid().parse(id);
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400)
      throw new ProviderError("INVALID_INPUT");
    return this.tx(async (c) => {
      const r = await c.query(
        "UPDATE memeradar.x_rules SET poll_interval_seconds=$1 WHERE id=$2 AND data_origin=$3 AND owner_user_id=$4 RETURNING id",
        [seconds, id, this.origin, this.ownerId],
      );
      if (!r.rowCount) throw new ProviderError("NOT_FOUND");
    });
  }
  async applyPriority(
    priority: "critical" | "high" | "normal" | "low",
    seconds: number,
  ) {
    z.enum(["critical", "high", "normal", "low"]).parse(priority);
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400)
      throw new ProviderError("INVALID_INPUT");
    return this.tx(
      async (c) =>
        (
          await c.query(
            "UPDATE memeradar.x_rules SET poll_interval_seconds=$1 WHERE data_origin=$2 AND owner_user_id=$3 AND priority=$4 RETURNING id",
            [seconds, this.origin, this.ownerId, priority],
          )
        ).rowCount,
    );
  }
}
export interface UsageTotals {
  calls: string;
  posts: string | null;
  unknown_posts: string;
  cost: string | null;
}
export interface Balance {
  budget_key: string;
  limit_micros: string;
  spent_micros: string;
}
export type ProviderSnapshot = Awaited<ReturnType<PgSourceRepository["read"]>>;
/** Shared public-provider circuit admission; coordinator assumes only the known scope owner. */
export async function publicAdmission(
  pool: Pool,
  origin: "REAL" | "DEMO",
  p: ProviderId,
  ns: string,
  now: number,
) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const lookup = await c.query(
      "SELECT owner_user_id FROM memeradar.provider_controls WHERE data_origin=$1 AND provider=$2 AND namespace=$3",
      [origin, p, ns],
    );
    if (lookup.rowCount) {
      await c.query(
        "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin',$2,true)",
        [lookup.rows[0].owner_user_id, origin],
      );
      const row = (
        await c.query(
          "SELECT * FROM memeradar.provider_controls WHERE data_origin=$1 AND provider=$2 AND namespace=$3 FOR UPDATE",
          [origin, p, ns],
        )
      ).rows[0];
      if (!row.enabled) throw new ProviderError("NETWORK_DISABLED");
      if (row.blocked_until && Date.parse(row.blocked_until) > now)
        throw new ProviderError(
          row.failures >= 3 ? "CIRCUIT_OPEN" : "RATE_LIMITED",
          true,
          Date.parse(row.blocked_until) - now,
        );
      if (row.circuit_lease_until && Date.parse(row.circuit_lease_until) > now)
        throw new ProviderError("CIRCUIT_OPEN");
      if (row.failures >= 3)
        await c.query(
          "UPDATE memeradar.provider_controls SET circuit_lease_until=$1 WHERE id=$2 AND data_origin=$3",
          [new Date(now + 30000), row.id, origin],
        );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e instanceof ProviderError
      ? e
      : new ProviderError("STORE_UNAVAILABLE");
  } finally {
    c.release();
  }
}
export async function recordDiagnostic(
  pool: Pool,
  origin: "REAL" | "DEMO",
  p: ProviderId,
  ns: string,
  raw: ProviderDiagnostic,
  jitter = Math.random(),
) {
  const d = diagnosticSchema.parse(raw);
  scope(p, ns, origin);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT * FROM memeradar.provider_controls WHERE data_origin=$1 AND provider=$2 AND namespace=$3",
      [origin, p, ns],
    );
    if (found.rowCount) {
      await client.query(
        "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin',$2,true)",
        [found.rows[0].owner_user_id, origin],
      );
      const row = (
        await client.query(
          "SELECT * FROM memeradar.provider_controls WHERE data_origin=$1 AND provider=$2 AND namespace=$3 FOR UPDATE",
          [origin, p, ns],
        )
      ).rows[0];
      const inserted = await client.query(
        "INSERT INTO memeradar.provider_diagnostics(data_origin,provider,namespace,event_key,observed_at,diagnostic) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(data_origin,provider,namespace,event_key) DO NOTHING",
        [origin, p, ns, d.id, d.at, d],
      );
      // Public providers share progressive backoff/circuit state. X keeps its Redis circuit/rate guards.
      if (p !== "x" && inserted.rowCount) {
        await client.query(
          "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin',$2,true)",
          [row.owner_user_id, origin],
        );
        const blocked =
          row.blocked_until && Date.parse(row.blocked_until) > Date.parse(d.at);
        const failures = d.code
          ? Math.min(10000, row.failures + 1)
          : blocked
            ? row.failures
            : 0;
        const until = d.code
          ? new Date(
              Math.max(
                Date.parse(backoffUntil(failures, d.at, d.retryAt, jitter)),
                row.blocked_until ? Date.parse(row.blocked_until) : 0,
              ),
            ).toISOString()
          : blocked
            ? row.blocked_until
            : null;
        await client.query(
          "UPDATE memeradar.provider_controls SET failures=$1,blocked_until=$2,circuit_lease_until=NULL WHERE id=$3 AND data_origin=$4",
          [failures, until, row.id, origin],
        );
      }
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    throw new ProviderError("STORE_UNAVAILABLE");
  } finally {
    client.release();
  }
}
