import { PgMarketGate } from "../../packages/db/chart-repository";
import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { request as tlsRequest } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { request as rawHttpRequest } from "node:http";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import pg from "pg";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { migrate } from "../../packages/db/migrations";
import {
  PgAuth,
  hashPassword,
  verifyPassword,
  digest,
} from "../../apps/api/auth";
import { createApiServer } from "../../apps/api/http-server";
import {
  PgServerControls,
  serverTransaction,
  reserveServerRequest,
} from "../../packages/db/server-controls";
import { publicAdmission } from "../../packages/db/source-repository";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { parsePerson } from "../../packages/people/model";
import { DurableXControlStore } from "../../packages/db/x-control-store";
import { MemoryControlStore } from "../../packages/connectors/x/control";
const root = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL! }),
  url = new URL(process.env.TEST_DATABASE_URL!);
url.pathname = "/memeradar_secure_api";
const admin = new pg.Pool({ connectionString: url.toString() });
const appUrl = new URL(url);
appUrl.username = "memeradar_secure_api_app";
const pool = new pg.Pool({ connectionString: appUrl.toString(), max: 10 });
const auth = new PgAuth(pool, "REAL"),
  demoAuth = new PgAuth(pool, "DEMO"),
  controls = new PgServerControls(pool, "REAL");
const logs: unknown[] = [];
const real = createApiServer(pool, {
  origin: "REAL",
  allowLocalHttp: true,
  log: (e) => logs.push(e),
});
const demo = createApiServer(pool, { origin: "DEMO", allowLocalHttp: true });
const password = "Test-only password for isolated API fixture";
let realBase = "",
  demoBase = "",
  owner = "";
const listen = (s: typeof real) =>
  new Promise<string>((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve("http://127.0.0.1:" + (s.address() as AddressInfo).port),
    ),
  );
async function request(
  path: string,
  token?: string,
  body?: unknown,
  base = realBase,
) {
  const r = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: (await r.json()) as any,
    headers: r.headers,
  };
}
const login = () => auth.login({ email: "first@example.invalid", password });
async function policy(
  provider = "x",
  ns = "test",
  cost = "100",
  daily = "200",
  monthly = "500",
  max = 150,
) {
  await admin.query(
    "INSERT INTO memeradar.server_collection_controls(data_origin,stopped) VALUES('REAL',false) ON CONFLICT(data_origin) DO UPDATE SET stopped=false",
  );
  await admin.query(
    "INSERT INTO memeradar.server_provider_policies(data_origin,provider,namespace,enabled,verified_at,paid_consent_at,request_ceiling_micros,daily_limit_micros,monthly_limit_micros,max_requests_day) VALUES('REAL',$1,$2,true,now()-interval '1 second',now()-interval '1 second',$3,$4,$5,$6)",
    [provider, ns, cost, daily, monthly, max],
  );
}
const reserve = (
  provider: "x" | "gecko" | "goplus" = "x",
  ns = "test",
  amount?: string,
  now = Date.now(),
) =>
  serverTransaction(pool, "REAL", (c) =>
    reserveServerRequest(c, "REAL", provider, ns, amount, now),
  );
