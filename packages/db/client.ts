import type { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { ProviderError } from "../shared/errors";
import { schemaTables } from "./schema";
export const createDatabase = (pool: Pool) =>
  drizzle(pool, { schema: schemaTables });
/** Run with a least-privilege role, never a superuser/BYPASSRLS application role. */
export async function withUserContext<T>(
  pool: Pool,
  userId: string,
  origin: "REAL" | "DEMO",
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      userId,
    )
  )
    throw new ProviderError("INVALID_INPUT");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin',$2,true)",
      [userId, origin],
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error instanceof ProviderError
      ? error
      : new ProviderError("STORE_UNAVAILABLE");
  } finally {
    client.release();
  }
}
