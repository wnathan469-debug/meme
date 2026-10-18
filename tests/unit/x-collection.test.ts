import { describe, it, expect, vi } from "vitest";
import {
  buildXQuery,
  filtersFromUrl,
  filtersToUrl,
} from "../../packages/collection/query";
import { FeedHub, FeedSession } from "../../packages/collection/feed";
import { highestId } from "../../packages/collection/contracts";
import {
  XCollector,
  type CollectorOptions,
} from "../../packages/collection/collector";
import type {
  CollectionRepository,
  CollectionRule,
  Lease,
} from "../../packages/collection/contracts";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { FakeClock } from "../fixtures/x/test-tools";
import { ProviderError } from "../../packages/shared/errors";
const owner = "00000000-0000-4000-8000-000000000001";
const rule: CollectionRule = {
  id: owner,
  ownerId: owner,
  origin: "DEMO",
  query: "fict",
  priority: "high",
  intervalSeconds: 1,
  status: "active",
};
const options: CollectorOptions = {
  mode: "polling",
  maxPages: 1,
  maxResults: 100,
  leaseMs: 120000,
  defaultIntervalSeconds: 1,
  highPriorityIntervalSeconds: 1,
  maxReconnects: 1,
};
function repository(): CollectionRepository {
  return {
    origin: "DEMO",
    ownerId: owner,
    rules: vi.fn(async () => [rule]),
    claim: vi.fn(async (r) => ({
      rule: r,
      token: "fixture",
      runId: "fixture",
      checkpoint: {
        sinceId: null,
        nextToken: null,
        pendingSinceId: null,
        queryHash: null,
        nextDueAt: new Date().toISOString(),
      },
    })),
    ingest: vi.fn(async (_lease, page) => ({
      newPosts: page.data.length,
      duplicates: 0,
      originals: page.data.length,
      reposts: 0,
      unknown: 0,
      highestId: null,
    })),
    finish: vi.fn(async () => {}),
  };
}
describe("assisted query and URL filters", () => {
  it("quotes text and allows advanced operators only when explicitly permitted", () => {
    const config = { queryMaxLength: 512, allowedOperators: ["from", "lang"] };
    expect(
      buildXQuery(
        {
          all: ["nébula mobile"],
          any: ["lancement", "annonce"],
          exclude: ["spam"],
          hashtags: ["Boréale"],
          accounts: ["demo_person"],
          language: "fr",
        },
        config,
      ),
    ).toBe(
      '"nébula mobile" ("lancement" OR "annonce") -"spam" #Boréale (from:demo_person) lang:fr',
    );
    expect(() =>
      buildXQuery({ accounts: ["demo"] }, { ...config, allowedOperators: [] }),
    ).toThrow(ProviderError);
    expect(() => buildXQuery({ all: ['bad" query'] }, config)).toThrow(
      ProviderError,
    );
    expect(() =>
      buildXQuery({ all: ["abc"] }, { ...config, queryMaxLength: 2 }),
    ).toThrow();
  });
  it("round-trips typed filters and rejects unknown, malformed and inverted values", () => {
    const filters = {
      text: "[DÉMO] & texte",
      hasAddress: false,
      minInteractions: "9007199254740993000",
      limit: 5,
      type: "quote",
    };
    expect(filtersFromUrl(filtersToUrl(filters))).toEqual(filters);
    for (const search of [
      "hasAddress=maybe",
      "limit=999",
      "unknown=true",
      "since=2026-01-02T00:00:00.000Z&until=2026-01-01T00:00:00.000Z",
    ])
      expect(() => filtersFromUrl(search)).toThrow(ProviderError);
  });
  it("compares REAL IDs exactly and treats DEMO IDs as simulator order", () => {
    expect(highestId(["9007199254740993", "9007199254740992"], "REAL")).toBe(
      "9007199254740993",
    );
    expect(highestId(["DEMO_Z", "DEMO_A"], "DEMO")).toBe("DEMO_A");
    expect(highestId([], "REAL")).toBeNull();
  });
});
it("isolates feed subscriptions, freezes display and bounds pending notifications", () => {
  const deliver = vi.fn(),
    other = vi.fn(),
    hub = new FeedHub(),
    a = hub.subscribe(owner, "DEMO", deliver),
    b = hub.subscribe("other", "DEMO", other);
  a.session.pause();
  hub.publish(owner, { postId: "p1", origin: "DEMO", at: "fixture" });
  hub.publish(owner, { postId: "p1", origin: "DEMO", at: "new" });
  expect(deliver).not.toHaveBeenCalled();
  expect(a.session.status().pending).toBe(1);
  a.session.resume();
  expect(deliver).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  a.close();
  b.close();
  const bounded = new FeedSession(deliver, 1);
  bounded.pause();
  bounded.receive({ postId: "1", origin: "DEMO", at: "" });
  bounded.receive({ postId: "2", origin: "DEMO", at: "" });
  expect(bounded.status()).toMatchObject({ pending: 1, refreshRequired: true });
});
it("does no work when collection is disabled and refuses mismatched origins", async () => {
  const repo = repository(),
    provider = new DemoXProvider();
  const collector = new XCollector(provider, repo, {
    ...options,
    mode: "disabled",
  });
  expect(await collector.tick()).toEqual({ calls: 0, newPosts: 0, skipped: 0 });
  await collector.run(new AbortController().signal);
  expect(repo.rules).not.toHaveBeenCalled();
  expect(
    () => new XCollector(provider, { ...repo, origin: "REAL" }, options),
  ).toThrow();
});
it("stops lower priorities after budget refusal and defers 429 until the announced retry", async () => {
  const repo = repository(),
    provider = new DemoXProvider();
  provider.simulate("budget_exhausted");
  const collector = new XCollector(provider, repo, options, new FakeClock());
  await collector.tick();
  expect(collector.status.errorCode).toBe("BUDGET_EXCEEDED");
  expect(repo.finish).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ status: "failed", errorCode: "BUDGET_EXCEEDED" }),
  );
  const second = new DemoXProvider();
  second.simulate("rate_limit");
  const otherRepo = repository();
  await new XCollector(second, otherRepo, options, new FakeClock()).tick();
  expect(otherRepo.finish).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ retryAfterMs: 60000 }),
  );
});
it("replays a demo stream without claiming a REAL connection and stops on explicit cancellation", async () => {
  const repo = repository(),
    provider = new DemoXProvider(new FakeClock()),
    controller = new AbortController();
  const collector = new XCollector(
    provider,
    repo,
    { ...options, mode: "stream" },
    new FakeClock(),
  );
  vi.mocked(repo.ingest).mockImplementation(async (_lease, page) => {
    controller.abort();
    return {
      newPosts: page.data.length,
      duplicates: 0,
      originals: 1,
      reposts: 0,
      unknown: 0,
      highestId: null,
    };
  });
  await collector.run(controller.signal);
  expect(repo.ingest).toHaveBeenCalled();
  expect(collector.status.mode).toBe("demo");
  expect(collector.status.connected).toBe(false);
});
it("falls back to polling after stream access is denied, without another stream attempt", async () => {
  const repo = repository(),
    provider = new DemoXProvider(new FakeClock()),
    controller = new AbortController();
  provider.stream.setRules = vi.fn(async () => {
    throw new ProviderError("ACCESS_DENIED");
  });
  const search = vi.spyOn(provider, "searchRecent");
  vi.mocked(repo.ingest).mockImplementation(async (_lease, page) => {
    controller.abort();
    return {
      newPosts: page.data.length,
      duplicates: 0,
      originals: 1,
      reposts: 0,
      unknown: 0,
      highestId: null,
    };
  });
  await new XCollector(
    provider,
    repo,
    { ...options, mode: "auto" },
    new FakeClock(),
  ).run(controller.signal);
  expect(provider.stream.setRules).toHaveBeenCalledOnce();
  expect(search).toHaveBeenCalled();
});

