import type { Pool, PoolClient } from "pg";
import { ProviderError } from "../shared/errors";
export type ServerOrigin = "REAL" | "DEMO";
export async function serverTransaction<T>(
  pool: Pool,
  origin: ServerOrigin,
  work: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('memeradar.data_origin',$1,true)", [
      origin,
    ]);
    const value = await work(c);
    await c.query("COMMIT");
    return value;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const lockName = (origin: ServerOrigin) =>
  "memeradar:global-collection:" + origin;
/** Caller owns a transaction. The shared lock serializes admissions with an exclusive stop. */
export async function reserveServerRequest(
  c: PoolClient,
  origin: ServerOrigin,
  provider: "x" | "gecko" | "goplus",
  namespace: string,
  amount?: string,
  now = Date.now(),
) {
  if (origin !== "REAL") return;
  if (
    !/^[a-zA-Z0-9_-]{1,80}$/.test(namespace) ||
    (amount !== undefined && !/^(0|[1-9][0-9]{0,39})$/.test(amount))
  )
    throw new ProviderError("INVALID_INPUT");
  await c.query("SELECT set_config('memeradar.data_origin',$1,true)", [origin]);
  await c.query("SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
    lockName(origin),
  ]);
  const global = await c.query(
    "SELECT stopped FROM memeradar.server_collection_controls WHERE data_origin=$1",
    [origin],
  );
  if (global.rows[0]?.stopped !== false)
    throw new ProviderError("NETWORK_DISABLED");
  const policy = (
    await c.query(
      "SELECT *,request_ceiling_micros::text,daily_limit_micros::text,monthly_limit_micros::text FROM memeradar.server_provider_policies WHERE data_origin=$1 AND provider=$2 AND namespace=$3 FOR UPDATE",
      [origin, provider, namespace],
    )
  ).rows[0];
  const verifiedAt =
    policy?.verified_at instanceof Date ? policy.verified_at.getTime() : NaN;
  const consentAt =
    policy?.paid_consent_at instanceof Date
      ? policy.paid_consent_at.getTime()
      : NaN;
  if (!policy?.enabled || !Number.isFinite(verifiedAt) || verifiedAt > now)
    throw new ProviderError("PRICING_UNKNOWN");
  const cost = BigInt(amount ?? policy.request_ceiling_micros);
  if (
    cost > BigInt(policy.request_ceiling_micros) ||
    (cost > 0n && (!Number.isFinite(consentAt) || consentAt > now))
  )
    throw new ProviderError("PRICING_UNKNOWN");
  const date = new Date(now).toISOString();
  for (const [period, limit] of [
    ["day:" + date.slice(0, 10), policy.daily_limit_micros],
    ["month:" + date.slice(0, 7), policy.monthly_limit_micros],
  ]) {
    const r = await c.query(
      "INSERT INTO memeradar.server_provider_usage(data_origin,provider,namespace,period,reserved_micros,requests) SELECT $1,$2,$3,$4,$5::numeric,1 WHERE $5::numeric<=$6::numeric ON CONFLICT(data_origin,provider,namespace,period) DO UPDATE SET reserved_micros=server_provider_usage.reserved_micros+EXCLUDED.reserved_micros,requests=server_provider_usage.requests+1 WHERE server_provider_usage.reserved_micros+EXCLUDED.reserved_micros<=$6::numeric AND ($7::boolean=false OR server_provider_usage.requests<$8) RETURNING requests",
      [
        origin,
        provider,
        namespace,
        period,
        cost.toString(),
        limit,
        period.startsWith("day:"),
        policy.max_requests_day,
      ],
    );
    if (!r.rowCount) throw new ProviderError("BUDGET_EXCEEDED");
  }
}
export class PgServerControls {
  constructor(
    private pool: Pool,
    readonly origin: ServerOrigin,
  ) {}
  async initialize() {
    return serverTransaction(this.pool, this.origin, async (c) => {
      await c.query(
        "INSERT INTO memeradar.server_collection_controls(data_origin) VALUES($1) ON CONFLICT DO NOTHING",
        [this.origin],
      );
    });
  }
  async stop() {
    return serverTransaction(this.pool, this.origin, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        lockName(this.origin),
      ]);
      await c.query(
        "INSERT INTO memeradar.server_collection_controls(data_origin,stopped) VALUES($1,true) ON CONFLICT(data_origin) DO UPDATE SET stopped=true",
        [this.origin],
      );
      return { origin: this.origin, stopped: true };
    });
  }
  async read() {
    return serverTransaction(this.pool, this.origin, async (c) => {
      const row = (
        await c.query(
          "SELECT stopped FROM memeradar.server_collection_controls WHERE data_origin=$1",
          [this.origin],
        )
      ).rows[0];
      const usage = (
        await c.query(
          `SELECT u.provider,u.namespace,u.period,u.reserved_micros::text,u.requests::text,
 CASE WHEN u.period LIKE 'day:%' THEN p.daily_limit_micros::text ELSE p.monthly_limit_micros::text END AS limit_micros,
 ((CASE WHEN u.period LIKE 'day:%' THEN p.daily_limit_micros ELSE p.monthly_limit_micros END)>0 AND u.reserved_micros*100>=(CASE WHEN u.period LIKE 'day:%' THEN p.daily_limit_micros ELSE p.monthly_limit_micros END)*80)
 OR (u.period LIKE 'day:%' AND u.requests*100>=p.max_requests_day*80) AS warning
 FROM memeradar.server_provider_usage u JOIN memeradar.server_provider_policies p USING(data_origin,provider,namespace) WHERE u.data_origin=$1 ORDER BY u.provider,u.namespace,u.period DESC LIMIT 300`,
          [this.origin],
        )
      ).rows;
      return {
        origin: this.origin,
        stopped: row?.stopped !== false,
        usage,
        accounting: "conservative_reservations_not_invoice",
      };
    });
  }
}
