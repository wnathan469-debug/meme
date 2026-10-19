import pg from "pg";
import { readFile } from "node:fs/promises";
import { createApiServer } from "../apps/api/http-server";
import { PgServerControls } from "../packages/db/server-controls";
try {
  const origin = process.env.MEMERADAR_API_ORIGIN;
  if (origin !== "REAL" && origin !== "DEMO") throw new Error();
  if (!process.env.DATABASE_URL) throw new Error();
  const port = Number(process.env.MEMERADAR_API_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error();
  const cert = process.env.MEMERADAR_API_TLS_CERT_FILE,
    key = process.env.MEMERADAR_API_TLS_KEY_FILE;
  const local =
    process.env.MEMERADAR_API_ALLOW_LOCAL_HTTP === "true" &&
    process.env.NODE_ENV !== "production";
  if ((!cert || !key) && !local) throw new Error();
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  pool.on("error", () => {});
  try {
    const role = (
      await pool.query(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    if (role.rolsuper || role.rolbypassrls) throw new Error();
    if (
      !(
        await pool.query(
          "SELECT 1 FROM memeradar.schema_migrations WHERE version='0013_secure_api'",
        )
      ).rowCount
    )
      throw new Error();
    await new PgServerControls(pool, origin).initialize();
    const server = createApiServer(pool, {
      origin,
      tls:
        cert && key
          ? { cert: await readFile(cert), key: await readFile(key) }
          : undefined,
      allowLocalHttp: local,
      publicOrigin: process.env.MEMERADAR_API_PUBLIC_ORIGIN,
      log: (e) => process.stdout.write(JSON.stringify(e) + "\n"),
    });
    server.listen(port, cert && key ? "0.0.0.0" : "127.0.0.1", () =>
      process.stdout.write(
        JSON.stringify({
          status: "listening",
          port,
          origin,
          collection: "no_worker_started",
        }) + "\n",
      ),
    );
    server.on("error", () => {
      process.stderr.write(
        "API indisponible ; détails de connexion masqués.\n",
      );
      process.exitCode = 1;
      void pool.end();
    });
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      server.close(() => {
        void pool.end();
      });
      server.closeIdleConnections();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  } catch (e) {
    await pool.end();
    throw e;
  }
} catch {
  process.stderr.write(
    "Démarrage API refusé : vérifier origine, TLS, rôle SQL sans privilèges et migration 0013. Aucun secret journalisé.\n",
  );
  process.exitCode = 1;
}
