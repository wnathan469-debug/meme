/** PostgreSQL owns money and audit durability; Redis owns transient coordination. */
import type { Pool, PoolClient } from "pg";
import type { ControlStore, Reservation, Usage } from "../connectors/x/control";
import { ProviderError } from "../shared/errors";
const unsigned = (value: string) => /^(0|[1-9][0-9]{0,39})$/.test(value);
export class DurableXControlStore implements ControlStore {
  readonly scope = "shared" as const;
  constructor(
    private readonly pool: Pool,
    private readonly coordination: ControlStore,
    private readonly namespace: string,
    private readonly origin: "REAL" | "DEMO" = "REAL",
  ) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(namespace))
      throw new ProviderError("INVALID_INPUT");
  }
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("STORE_UNAVAILABLE");
    }
  }
  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.safe(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`memeradar:x:${this.origin}:${this.namespace}`],
        );
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  }
  async reserve(value: Reservation): Promise<{ warning: boolean }> {
    if (
      !unsigned(value.amount) ||
      value.limits.length < 1 ||
      value.limits.length > 4 ||
      new Set(value.limits.map((v) => v.key)).size !== value.limits.length ||
      value.limits.some(
        (v) => !unsigned(v.amount) || !/^[-a-zA-Z0-9_:]{1,160}$/.test(v.key),
      ) ||
      !Number.isInteger(value.warningPercent) ||
      value.warningPercent < 1 ||
      value.warningPercent > 100 ||
      !Number.isFinite(value.expiresAt)
    )
      throw new ProviderError("INVALID_INPUT");
    return this.transaction(async (client) => {
      const ids: string[] = [];
      let warning = false;
      for (const limit of [...value.limits].sort((a, b) =>
        a.key.localeCompare(b.key),
      )) {
        await client.query(
          "INSERT INTO memeradar.provider_budgets(data_origin,provider,namespace,budget_key,limit_micros,expires_at) VALUES($1,'x',$2,$3,$4,$5) ON CONFLICT(data_origin,provider,namespace,budget_key) DO NOTHING",
          [
            this.origin,
            this.namespace,
            limit.key,
            limit.amount,
            new Date(value.expiresAt),
          ],
        );
        const row = (
          await client.query(
            "SELECT id,limit_micros::text,spent_micros::text FROM memeradar.provider_budgets WHERE data_origin=$1 AND provider='x' AND namespace=$2 AND budget_key=$3 FOR UPDATE",
            [this.origin, this.namespace, limit.key],
          )
        ).rows[0];
        if (row.limit_micros !== limit.amount)
          throw new ProviderError("STORE_UNAVAILABLE");
        const next = BigInt(row.spent_micros) + BigInt(value.amount);
        if (next > BigInt(limit.amount))
          throw new ProviderError("BUDGET_EXCEEDED");
        warning ||=
          next * 100n >= BigInt(limit.amount) * BigInt(value.warningPercent);
        await client.query(
          "UPDATE memeradar.provider_budgets SET spent_micros=$1 WHERE id=$2 AND data_origin=$3",
          [next.toString(), row.id, this.origin],
        );
        ids.push(row.id);
      }
      const reservation = (
        await client.query(
          "INSERT INTO memeradar.x_cost_reservations(data_origin,namespace,request_id,reserved_micros,expires_at,endpoint,feature) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
          [
            this.origin,
            this.namespace,
            value.id,
            value.amount,
            new Date(value.expiresAt),
            value.endpoint ?? null,
            value.feature ?? null,
          ],
        )
      ).rows[0];
      for (const id of ids)
        await client.query(
          "INSERT INTO memeradar.x_reservation_budgets(data_origin,reservation_id,budget_id) VALUES($1,$2,$3)",
          [this.origin, reservation.id, id],
        );
      return { warning };
    });
  }
  async settle(id: string, actual: string): Promise<void> {
    if (!unsigned(actual)) throw new ProviderError("INVALID_INPUT");
    return this.transaction(async (client) => {
      const row = (
        await client.query(
          "SELECT id,reserved_micros::text,settled_micros::text FROM memeradar.x_cost_reservations WHERE request_id=$1 AND data_origin=$2 AND namespace=$3 FOR UPDATE",
          [id, this.origin, this.namespace],
        )
      ).rows[0];
      if (!row || BigInt(actual) > BigInt(row.reserved_micros))
        throw new ProviderError("STORE_UNAVAILABLE");
      if (row.settled_micros !== null) {
        if (row.settled_micros !== actual)
          throw new ProviderError("STORE_UNAVAILABLE");
        return;
      }
      const refund = (BigInt(row.reserved_micros) - BigInt(actual)).toString();
      await client.query(
        "UPDATE memeradar.provider_budgets b SET spent_micros=spent_micros-$1 FROM memeradar.x_reservation_budgets r WHERE r.reservation_id=$2 AND r.data_origin=$3 AND b.id=r.budget_id AND b.data_origin=r.data_origin",
        [refund, row.id, this.origin],
      );
      await client.query(
        "UPDATE memeradar.x_cost_reservations SET settled_micros=$1 WHERE id=$2 AND data_origin=$3",
        [actual, row.id, this.origin],
      );
    });
  }
  async appendUsage(value: Usage): Promise<void> {
    return this.safe(async () => {
      await this.pool.query(
        "INSERT INTO memeradar.x_usage_ledger(data_origin,namespace,request_id,endpoint,feature,status_code,posts,users_count,cost_micros,estimated,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(data_origin,namespace,request_id) DO NOTHING",
        [
          this.origin,
          this.namespace,
          value.requestId,
          value.endpoint,
          value.feature,
          value.status,
          value.posts,
          value.users,
          value.costMicros,
          value.estimated,
          value.at,
        ],
      );
    });
  }
  async usage(): Promise<Usage[]> {
    return this.safe(async () => {
      const rows = (
        await this.pool.query(
          "SELECT request_id,endpoint,feature,status_code,posts::text,users_count::text,cost_micros::text,estimated,observed_at FROM memeradar.x_usage_ledger WHERE data_origin=$1 AND namespace=$2 ORDER BY observed_at DESC,id DESC LIMIT 10000",
          [this.origin, this.namespace],
        )
      ).rows.reverse();
      return rows.map((row) => ({
        requestId: row.request_id,
        endpoint: row.endpoint,
        feature: row.feature,
        status: row.status_code,
        posts: row.posts === null ? null : Number(row.posts),
        users: row.users_count === null ? null : Number(row.users_count),
        costMicros: row.cost_micros,
        estimated: row.estimated,
        at: row.observed_at.toISOString(),
      }));
    });
  }
  takeRate(...args: Parameters<ControlStore["takeRate"]>) {
    return this.coordination.takeRate(...args);
  }
  deferRate(...args: Parameters<ControlStore["deferRate"]>) {
    return this.coordination.deferRate(...args);
  }
  updateQuota(...args: Parameters<ControlStore["updateQuota"]>) {
    return this.coordination.updateQuota(...args);
  }
  quota(...args: Parameters<ControlStore["quota"]>) {
    return this.coordination.quota(...args);
  }
  enterCircuit(...args: Parameters<ControlStore["enterCircuit"]>) {
    return this.coordination.enterCircuit(...args);
  }
  finishCircuit(...args: Parameters<ControlStore["finishCircuit"]>) {
    return this.coordination.finishCircuit(...args);
  }
  capability(...args: Parameters<ControlStore["capability"]>) {
    return this.coordination.capability(...args);
  }
  setCapability(...args: Parameters<ControlStore["setCapability"]>) {
    return this.coordination.setCapability(...args);
  }
}