beforeAll(async () => {
  await root.query("CREATE DATABASE memeradar_secure_api");
  await migrate(admin);
  await admin.query(
    "CREATE ROLE memeradar_secure_api_app LOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await admin.query(
    "GRANT USAGE ON SCHEMA memeradar TO memeradar_secure_api_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO memeradar_secure_api_app",
  );
  await auth.createAdmin({ email: "first@example.invalid", password });
  await auth.createAdmin({ email: "other@example.invalid", password });
  await demoAuth.createAdmin({ email: "first@example.invalid", password });
  owner = (
    await admin.query(
      "SELECT id FROM memeradar.users WHERE data_origin='REAL' AND email='first@example.invalid'",
    )
  ).rows[0].id;
  await new PgPeopleRepository(pool, owner, "REAL").save(
    parsePerson(
      {
        username: "fixture_account",
        privateNote: "Only first owner can read this fixture",
      },
      "REAL",
    ),
    null,
    "unvalidated",
  );
  const demoOwner = (
    await admin.query("SELECT id FROM memeradar.users WHERE data_origin='DEMO'")
  ).rows[0].id;
  await new PgPeopleRepository(pool, demoOwner, "DEMO").save(
    parsePerson({ username: "demo_fixture_account" }, "DEMO"),
    null,
    "unvalidated",
  );
  [realBase, demoBase] = await Promise.all([listen(real), listen(demo)]);
});
beforeEach(async () => {
  await admin.query(
    "DELETE FROM memeradar.server_provider_usage;DELETE FROM memeradar.server_provider_policies;DELETE FROM memeradar.server_collection_controls;DELETE FROM memeradar.server_request_limits;DELETE FROM memeradar.sessions;UPDATE memeradar.users SET disabled=false",
  );
  logs.length = 0;
});
afterAll(async () => {
  real.closeAllConnections();
  demo.closeAllConnections();
  await Promise.all([
    new Promise<void>((r) => real.close(() => r())),
    new Promise<void>((r) => demo.close(() => r())),
  ]);
  await pool.end();
  await admin.end();
  for (let attempt = 0; attempt < 100; attempt++) {
    const count = (
      await root.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname='memeradar_secure_api'",
      )
    ).rows[0].n;
    if (count === 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await root.query("DROP DATABASE memeradar_secure_api");
  await root.query("DROP ROLE memeradar_secure_api_app");
  await root.end();
});
it("uses salted Argon2id, rejects wrong passwords and hostile hash parameters", async () => {
  const a = await hashPassword(password),
    b = await hashPassword(password);
  expect(a).not.toBe(b);
  expect(await verifyPassword(password, a)).toBe(true);
  expect(await verifyPassword("wrong", a)).toBe(false);
  expect(
    await verifyPassword(password, a.replace("m=65536", "m=999999999")),
  ).toBe(false);
  await expect(hashPassword("short")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    auth.createAdmin({ email: "first@example.invalid", password }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("authenticates locally and stores token digests only, with no cookie or secrets in logs", async () => {
  const result = await request("/v1/auth/login", undefined, {
    email: "first@example.invalid",
    password,
  });
  expect(result.status).toBe(200);
  expect(result.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.headers.get("set-cookie")).toBeNull();
  const row = (
    await admin.query("SELECT token_hash,csrf_hash FROM memeradar.sessions")
  ).rows[0];
  expect(row.token_hash).toBe(digest(result.body.token));
  expect(row.csrf_hash).toHaveLength(64);
  expect((await request("/v1/me", result.body.token)).body.userId).toBe(owner);
  expect(JSON.stringify(logs)).not.toContain(password);
  expect(JSON.stringify(logs)).not.toContain(result.body.token);
  expect(JSON.stringify(logs)).not.toContain("first@example.invalid");
});
it("returns the same refusal for unknown accounts, disabled accounts and incorrect passwords", async () => {
  for (const input of [
    { email: "first@example.invalid", password: "wrong" },
    { email: "unknown@example.invalid", password },
  ])
    await expect(auth.login(input)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  await admin.query("UPDATE memeradar.users SET disabled=true WHERE id=$1", [
    owner,
  ]);
  await expect(login()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect((await request("/v1/me")).status).toBe(401);
  expect((await request("/v1/me", "invalid")).status).toBe(401);
});
it("renews by rotating the bearer, revokes old tokens and supports logout", async () => {
  const a = await login(),
    b = await request("/v1/auth/renew", a.token, {});
  expect(b.status).toBe(200);
  expect(b.body.token).not.toBe(a.token);
  expect((await request("/v1/me", a.token)).status).toBe(401);
  const races = await Promise.all([
    auth.renew(b.body.token).then(
      () => true,
      () => false,
    ),
    auth.renew(b.body.token).then(
      () => true,
      () => false,
    ),
  ]);
  expect(races.filter(Boolean)).toHaveLength(1);
  const c = await login();
  expect((await request("/v1/auth/logout", c.token, {})).status).toBe(200);
  expect((await request("/v1/me", c.token)).status).toBe(401);
});
it("rejects expired sessions and caps renewal at an absolute twelve hour lifetime", async () => {
  const a = await login();
  await admin.query(
    "UPDATE memeradar.sessions SET created_at=now()-interval '13 hours',expires_at=now()+interval '1 hour' WHERE token_hash=$1",
    [digest(a.token)],
  );
  await expect(auth.renew(a.token)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  const b = await login();
  await admin.query(
    "UPDATE memeradar.sessions SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [digest(b.token)],
  );
  await expect(auth.authenticate(b.token)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  const c = await login();
  await admin.query(
    "UPDATE memeradar.sessions SET created_at=now()-interval '11 hours 50 minutes' WHERE token_hash=$1",
    [digest(c.token)],
  );
  const next = await auth.renew(c.token);
  expect(Date.parse(next.expiresAt) - Date.now()).toBeLessThan(11 * 60000);
});
it("isolates origins and owners, preserves private notes, and never fills an empty REAL feed with DEMO", async () => {
  const a = await login(),
    d = await demoAuth.login({ email: "first@example.invalid", password });
  expect((await request("/v1/me", a.token, undefined, demoBase)).status).toBe(
    401,
  );
  expect((await request("/v1/me", d.token)).status).toBe(401);
  expect(
    (await request("/v1/people", a.token)).body.data[0].privateNote,
  ).toContain("Only first owner");
  const other = await auth.login({ email: "other@example.invalid", password });
  expect((await request("/v1/people", other.token)).body.data).toEqual([]);
  const feed = await request("/v1/posts", a.token);
  expect(feed.status).toBe(200);
  expect(feed.body.origin).toBe("REAL");
  expect(feed.body.posts).toEqual([]);
  expect(JSON.stringify(feed.body)).not.toContain("DEMO");
  const sources = await request("/v1/sources", a.token);
  expect(
    sources.body.data.every((v: any) => v.status === "not_configured"),
  ).toBe(true);
  expect((await request("/v1/posts?origin=DEMO", a.token)).status).toBe(400);
});
it("rejects hostile origins, hosts, malformed or oversized JSON and unknown fields", async () => {
  let r = await fetch(realBase + "/health", {
    headers: { Origin: "https://evil.invalid" },
  });
  expect(r.status).toBe(403);
  const badHost = await new Promise<number>((resolve) => {
    const req = rawHttpRequest(
      realBase + "/health",
      { headers: { Host: "evil.invalid" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode!));
      },
    );
    req.end();
  });
  expect(badHost).toBe(400);
  r = await fetch(realBase + "/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  expect(r.status).toBe(400);
  r = await fetch(realBase + "/v1/auth/login", {
    method: "POST",
    body: "no json",
  });
  expect(r.status).toBe(415);
  r = await fetch(realBase + "/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "first@example.invalid",
      password: "x".repeat(9000),
    }),
  });
  expect(r.status).toBe(413);
});
it("does not permit client-selected owners, arbitrary routes, resume or fetching providers", async () => {
  const a = await login();
  expect(
    (
      await request("/v1/auth/login", undefined, {
        email: "first@example.invalid",
        password,
        origin: "DEMO",
      })
    ).status,
  ).toBe(400);
  expect(
    (await request("/v1/collection/stop", a.token, { stopped: false })).status,
  ).toBe(400);
  expect((await request("/v1/collection/resume", a.token, {})).status).toBe(
    404,
  );
  expect(
    (await request("/v1/provider/fetch?url=https://api.x.com", a.token)).status,
  ).toBe(400);
  expect((await request("/health")).headers.get("cache-control")).toBe(
    "no-store",
  );
  expect(() => createApiServer(pool, { origin: "REAL" })).toThrow("TLS");
});
it("shares login and API rate limits durably and refuses further attempts", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request("/v1/auth/login", undefined, {
          email: "missing@example.invalid",
          password: "bad",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await request("/v1/auth/login", undefined, {
        email: "first@example.invalid",
        password,
      })
    ).status,
  ).toBe(429);
  const b = new PgAuth(pool, "REAL");
  await b.rate("shared", 1, 60);
  await expect(auth.rate("shared", 1, 60)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
});
it("starts stopped, refuses missing policy, and persists a stop across API instances", async () => {
  await expect(reserve()).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  await controls.initialize();
  expect((await controls.read()).stopped).toBe(true);
  await admin.query(
    "UPDATE memeradar.server_collection_controls SET stopped=false",
  );
  await expect(reserve()).rejects.toMatchObject({ code: "PRICING_UNKNOWN" });
  await policy();
  await reserve();
  const a = await login();
  expect((await request("/v1/collection/stop", a.token, {})).status).toBe(200);
  expect((await new PgServerControls(pool, "REAL").read()).stopped).toBe(true);
  await expect(reserve()).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
});
it("applies exact monetary caps atomically under concurrent requests", async () => {
  await policy("x", "test", "100", "200", "500");
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, () =>
      reserve().then(
        () => true,
        () => false,
      ),
    ),
  );
  expect(outcomes.filter(Boolean)).toHaveLength(2);
  const rows = (await controls.read()).usage;
  expect(
    rows.every((v) => v.reserved_micros === "200" && v.requests === "2"),
  ).toBe(true);
});
it("keeps monthly reservations across day rollover and rolls back partial admission", async () => {
  await policy("x", "test", "100", "100", "150");
  await reserve();
  await expect(
    reserve("x", "test", undefined, Date.now() + 86400000),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  expect((await controls.read()).usage).toHaveLength(2);
});
it("counts even zero-cost reads, requires verified pricing, and rejects unconsented paid policy", async () => {
  await policy("gecko", "test", "0", "0", "0", 2);
  await reserve("gecko");
  await reserve("gecko");
  await expect(reserve("gecko")).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  await admin.query(
    "UPDATE memeradar.server_provider_policies SET verified_at=NULL",
  );
  await expect(reserve("gecko")).rejects.toMatchObject({
    code: "PRICING_UNKNOWN",
  });
  await admin.query(
    "UPDATE memeradar.server_provider_policies SET verified_at='infinity'",
  );
  await expect(reserve("gecko")).rejects.toMatchObject({
    code: "PRICING_UNKNOWN",
  });
  await admin.query(
    "UPDATE memeradar.server_provider_policies SET verified_at=now()-interval '1 second',request_ceiling_micros=1,paid_consent_at='infinity'",
  );
  await expect(reserve("gecko")).rejects.toMatchObject({
    code: "PRICING_UNKNOWN",
  });
  await expect(
    admin.query(
      "UPDATE memeradar.server_provider_policies SET request_ceiling_micros=1,paid_consent_at=NULL",
    ),
  ).rejects.toThrow();
});
it("blocks market access when a source setting is absent and rolls back its financial reservation", async () => {
  await expect(
    new PgMarketGate(pool, "REAL", "unreviewed-provider").reserve(),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  await policy("gecko", "default", "0", "0", "0");
  await expect(
    publicAdmission(pool, "REAL", "gecko", "default", Date.now()),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect((await controls.read()).usage).toEqual([]);
});
it("enforces shared control in the existing durable X reservation path", async () => {
  await policy("x", "runtime", "100", "100", "100");
  const store = new DurableXControlStore(
    pool,
    new MemoryControlStore(),
    "runtime",
    "REAL",
  );
  const value = () => ({
    id: randomUUID(),
    amount: "60",
    limits: [{ key: "day:fixture", amount: "1000" }],
    expiresAt: Date.now() + 60000,
    warningPercent: 80,
    endpoint: "timeline" as const,
    feature: "people" as const,
  });
  await store.reserve(value());
  await expect(store.reserve(value())).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  await controls.stop();
  await expect(store.reserve(value())).rejects.toMatchObject({
    code: "NETWORK_DISABLED",
  });
});
it("waits for an in-flight admission transaction before confirming the stop", async () => {
  await policy();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await reserveServerRequest(client, "REAL", "x", "test");
    let stopped = false;
    const stop = controls.stop().then(() => {
      stopped = true;
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(stopped).toBe(false);
    await client.query("COMMIT");
    await stop;
    await expect(reserve()).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("enforces origin RLS for control and usage even with a least-privilege SQL role", async () => {
  await controls.initialize();
  expect(
    (await pool.query("SELECT * FROM memeradar.server_collection_controls"))
      .rows,
  ).toEqual([]);
  await expect(
    pool.query(
      "INSERT INTO memeradar.server_collection_controls(data_origin) VALUES('DEMO')",
    ),
  ).rejects.toThrow();
});

it("serves HTTPS with a verified test certificate, and rejects untrusted TLS", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "memeradar-api-tls-"));
  const key = path.join(directory, "key.pem"),
    cert = path.join(directory, "cert.pem");
  let server: ReturnType<typeof createApiServer> | undefined;
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=api.test.invalid",
        "-addext",
        "subjectAltName=DNS:api.test.invalid,IP:127.0.0.1",
      ],
      { stdio: "ignore" },
    );
    const certificate = await readFile(cert);
    server = createApiServer(pool, {
      origin: "REAL",
      tls: { key: await readFile(key), cert: certificate },
      publicOrigin: "https://api.test.invalid",
    });
    const address = await listen(server);
    const secure = address.replace("http:", "https:");
    const result = await new Promise<{
      status: number;
      hsts: string | undefined;
    }>((resolve, reject) => {
      const req = tlsRequest(
        secure + "/health",
        {
          ca: certificate,
          servername: "api.test.invalid",
          headers: { Host: "api.test.invalid" },
        },
        (r) => {
          r.resume();
          r.on("end", () =>
            resolve({
              status: r.statusCode!,
              hsts: r.headers["strict-transport-security"] as string,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(result.status).toBe(200);
    expect(result.hsts).toBe("max-age=31536000");
    await expect(
      new Promise((resolve, reject) => {
        const req = tlsRequest(
          secure + "/health",
          {
            servername: "api.test.invalid",
            headers: { Host: "api.test.invalid" },
          },
          resolve,
        );
        req.on("error", reject);
        req.end();
      }),
    ).rejects.toHaveProperty("code", "DEPTH_ZERO_SELF_SIGNED_CERT");
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
    }
    await rm(directory, { recursive: true, force: true });
  }
});

it("runs the actual server command with an unprivileged SQL role and refuses a superuser", async () => {
  const probe = net.createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));
  const baseEnv = {
    PATH: process.env.PATH,
    NODE_ENV: "test",
    MEMERADAR_API_ORIGIN: "REAL",
    MEMERADAR_API_ALLOW_LOCAL_HTTP: "true",
    MEMERADAR_API_PORT: String(port),
  };
  const child = spawn(process.execPath, ["server-dist/server.js"], {
    env: { ...baseEnv, DATABASE_URL: appUrl.toString() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (b) => {
      output += String(b);
      if (output.includes('"status":"listening"')) resolve();
    });
    child.once("exit", () =>
      reject(new Error("Server exited before readiness")),
    );
  });
  try {
    await ready;
    const response = await fetch("http://127.0.0.1:" + port + "/health");
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).origin).toBe("REAL");
    expect((await controls.read()).stopped).toBe(true);
  } finally {
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    await ended;
  }
  let message = "";
  const denied = spawn(process.execPath, ["server-dist/server.js"], {
    env: { ...baseEnv, DATABASE_URL: url.toString() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  denied.stderr.on("data", (b) => {
    message += String(b);
  });
  const [exit] = await once(denied, "exit");
  expect(exit).toBe(1);
  expect(message).toContain("Démarrage API refusé");
  expect(message).not.toContain(url.toString());
});
it("refuses destructive rollback of secure API controls and retains all thirteen migrations", async () => {
  await controls.initialize();
  await expect(migrate(admin, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(13);
  expect((await controls.read()).stopped).toBe(true);
});
