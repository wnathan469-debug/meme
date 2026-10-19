import { readFile } from "node:fs/promises";
// File secrets are injected by the host, never baked into the image.
try {
  const commands = {
    api: "../server-dist/server.js",
    migrate: "../server-dist/migrate.js",
    admin: "../server-dist/admin.js",
    bootstrap: "./bootstrap.mjs",
    health: "./health.mjs",
    monitor: "./monitor.mjs",
  };
  const command = process.argv[2] ?? "api";
  if (!Object.hasOwn(commands, command)) throw new Error();
  for (const name of ["DATABASE_URL", "MEMERADAR_ADMIN_PASSWORD"]) {
    const file = process.env[name + "_FILE"];
    if (!file) continue;
    if (process.env[name]) throw new Error();
    process.env[name] = (await readFile(file, "utf8")).trimEnd();
    if (!process.env[name]) throw new Error();
  }
  // CLI scripts see only their own arguments.
  process.argv = [process.argv[0], commands[command], ...process.argv.slice(3)];
  await import(commands[command]);
} catch {
  process.stderr.write(
    "Commande serveur refusée ; détails et secrets masqués.\n",
  );
  process.exitCode = 1;
}
