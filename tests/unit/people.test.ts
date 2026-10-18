import { it, expect, vi } from "vitest";
import {
  normalizeUsername,
  parsePerson,
  profileUrl,
} from "../../packages/people/model";
import {
  PeopleService,
  type PeopleRepository,
} from "../../packages/people/service";
import {
  PeopleCollector,
  estimateFollowing,
} from "../../packages/people/collector";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { FakeClock, config } from "../fixtures/x/test-tools";
import { ProviderError } from "../../packages/shared/errors";
import type { CollectionRepository } from "../../packages/collection/contracts";
const input = { username: "@demo_analyste_julie" };
function repository(): PeopleRepository {
  return {
    origin: "DEMO",
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    categories: vi.fn(),
    saveCategory: vi.fn(),
    removeCategory: vi.fn(),
  };
}
it("normalizes only supported profile URLs and handles without network", () => {
  expect(normalizeUsername("  @Alice_1  ", "REAL")).toBe("alice_1");
  expect(
    normalizeUsername("https://www.twitter.com/Alice_1/?lang=fr", "REAL"),
  ).toBe("alice_1");
  for (const value of [
    "https://x.com.evil.test/a",
    "https://x.com/a/status/1",
    "https://x.com@evil.test/a",
    "http://x.com/a",
    "https://x.com:444/a",
    "https://x.com/%61",
    "https://x.com/home",
    "A B",
    "@@Alice",
    "abcdefghijklmnop",
    "javascript:alert(1)",
  ])
    expect(() => normalizeUsername(value, "REAL")).toThrow();
  expect(normalizeUsername("demo_analyste_julie", "DEMO")).toBe(
    "demo_analyste_julie",
  );
  expect(() =>
    parsePerson({ username: "a", privateNote: "x".repeat(10001) }, "REAL"),
  ).toThrow();
  expect(
    parsePerson({ username: "a", keywords: ["x", "x"] }, "REAL").keywords,
  ).toEqual(["x"]);
});
it("uses owner-local, expiring, single-use confirmation and rejects origin mismatch", async () => {
  const repo = repository(),
    provider = new DemoXProvider(),
    clock = new FakeClock(),
    service = new PeopleService(repo, provider, clock),
    other = new PeopleService(repo, provider, clock);
  const card = await service.prepare(input);
  await expect(other.confirm(card.ticket)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  clock.time += 300001;
  await expect(service.confirm(card.ticket)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(repo.save).not.toHaveBeenCalled();
  expect(
    () => new PeopleService({ ...repo, origin: "REAL" }, provider),
  ).toThrow();
});
it("does not invent an identity on provider denial, rate limits or missing data", async () => {
  const repo = repository(),
    provider = new DemoXProvider(),
    service = new PeopleService(repo, provider);
  for (const code of [
    "ACCESS_DENIED",
    "BUDGET_EXCEEDED",
    "RATE_LIMITED",
  ] as const) {
    vi.spyOn(provider, "getUserByUsername").mockRejectedValueOnce(
      new ProviderError(code),
    );
    const card = await service.prepare(input);
    expect(card.state).toBe("unavailable");
    await service.confirm(card.ticket);
    expect(repo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "paused" }),
      null,
      "unvalidated",
      undefined,
    );
  }
  vi.spyOn(provider, "getUserByUsername").mockResolvedValueOnce({
    ...(await provider.getUsersByIds(["DEMO_USER_A"]))[0],
    dataOrigin: "REAL",
  });
  await expect(service.prepare(input)).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
});
it("bounds following estimates including worst-case retry and lookup costs", async () => {
  expect(estimateFollowing(null, "normal", 10, 2, 1)).toBeNull();
  const price = (await config()).pricing!;
  const value = estimateFollowing(price, "critical", 10, 2, 1)!;
  expect(BigInt(value.cycleMicros)).toBe(
    4n *
      (2n * BigInt(price.request) +
        BigInt(price.user) +
        10n * BigInt(price.post)),
  );
  expect(BigInt(value.dayMicros)).toBe(BigInt(value.cycleMicros) * 1440n);
  expect(() => estimateFollowing(price, "low", -1, 2, 1)).toThrow();
});
it("makes DEMO profile destinations inert and distinct", async () => {
  const p = (await new DemoXProvider().getUsersByIds(["DEMO_USER_A"]))[0];
  expect(profileUrl(p)).toMatch(/^https:\/\/demo.memeradar.invalid\//);
  expect(profileUrl({ ...p, dataOrigin: "REAL", username: "alice" })).toBe(
    "https://x.com/alice",
  );
});
it("stops lower-priority collection after budget failure and handles pause between pages", async () => {
  const provider = new DemoXProvider(),
    rule = {
      id: "a",
      ownerId: "owner",
      origin: "DEMO" as const,
      query: "user:DEMO_USER_A",
      priority: "critical" as const,
      intervalSeconds: 60,
      status: "active" as const,
    },
    lease = {
      rule,
      token: "a",
      runId: "a",
      checkpoint: {
        sinceId: null,
        nextToken: null,
        pendingSinceId: null,
        queryHash: null,
        nextDueAt: "",
      },
    };
  const repo = {
    origin: "DEMO",
    ownerId: "owner",
    claim: vi.fn().mockResolvedValue(lease),
    ingest: vi.fn().mockResolvedValue({ newPosts: 1 }),
    finish: vi.fn(),
  } as unknown as CollectionRepository;
  const people = {
    collectionRules: vi
      .fn()
      .mockResolvedValue([rule, { ...rule, id: "b", priority: "low" }]),
  };
  const options = {
    mode: "polling",
    maxPages: 3,
    maxResults: 10,
    leaseMs: 120000,
  };
  const collector = new PeopleCollector(provider, people, repo, options);
  const spy = vi
    .spyOn(provider, "getUserPosts")
    .mockRejectedValueOnce(new ProviderError("BUDGET_EXCEEDED"));
  expect((await collector.tick()).errorCode).toBe("BUDGET_EXCEEDED");
  expect(repo.claim).toHaveBeenCalledTimes(1);
  expect(repo.finish).toHaveBeenLastCalledWith(
    lease,
    expect.objectContaining({ status: "failed", errorCode: "BUDGET_EXCEEDED" }),
  );
  spy.mockRestore();
  people.collectionRules
    .mockResolvedValueOnce([rule])
    .mockResolvedValueOnce([]);
  expect((await collector.tick()).errorCode).toBe("ACCESS_DENIED");
  expect(
    (
      await new PeopleCollector(provider, people, repo, {
        ...options,
        mode: "disabled",
      }).tick()
    ).calls,
  ).toBe(0);
});

it("prepares queued identities in bounded batches and never auto-confirms them", async () => {
  const repo = repository(),
    provider = new DemoXProvider(),
    svc = new PeopleService(repo, provider);
  const pending = {
    ...parsePerson(
      { username: "demo_analyste_julie", privateNote: "PRIVATE" },
      "DEMO",
    ),
    id: "00000000-0000-4000-8000-000000000001",
    xUserId: null,
    validation: "unvalidated",
    profile: null,
  };
  vi.mocked(repo.list).mockResolvedValue([pending as never]);
  const cards = await svc.preparePending(1);
  expect(cards).toHaveLength(1);
  expect(cards[0].prepared.state).toBe("confirmation_required");
  expect(JSON.stringify(cards)).not.toContain("PRIVATE");
  expect(repo.save).not.toHaveBeenCalled();
  await expect(svc.preparePending(0)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  vi.spyOn(provider, "getUserByUsername").mockRejectedValueOnce(
    new ProviderError("BUDGET_EXCEEDED"),
  );
  expect((await svc.preparePending())[0].prepared.state).toBe("unavailable");
  vi.mocked(repo.list).mockResolvedValue([]);
  await expect(svc.prepare(input, pending.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
it("stops a running people loop on abort without making external requests", async () => {
  const provider = new DemoXProvider(),
    controller = new AbortController(),
    people = {
      collectionRules: vi.fn(async () => {
        controller.abort();
        return [];
      }),
    };
  const repo = { origin: "DEMO", ownerId: "owner" } as CollectionRepository;
  const collector = new PeopleCollector(provider, people, repo, {
    mode: "polling",
    maxPages: 1,
    maxResults: 10,
    leaseMs: 120000,
  });
  await collector.run(controller.signal);
  expect(people.collectionRules).toHaveBeenCalledTimes(1);
  expect((await collector.tick()).calls).toBe(0);
  expect(
    () =>
      new PeopleCollector(
        provider,
        people,
        { ...repo, origin: "REAL" },
        { mode: "polling", maxPages: 1, maxResults: 10, leaseMs: 120000 },
      ),
  ).toThrow();
});

it("reserves confirmation capacity before concurrent lookups and refuses overflow without an API call", async () => {
  const repo = repository(),
    provider = new DemoXProvider();
  const profile = (await provider.getUsersByIds(["DEMO_USER_A"]))[0];
  let resolve!: (user: typeof profile) => void;
  const response = new Promise<typeof profile>((r) => {
    resolve = r;
  });
  const spy = vi.spyOn(provider, "getUserByUsername").mockReturnValue(response);
  const svc = new PeopleService(repo, provider);
  const preparing = Array.from({ length: 1000 }, () => svc.prepare(input));
  await expect(svc.prepare(input)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(spy).toHaveBeenCalledTimes(1000);
  resolve(profile);
  await Promise.all(preparing);
  await expect(svc.prepare(input)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
});
