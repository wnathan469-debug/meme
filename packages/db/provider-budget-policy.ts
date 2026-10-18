import type { PoolClient } from "pg";
import { ProviderError } from "../shared/errors";
/** Caller holds the account advisory lock. Reconcile old unscoped feature spend before admission. */
export async function ensureBudgetLimit(
  c: PoolClient,
  origin: string,
  namespace: string,
  key: string,
  amount: string,
  expiresAt: Date,
  edit = false,
) {
  let row = (
    await c.query(
      "SELECT id,limit_micros::text,spent_micros::text FROM memeradar.provider_budgets WHERE data_origin=$1 AND provider='x' AND namespace=$2 AND budget_key=$3 FOR UPDATE",
      [origin, namespace, key],
    )
  ).rows[0];
  if (row && !edit && row.limit_micros !== amount)
    throw new ProviderError("STORE_UNAVAILABLE");
  const feature = /^feature:(watch|people|conversations):(.+)$/.exec(key);
  let extra = "0";
  if (feature)
    extra = (
      await c.query(
        "SELECT coalesce(sum(coalesce(r.settled_micros,r.reserved_micros)),0)::text AS n FROM memeradar.x_cost_reservations r JOIN memeradar.x_reservation_budgets rb ON rb.reservation_id=r.id AND rb.data_origin=r.data_origin JOIN memeradar.provider_budgets b ON b.id=rb.budget_id AND b.data_origin=rb.data_origin WHERE r.data_origin=$1 AND r.namespace=$2 AND b.provider='x' AND b.namespace=$2 AND b.budget_key=$3 AND (r.feature=$4 OR r.feature IS NULL) AND NOT EXISTS(SELECT 1 FROM memeradar.x_reservation_budgets own WHERE own.reservation_id=r.id AND own.data_origin=r.data_origin AND own.budget_id=$5)",
        [origin, namespace, feature[2], feature[1], row?.id ?? null],
      )
    ).rows[0].n;
  const spent = (BigInt(row?.spent_micros ?? "0") + BigInt(extra)).toString();
  if (BigInt(spent) > BigInt(amount))
    throw new ProviderError("BUDGET_EXCEEDED");
  if (!row)
    row = (
      await c.query(
        "INSERT INTO memeradar.provider_budgets(data_origin,provider,namespace,budget_key,limit_micros,spent_micros,expires_at) VALUES($1,'x',$2,$3,$4,$5,$6) RETURNING id,limit_micros::text,spent_micros::text",
        [origin, namespace, key, amount, spent, expiresAt],
      )
    ).rows[0];
  else if (edit || extra !== "0") {
    await c.query(
      "UPDATE memeradar.provider_budgets SET limit_micros=$1,spent_micros=$2 WHERE id=$3 AND data_origin=$4",
      [amount, spent, row.id, origin],
    );
    row = { ...row, limit_micros: amount, spent_micros: spent };
  }
  if (feature)
    await c.query(
      "INSERT INTO memeradar.x_reservation_budgets(data_origin,reservation_id,budget_id) SELECT r.data_origin,r.id,$5 FROM memeradar.x_cost_reservations r JOIN memeradar.x_reservation_budgets rb ON rb.reservation_id=r.id AND rb.data_origin=r.data_origin JOIN memeradar.provider_budgets b ON b.id=rb.budget_id AND b.data_origin=rb.data_origin WHERE r.data_origin=$1 AND r.namespace=$2 AND b.provider='x' AND b.namespace=$2 AND b.budget_key=$3 AND (r.feature=$4 OR r.feature IS NULL) ON CONFLICT(data_origin,reservation_id,budget_id) DO NOTHING",
      [origin, namespace, feature[2], feature[1], row.id],
    );
  return row as { id: string; limit_micros: string; spent_micros: string };
}
