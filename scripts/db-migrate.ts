import pg from "pg";
import { migrate, MigrationError } from "../packages/db/migrations";
const args = process.argv.slice(2),
  rollback = args.includes("--rollback");
const target = args.find((arg) => arg.startsWith("--target="))?.slice(9);
const valid = args.every(
  (arg) => arg === "--rollback" || arg.startsWith("--target="),
);
if (!valid || !process.env.DATABASE_URL) {
  process.stderr.write(
    "Configuration de migration manquante ou arguments invalides. Voir docs/V2_PHASE2.md.\n",
  );
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  });
  pool.on("error", () => {});
  try {
    const changed = await migrate(pool, { target, rollback });
    process.stdout.write(
      JSON.stringify({ direction: rollback ? "down" : "up", changed }) + "\n",
    );
  } catch (error) {
    process.stderr.write(
      (error instanceof MigrationError
        ? error.message
        : "Migration indisponible ; aucun détail de connexion journalisé.") +
        "\n",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
