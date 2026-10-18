import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { migrate } from "../../packages/db/migrations";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Use npm run test:db:v2");
const pool = new pg.Pool({
  connectionString: url,
  max: 8,
  connectionTimeoutMillis: 1000,
});
beforeAll(async () => {
  for (let i = 0; i < 50; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("PostgreSQL not ready");
});
afterAll(async () => pool.end());
it("upgrades legacy populated V1, repeats safely, and preserves original data", async () => {
  const initial = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.TEST_DB_CONTAINER!,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "memeradar_test",
    ],
    {
      input: await import("node:fs/promises").then((fs) =>
        fs.readFile("packages/db/migrations/0001_initial.up.sql", "utf8"),
      ),
      encoding: "utf8",
    },
  );
  expect(typeof initial).toBe("string");
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES('00000000-0000-4000-8000-000000000001','DEMO','fixture@example.invalid','$argon2id$fixture')",
  );
  await pool.query(`
 INSERT INTO memeradar.chains(id,data_origin,slug,family,evm_chain_id,explorer_url) VALUES('00000000-0000-4000-8000-000000000010','DEMO','ethereum','evm',1,'https://demo.memeradar.invalid/explorer');
 INSERT INTO memeradar.tokens(id,data_origin,chain_id,contract_address,first_seen_by_app_at,total_supply_raw) VALUES('00000000-0000-4000-8000-000000000011','DEMO','00000000-0000-4000-8000-000000000010','0xDEMO'||repeat('0',34)||'23',now(),123456789012345678901234567890);
 INSERT INTO memeradar.alert_rules(id,data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality) VALUES('00000000-0000-4000-8000-000000000012','DEMO','00000000-0000-4000-8000-000000000001','attention_acceleration','{}',ARRAY['in_app'],60,'WEAK',0.5);
 INSERT INTO memeradar.alerts(data_origin,rule_id,token_id,triggered_at,reason,observed_data,sources,fingerprint,status) VALUES('DEMO','00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011',now(),'Fixture V1','{}','[]','v1-preserved','pending');
 `);
  expect(await migrate(pool)).toHaveLength(5);
  expect(await migrate(pool)).toEqual([]);
  expect(
    (
      await pool.query(
        "SELECT total_supply_raw::text FROM memeradar.tokens WHERE id='00000000-0000-4000-8000-000000000011'",
      )
    ).rows[0].total_supply_raw,
  ).toBe("123456789012345678901234567890");
  expect(
    (
      await pool.query(
        "SELECT fingerprint FROM memeradar.alerts WHERE fingerprint='v1-preserved'",
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM memeradar.users")).rows[0]
      .n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='memeradar' AND column_name='data_origin' AND is_nullable='NO'",
      )
    ).rows[0].n,
  ).toBe(55);
});
it("rolls back only V2, retains V1 data, then supports two concurrent upgrades", async () => {
  expect(await migrate(pool, { rollback: true })).toHaveLength(5);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM memeradar.users")).rows[0]
      .n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(1);
  const results = await Promise.all([migrate(pool), migrate(pool)]);
  expect(results.flat()).toHaveLength(5);
});

it("matches the generated complete ORM snapshot to authoritative SQL", async () => {
  const { inspectSchema, renderSchema } =
    await import("../../packages/db/schema-tools");
  const { writeFile, readFile } = await import("node:fs/promises");
  const { format } = await import("prettier");
  const shape = await inspectSchema(pool),
    source = await format(renderSchema(shape), { parser: "typescript" });
  if (process.env.GENERATE_DB_SCHEMA === "1") {
    await writeFile("packages/db/schema.ts", source);
    await writeFile(
      "packages/db/schema.snapshot.json",
      JSON.stringify(shape, null, 2) + "\n",
    );
  }
  expect(source).toBe(await readFile("packages/db/schema.ts", "utf8"));
  expect(shape).toEqual(
    JSON.parse(await readFile("packages/db/schema.snapshot.json", "utf8")),
  );
});