it("catches up after a disconnect, reconnects once and marks REAL connected only after handshake", async () => {
  const { XApiClient } = await import("../../packages/connectors/x/client");
  const { MemoryControlStore } =
    await import("../../packages/connectors/x/control");
  const { config, FakeTransport } = await import("../fixtures/x/test-tools");
  const clock = new FakeClock(),
    provider = new XApiClient(
      await config(),
      new FakeTransport(),
      new MemoryControlStore(),
      { clock },
    );
  const repo = repository();
  Object.assign(repo, {
    origin: "REAL",
    rules: vi.fn(async () => [{ ...rule, origin: "REAL" }]),
  });
  const controller = new AbortController();
  let connections = 0;
  const observed: boolean[] = [];
  const collector = new XCollector(
    provider,
    repo,
    { ...options, mode: "stream" },
    clock,
  );
  provider.stream = {
    setRules: vi.fn(async () => ({ rules: [] })),
    connect: (_page, settings) => {
      connections++;
      if (connections === 2) {
        observed.push(collector.status.connected);
        settings?.onConnected?.();
        observed.push(collector.status.connected);
        controller.abort();
      }
      return {
        stop() {},
        done: Promise.resolve({
          reason: connections === 1 ? "disconnected" : "stopped",
          posts: 0,
        }),
      };
    },
  };
  const search = vi.spyOn(provider, "searchRecent");
  await collector.run(controller.signal);
  expect(connections).toBe(2);
  expect(search).toHaveBeenCalledOnce();
  expect(observed).toEqual([false, true]);
  expect(collector.status.connected).toBe(false);
  expect(clock.sleeps).toContain(500);
});
it("does not reconnect or perform catch-up after a stream budget refusal", async () => {
  const provider = new DemoXProvider(),
    repo = repository();
  provider.stream.setRules = vi.fn(async () => {
    throw new ProviderError("BUDGET_EXCEEDED");
  });
  const search = vi.spyOn(provider, "searchRecent");
  const collector = new XCollector(provider, repo, {
    ...options,
    mode: "auto",
  });
  await collector.run(new AbortController().signal);
  expect(provider.stream.setRules).toHaveBeenCalledOnce();
  expect(search).not.toHaveBeenCalled();
});
