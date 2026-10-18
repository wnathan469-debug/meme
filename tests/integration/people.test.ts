import { beforeAll, afterAll, it, expect, vi } from "vitest";
import pg from "pg";
import { migrate } from "../../packages/db/migrations";
import { PgPeopleRepository } from "../../packages/db/people-repository";
import { PgXCollectionRepository } from "../../packages/db/x-collection-repository";
import { PeopleService } from "../../packages/people/service";
import { PeopleCollector } from "../../packages/people/collector";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { parsePerson } from "../../packages/people/model";
const root = process.env.TEST_DATABASE_URL!;
const admin = new pg.Pool({ connectionString: root });
const url = new URL(root);
url.pathname = "/memeradar_people";
const pool = new pg.Pool({ connectionString: url.toString() });
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const repo = new PgPeopleRepository(pool, owner, "DEMO"),
  foreign = new PgPeopleRepository(pool, other, "DEMO"),
  provider = new DemoXProvider(),
  service = new PeopleService(repo, provider);
const input = (username = "demo_analyste_julie") =>
  parsePerson(
    {
      username,
      privateNote: "PRIVATE_SECRET <script>steal()</script>",
      status: "active",
    },
    "DEMO",
  );
beforeAll(async () => {
  await admin.query("CREATE DATABASE memeradar_people");
  await migrate(pool);
  await pool.query(
    "INSERT INTO memeradar.users(id,data_origin,email,password_hash) VALUES($1,'DEMO','owner@example.invalid','$argon2id$fixture'),($2,'DEMO','other@example.invalid','$argon2id$fixture')",
    [owner, other],
  );
});
afterAll(async () => {
  await pool.end();
  await admin.end();
});
it("requires confirmation and sends only a handle to the provider; notes stay private", async () => {
  const spy = vi.spyOn(provider, "getUserByUsername");
  const prepared = await service.prepare(input());
  expect(prepared.state).toBe("confirmation_required");
  expect(JSON.stringify(prepared)).not.toContain("PRIVATE_SECRET");
  expect(spy).toHaveBeenCalledWith("demo_analyste_julie");
  expect(await repo.list()).toEqual([]);
  const saved = await service.confirm(prepared.ticket);
  expect(saved.person.privateNote).toContain("PRIVATE_SECRET");
  expect(saved.person.xUserId).toBe("DEMO_USER_A");
  expect(saved.person.status).toBe("active");
  await expect(service.confirm(prepared.ticket)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  spy.mockRestore();
});
it("isolates notes and categories and rejects foreign mutation even with admin test connection", async () => {
  const person = (await repo.list())[0];
  expect(await foreign.list()).toEqual([]);
  await expect(foreign.update(person.id, input())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(foreign.remove(person.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const cat = await foreign.saveCategory("Privée");
  await expect(
    service.update(person.id, { ...person, categoryId: cat.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await repo.categories()).toEqual([]);
});
it("renames and deletes categories with atomic reassignment and enforces identity on editing", async () => {
  const a = await repo.saveCategory("Analystes"),
    b = await repo.saveCategory("Fondateurs");
  expect((await repo.saveCategory("analystes")).id).toBe(a.id);
  expect((await repo.saveCategory("Experts", a.id)).name).toBe("Experts");
  const p = (await repo.list())[0];
  await service.update(p.id, { ...p, categoryId: a.id });
  await repo.removeCategory(a.id, b.id);
  expect((await repo.list())[0].categoryId).toBe(b.id);
  await repo.removeCategory(b.id, null);
  expect((await repo.list())[0].categoryId).toBeNull();
  await expect(
    service.update(p.id, { ...p, username: "other" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(repo.removeCategory(a.id, a.id)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(repo.saveCategory("")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});
it("deduplicates concurrent confirmations and recognizes renamed accounts with history", async () => {
  const a = await service.prepare(input()),
    b = await service.prepare(input());
  const results = await Promise.all([
    service.confirm(a.ticket),
    service.confirm(b.ticket),
  ]);
  expect(results.every((r) => r.duplicate)).toBe(true);
  expect(await repo.list()).toHaveLength(1);
  const original = (await provider.getUsersByIds(["DEMO_USER_A"]))[0];
  const renamed = {
    ...original,
    username: "demo_julie_new",
    observedAt: new Date(Date.now() + 1000).toISOString(),
  };
  const spy = vi
    .spyOn(provider, "getUserByUsername")
    .mockResolvedValueOnce(renamed);
  const c = await service.prepare(input(renamed.username));
  const saved = await service.confirm(c.ticket);
  expect(saved.duplicate).toBe(true);
  expect(saved.person.profile?.username).toBe(renamed.username);
  expect(
    (
      await pool.query(
        "SELECT username FROM memeradar.x_username_history WHERE x_user_id='DEMO_USER_A'",
      )
    ).rows.map((r) => r.username),
  ).toContain(original.username);
  spy.mockRestore();
});
it("keeps unknown and protected profiles paused and requires explicit confirmation on later validation", async () => {
  const noApi = new PeopleService(repo, null);
  const pending = await noApi.prepare(input("demo_pending"));
  expect(pending.state).toBe("unvalidated");
  const saved = await noApi.confirm(pending.ticket);
  expect(saved.person.xUserId).toBeNull();
  expect(saved.person.status).toBe("paused");
  await expect(
    service.update(saved.person.id, { ...saved.person, status: "active" }),
  ).rejects.toMatchObject({ code: "PROTECTED_ACCOUNT" });
  const missing = await service.prepare(input("demo_missing"));
  expect(missing.state).toBe("not_found");
  expect((await service.confirm(missing.ticket)).person.validation).toBe(
    "not_found",
  );
  const profile = {
    ...(await provider.getUsersByIds(["DEMO_USER_B"]))[0],
    username: "demo_pending",
    protected: true,
  };
  const spy = vi
    .spyOn(provider, "getUserByUsername")
    .mockResolvedValueOnce(profile);
  const card = await service.prepare({ ...saved.person }, saved.person.id);
  expect(card.state).toBe("confirmation_required");
  expect(
    (await repo.list()).find((p) => p.id === saved.person.id)?.xUserId,
  ).toBeNull();
  const confirmed = await service.confirm(card.ticket);
  expect(confirmed.person.profile?.protected).toBe(true);
  expect(confirmed.person.status).toBe("paused");
  expect(
    (await repo.collectionRules()).some(
      (r) => r.query === `user:${profile.id}`,
    ),
  ).toBe(false);
  await expect(
    service.prepare(confirmed.person, confirmed.person.id),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  spy.mockRestore();
});
it("collects stable-ID timelines with people budgets and excludes people rules from keyword search", async () => {
  const collection = new PgXCollectionRepository(pool, owner, "DEMO");
  expect(await collection.rules()).toEqual([]);
  const spy = vi.spyOn(provider, "getUserPosts");
  const collector = new PeopleCollector(provider, repo, collection, {
    mode: "polling",
    maxPages: 3,
    maxResults: 10,
    leaseMs: 120000,
  });
  const result = await collector.tick();
  expect(result.calls).toBe(1);
  expect(spy).toHaveBeenCalledWith(
    "DEMO_USER_A",
    expect.objectContaining({ feature: "people" }),
  );
  expect(result.newPosts).toBeGreaterThan(0);
  const detailPerson = (await repo.list()).find(
    (p) => p.xUserId === "DEMO_USER_A",
  )!;
  const detail = await repo.detail(detailPerson.id);
  expect(detail.posts.length).toBeGreaterThan(0);
  expect(detail.activityByHour.reduce((a, b) => a + b, 0)).toBe(
    detail.posts.length,
  );
  expect(detail.coverage).toBe("partial");
  expect(detail.missedPosts).toBeNull();
  await expect(foreign.detail(detailPerson.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });

  expect((await collector.tick()).calls).toBe(0);
  const person = (await repo.list()).find((p) => p.xUserId === "DEMO_USER_A")!;
  await service.update(person.id, { ...person, status: "paused" });
  expect(await repo.collectionRules()).toEqual([]);
  expect((await collector.tick()).calls).toBe(0);
  await service.update(person.id, {
    ...person,
    status: "active",
    priority: "critical",
  });
  expect((await repo.collectionRules())[0].intervalSeconds).toBe(60);
  spy.mockRestore();
});
it("deletes private notes and pauses collection while retaining already observed evidence", async () => {
  const person = (await repo.list()).find((p) => p.xUserId === "DEMO_USER_A")!;
  const before = (await pool.query("SELECT count(*) FROM memeradar.x_posts"))
    .rows[0].count;
  await repo.remove(person.id);
  expect((await repo.list()).some((p) => p.id === person.id)).toBe(false);
  expect(await repo.collectionRules()).toEqual([]);
  expect(
    (await pool.query("SELECT count(*) FROM memeradar.x_posts")).rows[0].count,
  ).toBe(before);
  expect(
    (
      await pool.query(
        "SELECT private_note FROM memeradar.tracked_people WHERE id=$1",
        [person.id],
      )
    ).rows,
  ).toEqual([]);
});

it("enforces RLS with a non-bypass role and clears the transaction context on release", async () => {
  await pool.query(
    "CREATE ROLE people_application_test NOLOGIN NOSUPERUSER NOBYPASSRLS",
  );
  await pool.query(
    "GRANT USAGE ON SCHEMA memeradar TO people_application_test",
  );
  await pool.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA memeradar TO people_application_test",
  );
  const scoped = new pg.Pool({
    connectionString: url.toString(),
    options: "-c role=people_application_test",
    max: 1,
  });
  try {
    const a = new PgPeopleRepository(scoped, owner, "DEMO"),
      b = new PgPeopleRepository(scoped, other, "DEMO");
    const card = await new PeopleService(a, null).prepare(
      input("demo_role_test"),
    );
    const added = await new PeopleService(a, null).prepare(
      input("demo_unused"),
    );
    expect(added.state).toBe("unvalidated");
    const svc = new PeopleService(a, null),
      prepared = await svc.prepare(input("demo_role_test"));
    const saved = await svc.confirm(prepared.ticket);
    expect((await b.list()).some((p) => p.id === saved.person.id)).toBe(false);
    await expect(b.remove(saved.person.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      (await scoped.query("SELECT private_note FROM memeradar.tracked_people"))
        .rows,
    ).toEqual([]);
    await a.update(saved.person.id, { ...saved.person, name: "Privé" });
    expect((await a.list()).find((p) => p.id === saved.person.id)?.name).toBe(
      "Privé",
    );
    await a.remove(saved.person.id);
    expect(card.profile).toBeNull();
  } finally {
    await scoped.end();
  }
});