const owner = "00000000-0000-4000-8000-000000000001";
it("indexes origins, timestamps and composite foreign keys across all V2 tables", async () => {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='memeradar' AND c.contype='f' AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.conrelid AND a.attname='data_origin' AND a.attnum=ANY(c.conkey))`,
  );
  expect(result.rows[0].n).toBe(0);
  const missing = await pool.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='data_origin' WHERE n.nspname='memeradar' AND c.relkind='r' AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)`,
  );
  expect(missing.rows).toEqual([]);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='memeradar' AND column_name='updated_at' AND is_nullable='NO'",
      )
    ).rows[0].n,
  ).toBe(55);
});
it("refuses a downgrade atomically if any V2 row would be lost", async () => {
  await pool.query(
    "INSERT INTO memeradar.x_posts(data_origin,x_post_id,text,collection_mode) VALUES('DEMO','DEMO_ROLLBACK','Fixture','lookup')",
  );
  await expect(migrate(pool, { rollback: true })).rejects.toMatchObject({
    code: "DATABASE_REJECTED",
  });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
      )
    ).rows[0].n,
  ).toBe(6);
  expect(
    (
      await pool.query(
        "SELECT to_regclass('memeradar.provider_budgets') IS NOT NULL AS present",
      )
    ).rows[0].present,
  ).toBe(true);
  await pool.query(
    "DELETE FROM memeradar.x_posts WHERE x_post_id='DEMO_ROLLBACK'",
  );
});
async function rejected(
  client: pg.PoolClient,
  statement: string,
  values: unknown[],
  code: string,
) {
  await client.query("SAVEPOINT expected_rejection");
  try {
    await expect(client.query(statement, values)).rejects.toMatchObject({
      code,
    });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
  }
}
it("keeps immutable X identity, username history, orphan references and multi-mode deduplication", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = (
      await client.query(
        "INSERT INTO memeradar.x_users(data_origin,x_user_id,username,display_name) VALUES('DEMO','DEMO_PERSON','demo_person','[DÉMO] Personne') RETURNING id",
      )
    ).rows[0];
    await client.query(
      "INSERT INTO memeradar.x_username_history(data_origin,x_user_id,username,observed_at) VALUES('DEMO','DEMO_PERSON','demo_before',now())",
    );
    await client.query(
      "UPDATE memeradar.x_users SET username='demo_after' WHERE id=$1",
      [user.id],
    );
    await rejected(
      client,
      "UPDATE memeradar.x_users SET x_user_id='DEMO_CHANGED' WHERE id=$1",
      [user.id],
      "23514",
    );
    await rejected(
      client,
      "UPDATE memeradar.x_users SET data_origin='REAL' WHERE id=$1",
      [user.id],
      "23514",
    );
    const post = (
      await client.query(
        "INSERT INTO memeradar.x_posts(data_origin,x_post_id,author_x_user_id,text,collection_mode,in_reply_to_post_id) VALUES('DEMO','DEMO_REPLY','DEMO_PERSON','[DÉMO] Réponse','search','DEMO_MISSING') RETURNING id",
      )
    ).rows[0];
    await client.query(
      "INSERT INTO memeradar.x_post_references(data_origin,post_id,referenced_x_post_id,reference_type) VALUES('DEMO',$1,'DEMO_MISSING','replied_to')",
      [post.id],
    );
    await client.query(
      "INSERT INTO memeradar.x_posts(data_origin,x_post_id,text,collection_mode) VALUES('DEMO','DEMO_REPLY','[DÉMO] Réponse','stream') ON CONFLICT(data_origin,x_post_id) DO UPDATE SET collection_mode=EXCLUDED.collection_mode",
    );
    expect(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM memeradar.x_posts WHERE x_post_id='DEMO_REPLY'",
        )
      ).rows[0].n,
    ).toBe(1);
    await rejected(
      client,
      "INSERT INTO memeradar.x_posts(data_origin,x_post_id,author_x_user_id,collection_mode) VALUES('REAL','123','DEMO_PERSON','search')",
      [],
      "23514",
    );
    const real = (
      await client.query(
        "INSERT INTO memeradar.x_posts(data_origin,x_post_id,text,collection_mode) VALUES('REAL','123','Synthetic local fixture','lookup') RETURNING id",
      )
    ).rows[0];
    await rejected(
      client,
      "INSERT INTO memeradar.x_post_metrics_history(data_origin,post_id,observed_at) VALUES('DEMO',$1,now())",
      [real.id],
      "23503",
    );
    await client.query(
      "INSERT INTO memeradar.conversations(data_origin,conversation_id,reported_reply_count,retrieved_reply_count) VALUES('DEMO','DEMO_MISSING',120,10)",
    );
    expect(
      (
        await client.query(
          "SELECT coverage_ratio::text AS ratio FROM memeradar.conversations WHERE conversation_id='DEMO_MISSING'",
        )
      ).rows[0].ratio,
    ).toMatch(/^0\.0833/);
    await rejected(
      client,
      "INSERT INTO memeradar.conversations(data_origin,conversation_id,root_post_id) VALUES('DEMO','DEMO_OTHER',$1)",
      [post.id],
      "23514",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("isolates private notes and categories by owner and mode with RLS", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES('00000000-0000-4000-8000-000000000002','DEMO','other@example.invalid','$argon2id$fixture')",
    );
    await client.query(
      "INSERT INTO memeradar.person_categories(id,data_origin,owner_user_id,name) VALUES('00000000-0000-4000-8000-000000000003','DEMO',$1,'[DÉMO] Catégorie')",
      [owner],
    );
    await rejected(
      client,
      "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username,category_id) VALUES('DEMO','00000000-0000-4000-8000-000000000002','demo_wrong','00000000-0000-4000-8000-000000000003')",
      [],
      "23503",
    );
    await client.query(
      "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username,private_note) VALUES('DEMO',$1,'demo_pending','private local fixture')",
      [owner],
    );
    await rejected(
      client,
      "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username,validation_status) VALUES('DEMO',$1,'demo_unverified','validated_via_api')",
      [owner],
      "23514",
    );
    await client.query(
      "CREATE ROLE memeradar_test_reader NOLOGIN NOSUPERUSER NOBYPASSRLS",
    );
    await client.query(
      "GRANT USAGE ON SCHEMA memeradar TO memeradar_test_reader",
    );
    await client.query(
      "GRANT SELECT,INSERT ON memeradar.tracked_people,memeradar.person_categories TO memeradar_test_reader",
    );
    await client.query("SET LOCAL ROLE memeradar_test_reader");
    expect(
      (await client.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
    await client.query(
      "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin','DEMO',true)",
      [owner],
    );
    expect(
      (await client.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([{ private_note: "private local fixture" }]);
    await client.query(
      "SELECT set_config('memeradar.user_id','00000000-0000-4000-8000-000000000002',true)",
    );
    expect(
      (await client.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
    await rejected(
      client,
      "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username) VALUES('DEMO',$1,'demo_forbidden')",
      [owner],
      "42501",
    );
    await client.query(
      "SELECT set_config('memeradar.user_id',$1,true),set_config('memeradar.data_origin','REAL',true)",
      [owner],
    );
    expect(
      (await client.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
it("rejects invalid OHLC, NaN, negative counts and conflicting chart subjects", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const chain = (
      await client.query(
        "INSERT INTO memeradar.chains(data_origin,slug,family,evm_chain_id,explorer_url) VALUES('DEMO','base','evm',8453,'https://demo.memeradar.invalid/explorer') RETURNING id",
      )
    ).rows[0];
    const token = (
      await client.query(
        "INSERT INTO memeradar.tokens(data_origin,chain_id,contract_address,first_seen_by_app_at) VALUES('DEMO',$1,'0xDEMO'||repeat('0',35)||'1',now()) RETURNING id",
        [chain.id],
      )
    ).rows[0];
    await client.query(
      "INSERT INTO memeradar.pools(data_origin,token_id,dex,pool_address,quote_token,lp_locked_status,last_updated_at) VALUES('DEMO',$1,'demo','DEMO_POOL','DEMO_QUOTE','unknown',now())",
      [token.id],
    );
    const insert =
      "INSERT INTO memeradar.price_candles(data_origin,token_id,pool_address,interval,bucket_start,open,high,low,close,provider,fetched_at) VALUES('DEMO',$1,'DEMO_POOL','1m',now(),$2,$3,$4,$5,'demo',now())";
    await client.query(insert, [
      token.id,
      "0.000000000000000000123456789",
      "0.000000000000000000123456790",
      "0.000000000000000000123456788",
      "0.000000000000000000123456789",
    ]);
    for (const [open, high, low, close] of [
      ["2", "1", "1", "2"],
      ["NaN", "2", "1", "2"],
      ["-1", "2", "0", "1"],
    ])
      await rejected(
        client,
        insert,
        [token.id, open, high, low, close],
        "23514",
      );
    await rejected(
      client,
      "INSERT INTO memeradar.token_chart_markers(data_origin,token_id,marker_type,occurred_at,label) VALUES('DEMO',$1,'x_post',now(),'No reference')",
      [token.id],
      "23514",
    );
    await rejected(
      client,
      "INSERT INTO memeradar.x_post_metrics_history(data_origin,post_id,observed_at,likes) VALUES('DEMO',gen_random_uuid(),now(),-1)",
      [],
      "23514",
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("persists exact budget reservations under concurrency and across a fresh store", async () => {
  const { DurableXControlStore } =
    await import("../../packages/db/x-control-store");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { randomUUID } = await import("node:crypto");
  const namespace = randomUUID(),
    stores = [
      new DurableXControlStore(pool, new MemoryControlStore(), namespace),
      new DurableXControlStore(pool, new MemoryControlStore(), namespace),
    ];
  const ids = Array.from({ length: 40 }, () => randomUUID());
  const reservation = (id: string, amount = "1", limit = "20") => ({
    id,
    amount,
    limits: [
      { key: "day:2026-10-18", amount: limit },
      { key: "month:2026-10", amount: limit },
    ],
    warningPercent: 80,
    expiresAt: Date.now() + 86400000,
  });
  const results = await Promise.allSettled(
    ids.map((id, i) => stores[i % 2].reserve(reservation(id))),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
  expect(
    results
      .filter((r) => r.status === "rejected")
      .every(
        (r) => r.status === "rejected" && r.reason.code === "BUDGET_EXCEEDED",
      ),
  ).toBe(true);
  const accepted = ids[results.findIndex((r) => r.status === "fulfilled")];
  await stores[0].settle(accepted, "0");
  await stores[1].settle(accepted, "0");
  await expect(stores[0].settle(accepted, "1")).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
  const fresh = new DurableXControlStore(
    pool,
    new MemoryControlStore(),
    namespace,
  );
  const next = randomUUID();
  await fresh.reserve(reservation(next));
  await expect(fresh.reserve(reservation(randomUUID()))).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  const row = (
    await pool.query(
      "SELECT spent_micros::text FROM memeradar.provider_budgets WHERE namespace=$1 ORDER BY budget_key",
      [namespace],
    )
  ).rows;
  expect(row).toEqual([{ spent_micros: "20" }, { spent_micros: "20" }]);
  await fresh.settle(next, "1");
  await expect(
    pool.query(
      "UPDATE memeradar.x_cost_reservations SET settled_micros=0 WHERE request_id=$1 AND namespace=$2",
      [next, namespace],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const usage = {
    requestId: next,
    endpoint: "recent",
    feature: "watch" as const,
    status: 200,
    posts: 1,
    users: 0,
    costMicros: "1",
    estimated: true,
    at: new Date().toISOString(),
  };
  await fresh.appendUsage(usage);
  await fresh.appendUsage(usage);
  expect(await fresh.usage()).toEqual([usage]);
  await expect(
    fresh.appendUsage({ ...usage, costMicros: "2" }),
  ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
  await expect(
    fresh.reserve(reservation(randomUUID(), "1", "21")),
  ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
  await expect(
    new DurableXControlStore(
      pool,
      new MemoryControlStore(),
      "different",
    ).settle(next, "0"),
  ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
  const huge = new DurableXControlStore(
    pool,
    new MemoryControlStore(),
    randomUUID(),
  );
  const large = reservation(
    randomUUID(),
    "900719925474099300000000",
    "900719925474099300000001",
  );
  await huge.reserve(large);
  await huge.reserve({ ...large, id: randomUUID(), amount: "1" });
  await expect(
    huge.reserve({ ...large, id: randomUUID(), amount: "1" }),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  await huge.settle(large.id, "900719925474099299999999");
  await huge.reserve({ ...large, id: randomUUID(), amount: "1" });
});
it("queries all mapped data through Drizzle without converting exact amounts to Number", async () => {
  const { createDatabase } = await import("../../packages/db/client");
  const { providerBudgets, users } = await import("../../packages/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = createDatabase(pool);
  expect(
    (
      await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, owner))
    )[0].email,
  ).toBe("fixture@example.invalid");
  const rows = await db
    .select({ spent: providerBudgets.spentMicros })
    .from(providerBudgets);
  expect(rows.some((row) => row.spent === "900719925474099300000001")).toBe(
    true,
  );
  expect(rows.every((row) => typeof row.spent === "string")).toBe(true);
});
it("rejects modified files, altered applied checksums and unknown ledger versions before mutation", async () => {
  const { mkdtemp, cp, readFile, writeFile, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { migrationDirectory } = await import("../../packages/db/migrations");
  const directory = await mkdtemp(path.join(tmpdir(), "memeradar-migration-"));
  try {
    await cp(migrationDirectory, directory, { recursive: true });
    const filename = path.join(directory, "0002_x_identity_collection.up.sql");
    await writeFile(
      filename,
      (await readFile(filename, "utf8")) + "\n-- changed\n",
    );
    await expect(migrate(pool, { directory })).rejects.toMatchObject({
      code: "FILE_CHECKSUM_MISMATCH",
    });
    const original = (
      await pool.query(
        "SELECT checksum FROM memeradar.schema_migrations WHERE version='0002_x_identity_collection'",
      )
    ).rows[0].checksum;
    await pool.query(
      "UPDATE memeradar.schema_migrations SET checksum='invalid' WHERE version='0002_x_identity_collection'",
    );
    await expect(migrate(pool)).rejects.toMatchObject({
      code: "LEDGER_MISMATCH",
    });
    await pool.query(
      "UPDATE memeradar.schema_migrations SET checksum=$1 WHERE version='0002_x_identity_collection'",
      [original],
    );
    await pool.query(
      "INSERT INTO memeradar.schema_migrations(version,checksum,down_checksum) VALUES('9999_unknown','x','x')",
    );
    await expect(migrate(pool)).rejects.toMatchObject({
      code: "LEDGER_MISMATCH",
    });
    await pool.query(
      "DELETE FROM memeradar.schema_migrations WHERE version='9999_unknown'",
    );
    expect(await migrate(pool)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("recovers from a deliberately failing V2 transaction on a fresh database", async () => {
  const { mkdtemp, cp, readFile, writeFile, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { createHash } = await import("node:crypto");
  const { migrationDirectory } = await import("../../packages/db/migrations");
  await pool.query("CREATE DATABASE memeradar_v2_failure");
  const otherUrl = new URL(url!);
  otherUrl.pathname = "/memeradar_v2_failure";
  const other = new pg.Pool({ connectionString: otherUrl.toString(), max: 2 });
  const directory = await mkdtemp(path.join(tmpdir(), "memeradar-broken-"));
  try {
    await migrate(other, { target: "0001_initial" });
    await cp(migrationDirectory, directory, { recursive: true });
    const file = path.join(directory, "0002_x_identity_collection.up.sql"),
      text = (await readFile(file, "utf8")).replace(
        "COMMIT;",
        "SELECT 1/0;\nCOMMIT;",
      );
    await writeFile(file, text);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8"),
    );
    manifest[1].upSha256 = createHash("sha256").update(text).digest("hex");
    await writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify(manifest),
    );
    await expect(migrate(other, { directory })).rejects.toMatchObject({
      code: "DATABASE_REJECTED",
    });
    expect(
      (
        await other.query(
          "SELECT to_regclass('memeradar.x_users') IS NULL AS absent",
        )
      ).rows[0].absent,
    ).toBe(true);
    expect(
      (
        await other.query(
          "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await migrate(other)).toHaveLength(5);
  } finally {
    await other.end();
    await rm(directory, { recursive: true, force: true });
  }
});

it("composes PostgreSQL and Redis privately without any X network probe", async () => {
  const { createXRuntime } = await import("../../apps/api/x-runtime");
  const { config } = await import("../fixtures/x/test-tools");
  const { Secret } = await import("../../packages/shared/runtime");
  const runtime = await createXRuntime(
    await config({
      databaseUrl: new Secret(url!),
      redisUrl: new Secret(process.env.TEST_REDIS_URL!),
    }),
  );
  try {
    expect(runtime.status).toBe("ready");
    expect((await runtime.provider!.capabilities()).recent.state).toBe(
      "untested",
    );
  } finally {
    await runtime.close();
  }
});
it("restores a full backup with data, checksums and charged budgets intact", async () => {
  await pool.query("CREATE DATABASE memeradar_v2_restore");
  const dump = execFileSync(
    "docker",
    [
      "exec",
      process.env.TEST_DB_CONTAINER!,
      "pg_dump",
      "-U",
      "postgres",
      "-Fc",
      "memeradar_test",
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.TEST_DB_CONTAINER!,
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      "memeradar_v2_restore",
      "--no-owner",
      "--exit-on-error",
    ],
    { input: dump },
  );
  const restoredUrl = new URL(url!);
  restoredUrl.pathname = "/memeradar_v2_restore";
  const restored = new pg.Pool({ connectionString: restoredUrl.toString() });
  try {
    expect(await migrate(restored)).toEqual([]);
    expect(
      (await restored.query("SELECT count(*)::int AS n FROM memeradar.users"))
        .rows[0].n,
    ).toBe(1);
    expect(
      (
        await restored.query(
          "SELECT count(*)::int AS n FROM memeradar.x_usage_ledger",
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
    expect(
      (
        await restored.query(
          "SELECT spent_micros::text FROM memeradar.provider_budgets WHERE spent_micros>9007199254740992",
        )
      ).rows.every((r) => r.spent_micros === "900719925474099300000001"),
    ).toBe(true);
  } finally {
    await restored.end();
  }
});

it("records a durable request intent before a mock X response, then settles and journals exact cost", async () => {
  const { DurableXControlStore } =
    await import("../../packages/db/x-control-store");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { XApiClient } = await import("../../packages/connectors/x/client");
  const { FakeTransport, FakeClock, config } =
    await import("../fixtures/x/test-tools");
  const { randomUUID } = await import("node:crypto");
  const namespace = randomUUID(),
    store = new DurableXControlStore(pool, new MemoryControlStore(), namespace),
    transport = new FakeTransport();
  const client = new XApiClient(await config(), transport, store, {
    clock: new FakeClock(),
  });
  await client.searchRecent("synthetic fixture");
  expect(transport.calls).toHaveLength(1);
  const row = (
    await pool.query(
      "SELECT endpoint,feature,reserved_micros::text,settled_micros::text FROM memeradar.x_cost_reservations WHERE namespace=$1",
      [namespace],
    )
  ).rows[0];
  expect(row).toEqual({
    endpoint: "recent",
    feature: "watch",
    reserved_micros: "33",
    settled_micros: "6",
  });
  expect((await store.usage())[0]).toMatchObject({
    endpoint: "recent",
    costMicros: "6",
    posts: 1,
    users: 1,
  });
});

it("preserves the complete V1 integrity suite on the expanded schema", async () => {
  const { readFile } = await import("node:fs/promises");
  const sql = (await readFile("tests/integration/database.sql", "utf8"))
    .replaceAll("count(*)=33", "count(*)=55")
    .replace(
      "33 origin-scoped application tables",
      "55 origin-scoped application tables",
    );
  const output = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.TEST_DB_CONTAINER!,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "memeradar_test",
    ],
    { input: sql, encoding: "utf8" },
  );
  expect(output).toContain("55 origin-scoped application tables");
  expect(output).toContain("all foreign keys contain origin");
});

it("sets and clears private user context on pooled connections, including rollback", async () => {
  const { withUserContext } = await import("../../packages/db/client");
  await pool.query(
    "CREATE ROLE memeradar_context_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query("GRANT USAGE ON SCHEMA memeradar TO memeradar_context_test");
  await pool.query(
    "GRANT SELECT ON memeradar.tracked_people TO memeradar_context_test",
  );
  await pool.query(
    "INSERT INTO memeradar.tracked_people(data_origin,owner_user_id,requested_username,private_note) VALUES('DEMO',$1,'demo_context','local context fixture')",
    [owner],
  );
  const scoped = new pg.Pool({
    connectionString: url,
    options: "-c role=memeradar_context_test",
    max: 1,
  });
  try {
    const notes = await withUserContext(scoped, owner, "DEMO", (client) =>
      client.query("SELECT private_note FROM memeradar.tracked_people"),
    );
    expect(notes.rows).toEqual([{ private_note: "local context fixture" }]);
    expect(
      (await scoped.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
    await expect(
      withUserContext(scoped, owner, "DEMO", async () => {
        throw new Error("fixture cancellation");
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(
      (await scoped.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
    await expect(
      withUserContext(scoped, "bad", "DEMO", async () => null),
    ).rejects.toBeInstanceOf(Error);
  } finally {
    await scoped.end();
    await pool.query(
      "DELETE FROM memeradar.tracked_people WHERE requested_username='demo_context'",
    );
    await pool.query(
      "REVOKE SELECT ON memeradar.tracked_people FROM memeradar_context_test",
    );
    await pool.query(
      "REVOKE USAGE ON SCHEMA memeradar FROM memeradar_context_test",
    );
    await pool.query("DROP ROLE memeradar_context_test");
  }
});
it("rolls back all budget changes on feature exhaustion and fails closed without PostgreSQL", async () => {
  const { DurableXControlStore } =
    await import("../../packages/db/x-control-store");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { randomUUID } = await import("node:crypto");
  const namespace = randomUUID(),
    store = new DurableXControlStore(pool, new MemoryControlStore(), namespace);
  const value = {
    id: randomUUID(),
    amount: "4",
    limits: [
      { key: "global", amount: "100" },
      { key: "feature:people", amount: "5" },
    ],
    warningPercent: 80,
    expiresAt: Date.now() + 60000,
  };
  await store.reserve(value);
  await expect(
    store.reserve({ ...value, id: randomUUID() }),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  expect(
    (
      await pool.query(
        "SELECT spent_micros::text FROM memeradar.provider_budgets WHERE namespace=$1",
        [namespace],
      )
    ).rows.every((r) => r.spent_micros === "4"),
  ).toBe(true);
  await expect(store.settle(randomUUID(), "0")).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
  await expect(store.reserve({ ...value, amount: "-1" })).rejects.toMatchObject(
    { code: "INVALID_INPUT" },
  );
  await expect(store.settle(value.id, "-1")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  const closed = new pg.Pool({ connectionString: url });
  await closed.end();
  const { XApiClient } = await import("../../packages/connectors/x/client");
  const { FakeTransport, config } = await import("../fixtures/x/test-tools");
  const transport = new FakeTransport();
  const client = new XApiClient(
    await config(),
    transport,
    new DurableXControlStore(closed, new MemoryControlStore(), "closed"),
  );
  await expect(client.searchRecent("fixture")).rejects.toMatchObject({
    code: "STORE_UNAVAILABLE",
  });
  expect(transport.calls).toEqual([]);
});

it("rejects malformed reference JSON and V2 alert downgrades without modifying existing rules", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await rejected(
      client,
      "INSERT INTO memeradar.x_posts(data_origin,x_post_id,collection_mode,referenced_post_ids) VALUES('DEMO','DEMO_BAD_REF','lookup',$1)",
      [JSON.stringify([{ id: "123", type: "quoted" }])],
      "23514",
    );
    await rejected(
      client,
      "INSERT INTO memeradar.x_posts(data_origin,x_post_id,collection_mode,referenced_post_ids) VALUES('DEMO','DEMO_BAD_REF','lookup',$1)",
      [JSON.stringify([{ id: "DEMO_OK", type: "unknown" }])],
      "23514",
    );
    await rejected(
      client,
      "UPDATE memeradar.alert_rules SET delivery_mode='digest' WHERE id='00000000-0000-4000-8000-000000000012'",
      [],
      "23514",
    );
    await client.query(
      "UPDATE memeradar.alert_rules SET delivery_mode='digest',digest_interval_seconds=300,max_per_hour=2 WHERE id='00000000-0000-4000-8000-000000000012'",
    );
    expect(
      (
        await client.query(
          "SELECT delivery_mode FROM memeradar.alert_rules WHERE id='00000000-0000-4000-8000-000000000012'",
        )
      ).rows[0].delivery_mode,
    ).toBe("digest");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

it("blocks V2 alert loss on an otherwise empty upgrade and permits a compatible downgrade", async () => {
  await pool.query("CREATE DATABASE memeradar_v2_alerts");
  const dbUrl = new URL(url!);
  dbUrl.pathname = "/memeradar_v2_alerts";
  const other = new pg.Pool({ connectionString: dbUrl.toString() });
  try {
    await migrate(other);
    await other.query(
      "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','alerts@example.invalid','$argon2id$fixture')",
      [owner],
    );
    await other.query(
      "INSERT INTO memeradar.alert_rules(data_origin,user_id,type,conditions,channels,cooldown_seconds,min_confidence,min_data_quality,delivery_mode,digest_interval_seconds) VALUES('DEMO',$1,'provider_budget','{}',ARRAY['in_app'],60,'WEAK',0.5,'digest',300)",
      [owner],
    );
    await expect(migrate(other, { rollback: true })).rejects.toMatchObject({
      code: "DATABASE_REJECTED",
    });
    expect(
      (
        await other.query(
          "SELECT count(*)::int AS n FROM memeradar.schema_migrations",
        )
      ).rows[0].n,
    ).toBe(6);
    await other.query(
      "UPDATE memeradar.alert_rules SET type='attention_acceleration',delivery_mode='immediate',digest_interval_seconds=NULL",
    );
    expect(await migrate(other, { rollback: true })).toHaveLength(5);
    expect(
      (await other.query("SELECT type FROM memeradar.alert_rules")).rows,
    ).toEqual([{ type: "attention_acceleration" }]);
  } finally {
    await other.end();
  }
});
