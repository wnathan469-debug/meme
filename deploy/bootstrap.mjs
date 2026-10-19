import pg from "pg";
import { readFile } from "node:fs/promises";
// Run migrations first, then this explicit operator command with admin credentials.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
try {
  const apiUrl = new URL(
    await readFile("/run/secrets/api_database_url", "utf8"),
  );
  const adminUrl = new URL(process.env.DATABASE_URL);
  if (
    !["postgres:", "postgresql:"].includes(apiUrl.protocol) ||
    decodeURIComponent(apiUrl.username) !== "memeradar_api" ||
    !apiUrl.password ||
    apiUrl.host !== adminUrl.host ||
    apiUrl.pathname !== adminUrl.pathname
  )
    throw new Error();
  const role = await pool.query(
    "SELECT 1 FROM pg_roles WHERE rolname='memeradar_api'",
  );
  if (role.rowCount) throw new Error(); // No implicit password reset on replay.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL standard_conforming_strings = on");
    const password = decodeURIComponent(apiUrl.password).replaceAll("'", "''");
    await client.query(
      "CREATE ROLE memeradar_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '" +
        password +
        "'",
    );
    await client.query(
      await readFile(new URL("./api-role.sql", import.meta.url), "utf8"),
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  process.stdout.write(
    "Rôle API créé ; politiques financières non modifiables.\n",
  );
} catch {
  process.stderr.write("Provisionnement SQL refusé ; aucun secret affiché.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
