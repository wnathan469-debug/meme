import type { Pool } from "pg";
/** Synthetic database-only consent for legacy REAL-origin tests using FakeTransport. Never used by runtime code. */
export async function allowTestProvider(pool: Pool, namespace: string) {
  await pool.query(
    "INSERT INTO memeradar.server_collection_controls(data_origin,stopped) VALUES('REAL',false) ON CONFLICT(data_origin) DO UPDATE SET stopped=false",
  );
  const maximum = "9".repeat(39);
  await pool.query(
    "INSERT INTO memeradar.server_provider_policies(data_origin,provider,namespace,enabled,verified_at,paid_consent_at,request_ceiling_micros,daily_limit_micros,monthly_limit_micros,max_requests_day) VALUES('REAL','x',$1,true,now()-interval '1 second',now()-interval '1 second',$2,$2,$2,1000000) ON CONFLICT DO NOTHING",
    [namespace, maximum],
  );
}
