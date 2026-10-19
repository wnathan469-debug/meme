import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgAlertRepository } from "../../packages/db/alert-repository";
import { defaultRule } from "../../packages/alerts/model";
import {
  demoCandidates,
  ALERT_DEMO_PERSON,
  ALERT_DEMO_SOURCE,
  ALERT_DEMO_TOKEN,
} from "../../packages/alerts/demo-data";
import { eventAt } from "../../packages/events/demo-data";
import { DEMO_EVENT_ID } from "../../packages/events/model";
const root = process.env.TEST_DATABASE_URL!,
  admin = new pg.Pool({ connectionString: root }),
  url = new URL(root);
url.pathname = "/memeradar_alerts";
const pool = new pg.Pool({ connectionString: url.toString() });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const repo = new PgAlertRepository(pool, owner, "DEMO"),
  foreign = new PgAlertRepository(pool, other, "DEMO");
const c = (m = 1) => ({
  ...demoCandidates().find((c) => c.kind === "keyword")!,
  id: `DEMO_ALERT_DB_${m}`,
  at: eventAt(m),
  collectedAt: eventAt(m),
});
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_alerts");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','a@example.invalid','$argon2id$fixture'),($2,'DEMO','b@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
  await pool.query(
    "INSERT INTO memeradar.events(id,data_origin,title,summary,summary_method,first_published_at,first_detected_at,status,source_reliability_level,popularity_level) VALUES($1,'DEMO','[DÉMO] Test','Fixture','manual',$2,$2,'active','D','MODERATE')",
    [DEMO_EVENT_ID, eventAt(0)],
  );
  await pool.query(
    "INSERT INTO memeradar.sources(id,data_origin,type,name,base_url,reliability_tier,reliability_notes) VALUES($1,'DEMO','social_x','[DÉMO] X','https://demo.memeradar.invalid/x','D','Fixture')",
    [ALERT_DEMO_SOURCE],
  );
  const ch = (
    await pool.query(
      "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO memeradar.tokens(id,data_origin,chain_id,contract_address,name,symbol,first_seen_by_app_at) VALUES($1,'DEMO',$2,$3,'[DÉMO] Test','TEST',$4)",
    [ALERT_DEMO_TOKEN, ch.id, "0xDEMO" + "0".repeat(34) + "42", eventAt(0)],
  );
  await pool.query(
    "INSERT INTO memeradar.x_users(data_origin,x_user_id,username,display_name) VALUES('DEMO','DEMO_USER_A','demo_julie','[DÉMO] Julie')",
  );
  await pool.query(
    "INSERT INTO memeradar.tracked_people(id,data_origin,owner_user_id,x_user_id,requested_username,status,validation_status,validated_at) VALUES($1,'DEMO',$2,'DEMO_USER_A','demo_julie','active','validated_via_api',$3)",
    [ALERT_DEMO_PERSON, owner, eventAt(0)],
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("creates private rules and survives concurrent duplicate processing/restart with one delivery", async () => {
  const r = { ...defaultRule(randomUUID()), cooldownSeconds: 0 };
  await repo.save(r);
  expect((await repo.list()).some((a) => a.id === r.id)).toBe(true);
  expect((await repo.read(r.id)).entries).toEqual([]);
  await Promise.all([
    repo.process(r.id, [c()], eventAt(1)),
    new PgAlertRepository(pool, owner, "DEMO").process(r.id, [c()], eventAt(1)),
  ]);
  const s = await repo.read(r.id);
  expect(s.entries).toHaveLength(1);
  expect(s.notifications).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memeradar.notification_deliveries d JOIN memeradar.alerts a ON a.id=d.alert_id WHERE a.rule_id=$1",
        [r.id],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(foreign.read(r.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreign.process(r.id, [c()], eventAt(1))).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(foreign.save(r)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(
    new PgAlertRepository(pool, owner, "REAL").save(r),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(repo.save({ ...r, kind: "event" })).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
});
it("persists suppression reasons, read receipts and false positives without dropping audit evidence", async () => {
  const r = { ...defaultRule(randomUUID()), maxPerHour: 1, cooldownSeconds: 0 };
  await repo.save(r);
  let s = await repo.process(r.id, [c()], eventAt(1));
  s = await repo.feedback(r.id, s.notifications[0].id, "read", eventAt(1));
  expect(s.entries[0].status).toBe("acknowledged");
  s = await repo.feedback(r.id, s.entries[0].id, "false_positive", eventAt(1));
  expect(s.entries[0].status).toBe("false_positive");
  s = await repo.process(r.id, [c(2)], eventAt(2));
  expect(s.entries[1].suppression).toBe("hourly_limit");
  const rows = await pool.query(
    "SELECT status,suppression_reason,feedback_at FROM memeradar.alerts WHERE rule_id=$1 ORDER BY triggered_at",
    [r.id],
  );
  expect(rows.rows[0].status).toBe("dismissed_false_positive");
  expect(rows.rows[0].feedback_at).not.toBeNull();
  expect(rows.rows[1].suppression_reason).toBe("hourly_limit");
  await expect(
    repo.feedback(r.id, "missing", "read", eventAt(2)),
  ).rejects.toThrow();
  await expect(
    repo.feedback(randomUUID(), "missing", "read", eventAt(2)),
  ).rejects.toThrow();
});
it("retains and flushes a digest with the original due date after editing settings", async () => {
  const r = {
    ...defaultRule(randomUUID()),
    delivery: "interval" as const,
    intervalMinutes: 15,
    cooldownSeconds: 0,
  };
  await repo.save(r);
  await repo.process(r.id, [c()], eventAt(1));
  await repo.process(r.id, [c(2)], eventAt(2));
  await repo.save({ ...r, intervalMinutes: 60 });
  const s = await new PgAlertRepository(pool, owner, "DEMO").process(
    r.id,
    [],
    eventAt(15),
  );
  expect(s.notifications).toHaveLength(1);
  expect(s.notifications[0].entryIds).toHaveLength(2);
  expect(
    (await repo.process(r.id, [], eventAt(16))).notifications,
  ).toHaveLength(1);
});
it("automatically suspends a followed person before delivery, even if their rule remains active", async () => {
  const r = {
    ...defaultRule(randomUUID()),
    kind: "person_post" as const,
    personId: ALERT_DEMO_PERSON,
    terms: [],
    delivery: "interval" as const,
  };
  await repo.save(r);
  const p = demoCandidates().find((c) => c.kind === "person_post")!;
  await repo.process(r.id, [p], p.at);
  await pool.query(
    "UPDATE memeradar.tracked_people SET status='paused' WHERE id=$1",
    [ALERT_DEMO_PERSON],
  );
  const s = await repo.process(r.id, [], eventAt(16));
  expect(s.notifications).toHaveLength(0);
  expect(s.entries[0].suppression).toBe("person_paused");
  await expect(foreign.save({ ...r, id: randomUUID() })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("rejects wrong origins, malformed subject identities and clock rollback atomically", async () => {
  const r = { ...defaultRule(randomUUID()), kind: "risk" as const };
  await repo.save(r);
  const risk = demoCandidates().find((c) => c.kind === "risk")!;
  expect((await repo.process(r.id, [risk], risk.at)).entries[0].status).toBe(
    "notified",
  );
  await expect(repo.process(r.id, [], eventAt(1))).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
  await expect(
    repo.process(
      r.id,
      [{ ...risk, origin: "REAL", sourceUrl: "https://x.com" }],
      eventAt(20),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.process(
      r.id,
      [
        {
          ...risk,
          token: { chain: "base", address: "0xDEMO" + "0".repeat(34) + "99" },
        },
      ],
      eventAt(20),
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    repo.process(r.id, Array(101).fill(risk), eventAt(20)),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect((await repo.read(r.id)).entries).toHaveLength(1);
});
it("isolates rules, runtime, history and notifications with a non-bypass database role", async () => {
  await pool.query(
    "CREATE ROLE alert_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO alert_application_test");
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO alert_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=alert_application_test",
  });
  try {
    const mine = new PgAlertRepository(scoped, owner, "DEMO"),
      theirs = new PgAlertRepository(scoped, other, "DEMO"),
      r = defaultRule(randomUUID());
    await mine.save(r);
    await mine.process(r.id, [c()], eventAt(1));
    expect((await mine.read(r.id)).notifications).toHaveLength(1);
    expect(await theirs.list()).toEqual([]);
    const client = await scoped.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin','DEMO',true)",
        [other],
      );
      for (const table of [
        "alert_rules",
        "alert_runtime_states",
        "alerts",
        "notification_deliveries",
        "alert_subject_states",
      ])
        expect(
          (
            await client.query(
              `SELECT count(*)::int AS n FROM memeradar.${table}`,
            )
          ).rows[0].n,
        ).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    await expect(theirs.read(r.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await mine.feedback(
      r.id,
      (await mine.read(r.id)).entries[0].id,
      "false_positive",
      eventAt(1),
    );
  } finally {
    await scoped.end();
  }
});
it("refuses destructive downgrade with alert rules or history while preserving all migration versions", async () => {
  await expect(migrate(pool, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(13);
});
