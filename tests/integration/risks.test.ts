import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgRiskRepository } from "../../packages/db/risk-repository";
import { observation } from "../../packages/risks/adapters";
import { type RiskIdentity } from "../../packages/risks/model";
import { eventAt } from "../../packages/events/demo-data";
import { createRiskRuntime } from "../../apps/api/risk-runtime";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_risks";
const pool = new pg.Pool({ connectionString: url.toString() });
const owner = "00000000-0000-4000-8000-000000000001";
const id: RiskIdentity = {
  origin: "DEMO",
  chain: "base",
  address: "0xDEMO" + "0".repeat(34) + "42",
};
const repo = new PgRiskRepository(pool, owner, "DEMO");
const p = {
  source: "[DÉMO] Risques",
  url: "https://demo.memeradar.invalid/risks",
  observedAt: eventAt(60),
  fetchedAt: eventAt(60),
  limitations: "Fixture locale, sans certification.",
};
const batch = (
  result: "signal" | "clear" | "error" = "clear",
  at = eventAt(60),
  source = p.source,
) => ({
  ...id,
  observations: [
    observation(
      { ...p, source, observedAt: at, fetchedAt: at },
      "mint",
      result,
      "Élément observé pour le test.",
    ),
  ],
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_risks");
  await migrate(pool);
  const ch = (
    await pool.query(
      "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,name,symbol,first_seen_by_app_at) VALUES('DEMO',$1,$2,'[DÉMO] Test','TEST',$3)",
    [ch.id, id.address, eventAt(8)],
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("starts with insufficient data and stores immutable idempotent dated evidence", async () => {
  expect(
    (await repo.read(id, eventAt(60))).find((r) => r.check === "mint")?.status,
  ).toBe("insufficient_data");
  await repo.store(batch());
  await repo.store(batch());
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM memeradar.risk_findings"))
      .rows[0].n,
  ).toBe(1);
  const r = (await repo.read(id, eventAt(60))).find((r) => r.check === "mint")!;
  expect(r.status).toBe("no_signal_detected");
  expect(r.evidence[0].url).toBe(p.url);
  expect(
    (await repo.read(id, eventAt(59))).find((r) => r.check === "mint")
      ?.evidence,
  ).toEqual([]);
  expect(
    (await repo.read(id, eventAt(66))).find((r) => r.check === "mint")?.status,
  ).toBe("insufficient_data");
});
it("stores source conflicts without overwriting or averaging", async () => {
  await repo.store(batch("signal", eventAt(60), "[DÉMO] Autre source"));
  expect(
    (await repo.read(id, eventAt(60))).find((r) => r.check === "mint")
      ?.explanation,
  ).toContain("contradictoires");
  await repo.store(batch("signal", eventAt(61)));
  expect(
    (await repo.read(id, eventAt(61))).find((r) => r.check === "mint")?.status,
  ).toBe("signal_detected");
  await repo.store(batch("error", eventAt(62)));
  expect(
    (await repo.read(id, eventAt(62))).find((r) => r.check === "mint")?.status,
  ).toBe("signal_detected");
});
it("rejects wrong origins, wrong tokens, invalid owner and altered acquisition evidence", async () => {
  expect(() => new PgRiskRepository(pool, "not-a-user", "DEMO")).toThrow();
  await expect(
    repo.read(
      { ...id, origin: "REAL", address: "0x" + "1".repeat(40) },
      eventAt(60),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.read(
      { ...id, address: "0xDEMO" + "0".repeat(34) + "99" },
      eventAt(60),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    repo.store({
      ...batch(),
      observations: [
        { ...batch().observations[0], url: "https://evil.example/" },
      ],
    }),
  ).rejects.toThrow();
  await expect(repo.store(batch("signal"))).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
});
it("requires explicit refresh opt-in and leaves live provider disabled by default", async () => {
  const r = createRiskRuntime(pool, owner, "DEMO");
  await expect(r.refresh(id)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(r.refresh(id, true)).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  await expect(
    r.refresh({ ...id, origin: "REAL" }, true),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect((await r.read(id, eventAt(60))).length).toBe(17);
  await r.ingest({ ...id, observations: [] });
});
it("reads and stores public risk evidence with a non-bypass application role", async () => {
  await pool.query(
    "CREATE ROLE risk_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO risk_application_test");
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA memeradar TO risk_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=risk_application_test",
  });
  try {
    const r = new PgRiskRepository(scoped, owner, "DEMO");
    expect(
      (await r.read(id, eventAt(60))).find((r) => r.check === "mint")?.status,
    ).toBe("insufficient_data");
    await r.store(batch("signal", eventAt(63)));
    await r.store(batch("signal", eventAt(63)));
    expect(
      (await r.read(id, eventAt(63))).find((r) => r.check === "mint")?.status,
    ).toBe("signal_detected");
  } finally {
    await scoped.end();
  }
});
it("fails closed when a source set exceeds the report bound", async () => {
  for (let n = 0; n < 101; n++)
    await repo.store(batch("clear", eventAt(70), `[DÉMO] source ${n}`));
  await expect(repo.read(id, eventAt(70))).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
});
it("preserves risk history when returning to the existing V1 schema", async () => {
  const before = (
    await pool.query("SELECT count(*)::int AS n FROM memeradar.risk_findings")
  ).rows[0].n;
  await migrate(pool, { rollback: true });
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM memeradar.risk_findings"))
      .rows[0].n,
  ).toBe(before);
  expect(
    (await repo.read(id, eventAt(60))).find((r) => r.check === "mint")?.status,
  ).toBe("insufficient_data");
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(1);
});
