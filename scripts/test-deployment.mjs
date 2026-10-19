import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import https from "node:https";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const scratch = mkdtempSync(join(tmpdir(), "memeradar-deploy-"));
const project = "memeradar-ops-" + randomUUID().slice(0, 8);
const image =
  process.env.MEMERADAR_TEST_SERVER_IMAGE ?? "memeradar-server:step4";
let monitor;
let checks = 0;
const pass = (label) => {
  checks++;
  console.log("PASS: " + label);
};
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const listener = createServer();
await new Promise((r) => listener.listen(0, "127.0.0.1", r));
const port = listener.address().port;
await new Promise((r) => listener.close(r));
const origin = `https://localhost:${port}`;
const env = {
  ...process.env,
  MEMERADAR_SECRETS_DIR: scratch,
  MEMERADAR_PUBLIC_ORIGIN: origin,
  MEMERADAR_HTTPS_PORT: String(port),
  MEMERADAR_BIND_ADDRESS: "127.0.0.1",
  MEMERADAR_SERVER_IMAGE: image,
  MEMERADAR_ADMIN_EMAIL: "ops-test@example.invalid",
};
const compose = (...args) =>
  run(
    "docker",
    ["compose", "-p", project, "-f", "deploy/compose.yaml", ...args],
    { env },
  );
const sql = (text, database = "memeradar") =>
  compose(
    "exec",
    "-T",
    "db",
    "psql",
    "-X",
    "-q",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    database,
    "-Atc",
    text,
  ).trim();
