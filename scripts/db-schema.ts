import pg from "pg";
import { writeFile, readFile } from "node:fs/promises";
import { inspectSchema, renderSchema } from "../packages/db/schema-tools";
import { format } from "prettier";
if (!process.env.DATABASE_URL) {
  process.stderr.write("DATABASE_URL requis pour une base de test migrée.\n");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  const shape = await inspectSchema(pool),
    source = await format(renderSchema(shape), { parser: "typescript" });
  if (process.argv.includes("--write")) {
    await writeFile("packages/db/schema.ts", source);
    await writeFile(
      "packages/db/schema.snapshot.json",
      JSON.stringify(shape, null, 2) + "\n",
    );
  } else if (source !== (await readFile("packages/db/schema.ts", "utf8"))) {
    process.stderr.write(
      "ORM schema differs from the migrated SQL database.\n",
    );
    process.exitCode = 1;
  }
} catch {
  process.stderr.write(
    "Vérification du schéma indisponible ; détails de connexion masqués.\n",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
