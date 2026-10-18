import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
const entry = z.object({
  version: z.string().regex(/^\d{4}_[a-z_]+$/),
  upSha256: z.string().regex(/^[a-f0-9]{64}$/),
  downSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const migrationDirectory = fileURLToPath(
  new URL("./migrations/", import.meta.url),
);
export class MigrationError extends Error {
  constructor(readonly code: string) {
    super(`Migration refusée : ${code}.`);
    this.name = "MigrationError";
  }
}
export async function readMigrations(directory = migrationDirectory) {
  const manifest = z
    .array(entry)
    .min(1)
    .parse(
      JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
    );
  if (
    new Set(manifest.map((m) => m.version)).size !== manifest.length ||
    manifest[0].version !== "0001_initial" ||
    manifest.some((m, i) => Number(m.version.slice(0, 4)) !== i + 1)
  )
    throw new MigrationError("INVALID_MANIFEST");
  return Promise.all(
    manifest.map(async (item) => {
      const sources = await Promise.all(
        (["up", "down"] as const).map(async (direction) => {
          const source = await readFile(
            path.join(directory, `${item.version}.${direction}.sql`),
            "utf8",
          );
          if (
            createHash("sha256").update(source).digest("hex") !==
            item[`${direction}Sha256`]
          )
            throw new MigrationError("FILE_CHECKSUM_MISMATCH");
          if (
            !/^BEGIN;$/m.test(source) ||
            !/^COMMIT;\s*$/.test(
              source.slice(source.lastIndexOf("\nCOMMIT;") + 1),
            )
          )
            throw new MigrationError("TRANSACTION_WRAPPER");
          return source
            .replace(/^BEGIN;\r?\n/m, "")
            .replace(/^COMMIT;\s*$/m, "");
        }),
      );
      return { ...item, up: sources[0], down: sources[1] };
    }),
  );
}
async function transaction<T>(
  client: PoolClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
export async function migrate(
  pool: Pool,
  options: { target?: string; rollback?: boolean; directory?: string } = {},
): Promise<string[]> {
  const manifest = await readMigrations(options.directory),
    target =
      options.target ??
      (options.rollback ? "0001_initial" : manifest.at(-1)!.version);
  const targetIndex = manifest.findIndex((item) => item.version === target);
  if (targetIndex < 0) throw new MigrationError("UNKNOWN_TARGET");
  const changes: string[] = [];
  const client = await pool.connect().catch(() => {
    throw new MigrationError("DATABASE_UNAVAILABLE");
  });
  try {
    await client.query("SELECT pg_advisory_lock(716202603)");
    const exists = (
      await client.query(
        "SELECT to_regclass('memeradar.schema_migrations') IS NOT NULL AS present",
      )
    ).rows[0].present;
    if (!exists) {
      if (options.rollback) throw new MigrationError("NO_SCHEMA");
      const schema = (
        await client.query(
          "SELECT to_regnamespace('memeradar') IS NOT NULL AS present",
        )
      ).rows[0].present;
      if (schema) throw new MigrationError("UNRECOGNISED_SCHEMA");
      await transaction(client, async () => {
        await client.query(manifest[0].up);
        await client.query(
          "ALTER TABLE memeradar.schema_migrations ADD COLUMN checksum text, ADD COLUMN down_checksum text",
        );
        await client.query(
          "UPDATE memeradar.schema_migrations SET checksum=$1,down_checksum=$2 WHERE version=$3",
          [manifest[0].upSha256, manifest[0].downSha256, manifest[0].version],
        );
      });
      changes.push(manifest[0].version);
    }
    const columns = (
      await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='memeradar' AND table_name='schema_migrations'",
      )
    ).rows.map((r) => r.column_name);
    if (!columns.includes("checksum") || !columns.includes("down_checksum")) {
      // The sole supported legacy ledger is the shipped V1, which predates checksums.
      const old = (
        await client.query(
          "SELECT version FROM memeradar.schema_migrations ORDER BY version",
        )
      ).rows;
      const count = (
        await client.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='memeradar' AND column_name='data_origin'",
        )
      ).rows[0].n;
      if (old.length !== 1 || old[0].version !== "0001_initial" || count !== 33)
        throw new MigrationError("UNRECOGNISED_LEGACY");
      await transaction(client, async () => {
        await client.query(
          "ALTER TABLE memeradar.schema_migrations ADD COLUMN checksum text, ADD COLUMN down_checksum text",
        );
        await client.query(
          "UPDATE memeradar.schema_migrations SET checksum=$1,down_checksum=$2",
          [manifest[0].upSha256, manifest[0].downSha256],
        );
      });
    }
    const applied = (
      await client.query(
        "SELECT version,checksum,down_checksum FROM memeradar.schema_migrations ORDER BY version",
      )
    ).rows;
    if (
      !applied.length ||
      applied.some(
        (row, i) =>
          !manifest[i] ||
          row.version !== manifest[i].version ||
          row.checksum !== manifest[i].upSha256 ||
          row.down_checksum !== manifest[i].downSha256,
      )
    )
      throw new MigrationError("LEDGER_MISMATCH");
    if (options.rollback) {
      if (targetIndex >= applied.length)
        throw new MigrationError("ROLLBACK_TARGET_NOT_APPLIED");
      // One transaction for the whole downgrade: a blocked lower step undoes every prior step.
      await transaction(client, async () => {
        for (let i = applied.length - 1; i > targetIndex; i--) {
          await client.query(manifest[i].down);
          await client.query(
            "DELETE FROM memeradar.schema_migrations WHERE version=$1",
            [manifest[i].version],
          );
          changes.push(manifest[i].version);
        }
      });
    } else {
      if (targetIndex < applied.length - 1)
        throw new MigrationError("USE_EXPLICIT_ROLLBACK");
      for (let i = applied.length; i <= targetIndex; i++)
        await transaction(client, async () => {
          await client.query(manifest[i].up);
          await client.query(
            "INSERT INTO memeradar.schema_migrations(version,checksum,down_checksum) VALUES($1,$2,$3)",
            [manifest[i].version, manifest[i].upSha256, manifest[i].downSha256],
          );
          changes.push(manifest[i].version);
        });
    }
    return changes;
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("DATABASE_REJECTED");
  } finally {
    let discard = false;
    try {
      await client.query("SELECT pg_advisory_unlock(716202603)");
    } catch {
      discard = true;
    } finally {
      client.release(discard);
    }
  }
}