const databasePassword = randomBytes(32).toString("hex");
const apiPassword = randomBytes(32).toString("hex");
const adminPassword = randomBytes(24).toString("base64url");
for (const [file, value] of Object.entries({
  postgres_password: databasePassword,
  api_database_url: `postgres://memeradar_api:${apiPassword}@db:5432/memeradar`,
  admin_database_url: `postgres://postgres:${databasePassword}@db:5432/memeradar`,
  admin_password: adminPassword,
})) {
  writeFileSync(join(scratch, file), value, { mode: 0o444 });
  chmodSync(join(scratch, file), 0o444);
}
const openssl = (...args) => run("openssl", args);
const caFile = join(scratch, "tls_cert.pem");
openssl(
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-days",
  "1",
  "-subj",
  "/CN=localhost",
  "-addext",
  "subjectAltName=DNS:localhost",
  "-keyout",
  join(scratch, "tls_key.pem"),
  "-out",
  caFile,
);
openssl(
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-nodes",
  "-days",
  "1",
  "-subj",
  "/CN=MemeRadar restore rehearsal",
  "-keyout",
  join(scratch, "backup_key.pem"),
  "-out",
  join(scratch, "backup_cert.pem"),
);
// Parent directory is 0700; mounted secrets must also be readable by container UIDs.
run("chmod", [
  "0444",
  join(scratch, "tls_key.pem"),
  join(scratch, "tls_cert.pem"),
  join(scratch, "backup_cert.pem"),
]);
const ca = readFileSync(caFile);
const request = (path, options = {}) =>
  new Promise((resolveResult, reject) => {
    const req = https.request(
      {
        hostname: "127.0.0.1",
        port,
        servername: "localhost",
        path,
        headers: { Host: `localhost:${port}`, ...options.headers },
        ca,
        timeout: 6000,
        method: options.body ? "POST" : "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (part) => {
          data += part;
        });
        res.on("end", () => {
          try {
            resolveResult({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.end(options.body);
  });
async function until(check, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (await check()) return;
    } catch {
      /* startup/transition pending */
    }
    await setTimeout(500);
  }
  throw new Error("Timeout: " + label);
}
try {
  compose("config", "--quiet");
  compose("up", "-d", "--wait", "db", "redis");
  const container = (service) => compose("ps", "-q", service).trim();
  const dbId = container("db"),
    redisId = container("redis");
  for (const id of [dbId, redisId]) {
    const spec = JSON.parse(run("docker", ["inspect", id]))[0];
    assert.deepEqual(spec.HostConfig.PortBindings ?? {}, {});
    const networks = Object.keys(spec.NetworkSettings.Networks);
    assert.equal(networks.length, 1);
    assert.equal(
      JSON.parse(run("docker", ["network", "inspect", networks[0]]))[0]
        .Internal,
      true,
    );
  }
  assert.match(compose("exec", "-T", "redis", "redis-cli", "ping"), /PONG/);
  pass("PostgreSQL/Redis opérationnels et sans port publié, réseau interne");
  compose(
    "run",
    "--rm",
    "--entrypoint",
    "node",
    "tools",
    "-e",
    `
    const pg=require('pg'), fs=require('node:fs');
    const pool=new pg.Pool({connectionString:fs.readFileSync(process.env.DATABASE_URL_FILE,'utf8'),connectionTimeoutMillis:5000});
    pool.query('SELECT 1').then(()=>pool.end()).catch(async e=>{console.error('SQL_CONNECTION_CHECK_'+e.code);await pool.end();process.exitCode=1});
  `,
  );
  compose("run", "--rm", "tools", "migrate");
  assert.equal(sql("SELECT count(*) FROM memeradar.schema_migrations"), "13");
  compose("run", "--rm", "tools", "migrate");
  compose("run", "--rm", "tools", "bootstrap");
  assert.throws(() => compose("run", "--rm", "tools", "bootstrap"));
  compose("run", "--rm", "tools", "admin");
  pass(
    "Migrations compilées répétables et provisionnement explicite sans écrasement",
  );
  assert.equal(
    sql(
      "SELECT has_table_privilege('memeradar_api','memeradar.server_provider_policies','UPDATE') OR has_table_privilege('memeradar_api','memeradar.users','INSERT')",
    ),
    "f",
  );
  compose("up", "-d", "api");
  await until(
    async () => (await request("/health")).status === 200,
    "HTTPS API",
  );
  const spec = JSON.parse(run("docker", ["inspect", container("api")]))[0];
  assert.equal(spec.Config.User, "node");
  assert.equal(spec.HostConfig.ReadonlyRootfs, true);
  assert.ok(spec.HostConfig.CapDrop.includes("ALL"));
  compose("exec", "-T", "api", "node", "deploy/entrypoint.mjs", "health");
  pass(
    "Image de production sans privilèges, HTTPS validé et contrôle SQL actif",
  );
  await assert.rejects(
    () =>
      new Promise((resolveResult, reject) => {
        const req = https.get(
          {
            hostname: "127.0.0.1",
            port,
            servername: "localhost",
            path: "/health",
          },
          resolveResult,
        );
        req.on("error", reject);
      }),
    (error) =>
      [
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "SELF_SIGNED_CERT_IN_CHAIN",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      ].includes(error.code),
  );
  pass(
    "Certificat local non approuvé refusé sans désactiver la vérification TLS",
  );
  const login = await request("/v1/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.MEMERADAR_ADMIN_EMAIL,
      password: adminPassword,
    }),
  });
  assert.equal(login.status, 200);
  const token = login.data.token;
  assert.equal(typeof token, "string");
  for (const route of ["me", "people", "posts", "sources", "collection"]) {
    assert.equal(
      (
        await request("/v1/" + route, {
          headers: { Authorization: "Bearer " + token },
        })
      ).status,
      200,
      route,
    );
  }
  pass("Connexion et toutes les lectures privées avec le rôle SQL restreint");
  const apiSpec = JSON.stringify(spec);
  assert.ok(
    !apiSpec.includes(databasePassword) && !apiSpec.includes(adminPassword),
  );
  pass("Aucun secret administrateur dans la configuration du conteneur API");
  // Synthetic REAL-origin records only: no provider network call exists in this test.
  sql(
    "UPDATE memeradar.server_collection_controls SET stopped=false; INSERT INTO memeradar.server_provider_policies(data_origin,provider,namespace,enabled,verified_at,paid_consent_at,request_ceiling_micros,daily_limit_micros,monthly_limit_micros,max_requests_day) VALUES('REAL','x','ops_test',true,now(),now(),10,100,1000,150); INSERT INTO memeradar.server_provider_usage(data_origin,provider,namespace,period,reserved_micros,requests) VALUES('REAL','x','ops_test','month:2026-10',70,7)",
  );
  compose("run", "--rm", "-e", "BACKUP_ONCE=true", "backup");
  assert.throws(() =>
    compose(
      "run",
      "--rm",
      "-e",
      "BACKUP_ONCE=true",
      "-e",
      "PGDATABASE=missing_backup_test",
      "backup",
    ),
  );
  const backupContainer = project + "-backup-copy";
  try {
    run("docker", [
      "create",
      "--name",
      backupContainer,
      "--mount",
      `type=volume,source=${project}_backups,target=/backups`,
      "postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4",
    ]);
    run("docker", ["cp", backupContainer + ":/backups/.", scratch]);
  } finally {
    run("docker", ["rm", "-f", "-v", backupContainer]);
  }
  const cms = readdirSync(scratch).find((name) => name.endsWith(".cms"));
  assert.ok(cms);
  assert.equal(
    readdirSync(scratch).filter((name) => name.endsWith(".cms")).length,
    1,
  );
  assert.ok(!readdirSync(scratch).some((name) => name.startsWith(".partial.")));
  const dump = join(scratch, "restore.dump");
  openssl(
    "cms",
    "-decrypt",
    "-binary",
    "-inform",
    "DER",
    "-in",
    join(scratch, cms),
    "-recip",
    join(scratch, "backup_cert.pem"),
    "-inkey",
    join(scratch, "backup_key.pem"),
    "-out",
    dump,
  );
  const corrupted = readFileSync(join(scratch, cms));
  corrupted[corrupted.length - 1] ^= 1;
  writeFileSync(join(scratch, "corrupt.cms"), corrupted);
  assert.throws(() =>
    openssl(
      "cms",
      "-decrypt",
      "-binary",
      "-inform",
      "DER",
      "-in",
      join(scratch, "corrupt.cms"),
      "-recip",
      join(scratch, "backup_cert.pem"),
      "-inkey",
      join(scratch, "backup_key.pem"),
      "-out",
      join(scratch, "invalid.dump"),
    ),
  );
  pass("Sauvegarde réellement chiffrée et altération refusée par AES-GCM");
  // Restore into a second isolated database, never over the source.
  sql("CREATE DATABASE memeradar_rehearsal");
  run("docker", ["cp", dump, dbId + ":/tmp/restore.dump"]);
  compose(
    "exec",
    "-T",
    "db",
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    "memeradar_rehearsal",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "/tmp/restore.dump",
  );
  assert.equal(
    sql(
      "SELECT count(*) FROM memeradar.schema_migrations",
      "memeradar_rehearsal",
    ),
    "13",
  );
  assert.equal(
    sql(
      "SELECT reserved_micros::text||':'||requests::text FROM memeradar.server_provider_usage",
      "memeradar_rehearsal",
    ),
    "70:7",
  );
  assert.equal(
    sql("SELECT count(*) FROM memeradar.users", "memeradar_rehearsal"),
    "1",
  );
  sql(
    readFileSync(join(root, "deploy/restore-safety.sql"), "utf8"),
    "memeradar_rehearsal",
  );
  assert.equal(
    sql(
      "SELECT bool_and(stopped) FROM memeradar.server_collection_controls",
      "memeradar_rehearsal",
    ),
    "t",
  );
  assert.equal(
    sql(
      "SELECT count(*) FROM memeradar.server_provider_policies WHERE enabled OR verified_at IS NOT NULL",
      "memeradar_rehearsal",
    ),
    "0",
  );
  assert.equal(
    sql(
      "SELECT count(*) FROM memeradar.sessions WHERE revoked_at IS NULL",
      "memeradar_rehearsal",
    ),
    "0",
  );
  assert.equal(
    sql(
      "SELECT reserved_micros::text||':'||requests::text FROM memeradar.server_provider_usage",
      "memeradar_rehearsal",
    ),
    "70:7",
  );
  pass(
    "Restauration PostgreSQL réelle ; comptes et réservations conservés, sessions révoquées et collecte arrêtée",
  );
  const stateFile = join(scratch, "monitor.json");
  let monitorLog = "";
  monitor = spawn(process.execPath, ["deploy/monitor.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      MEMERADAR_API_PUBLIC_ORIGIN: origin,
      MEMERADAR_API_ORIGIN: "REAL",
      MEMERADAR_MONITOR_CA_FILE: caFile,
      MEMERADAR_MONITOR_INTERVAL_MS: "1000",
      MEMERADAR_MONITOR_STATE_FILE: stateFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  monitor.stdout.on("data", (part) => {
    monitorLog += part;
  });
  const status = () => JSON.parse(readFileSync(stateFile, "utf8")).status;
  await until(() => status() === "healthy", "monitor healthy");
  compose("stop", "api");
  await until(() => status() === "alert", "monitor outage");
  pass("Panne API simulée détectée : état et journal d’alerte persistés");
  compose("start", "api");
  await until(() => status() === "healthy", "monitor recovery");
  assert.ok(monitorLog.includes('"status":"alert"'));
  pass("Redémarrage et retour à un état sain détectés");
  compose("stop", "db");
  assert.equal((await request("/health")).status, 503);
  pass("Une panne SQL rend la santé API indisponible");
  console.log(
    `PASS: ${checks} contrôles de déploiement ; aucun fournisseur appelé. Certificats de test locaux uniquement.`,
  );
} catch (error) {
  // Scrub generated credentials and connection URLs before any diagnostic.
  console.error("FAIL: test de déploiement : " + (error.code ?? error.name));
  const diagnostic = String(error.stderr ?? error.message ?? "")
    .replaceAll(databasePassword, "[secret de test]")
    .replaceAll(apiPassword, "[secret de test]")
    .replaceAll(adminPassword, "[secret de test]")
    .replace(/(?:https?|postgres(?:ql)?):\/\/\S+/g, "[URL masquée]");
  console.error(diagnostic.slice(-2500));
  process.exitCode = 1;
} finally {
  if (monitor && monitor.exitCode === null && monitor.signalCode === null) {
    monitor.kill("SIGTERM");
    await new Promise((r) => monitor.once("close", r));
  }
  try {
    compose("down", "--volumes", "--remove-orphans");
  } catch {
    process.exitCode = 1;
  }
  rmSync(scratch, { recursive: true, force: true });
}
