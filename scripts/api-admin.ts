import pg from "pg";
import { PgAuth } from "../apps/api/auth";
try {
  const origin = process.env.MEMERADAR_API_ORIGIN;
  if (!process.env.DATABASE_URL || (origin !== "REAL" && origin !== "DEMO"))
    throw new Error();
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await new PgAuth(pool, origin).createAdmin({
      email: process.env.MEMERADAR_ADMIN_EMAIL,
      password: process.env.MEMERADAR_ADMIN_PASSWORD,
    });
    process.stdout.write("Administrateur créé ; aucun mot de passe affiché.\n");
  } finally {
    await pool.end();
  }
} catch {
  process.stderr.write(
    "Création refusée ; vérifier les variables sécurisées et l’absence de compte existant.\n",
  );
  process.exitCode = 1;
}
