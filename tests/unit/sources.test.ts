import { it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  usd,
  parseUsd,
  percent,
  settingsSchema,
  defaultSettings,
  connectionState,
  diagnosticSchema,
  backoffUntil,
  periodKeys,
  scope,
  type SourceBinding,
} from "../../packages/sources/model";
import {
  initialSources,
  demoSource,
  saveDemoSettings,
  checkDemoProbe,
  confirmDemoProbe,
} from "../../packages/sources/demo-data";
import { SourcesService } from "../../packages/sources/service";
import { ObservedPublicTransport } from "../../packages/sources/transport";
import { ProviderError } from "../../packages/shared/errors";
import { eventAt } from "../../packages/events/demo-data";
it.each([
  ["0", "0"],
  ["0,000001", "1"],
  ["12.123456", "12123456"],
  ["9007199254740993.000001", "9007199254740993000001"],
])("converts USD %s exactly without Number", (value, n) => {
  expect(parseUsd(value)).toBe(n);
  expect(usd(n)).toContain(",");
});
it.each(["1.0000001", "-1", "1e6", "NaN", "01", "1;token", "1,2,3"])(
  "rejects invalid USD %s",
  (v) => expect(() => parseUsd(v)).toThrow(),
);
it("reports zero caps as undefined percentage and precise large balances", () => {
  expect(percent("1", "0")).toBeNull();
  expect(percent("1", "3")).toBe("33,33");
  expect(percent("100000000000000000000001", "100000000000000000000000")).toBe(
    "100,00",
  );
  expect(periodKeys(eventAt(60)).day).toBe("day:2026-01-15");
  expect(scope("x", "acct_1", "REAL")).toContain("acct_1");
  expect(() => scope("x", "../../secret", "REAL")).toThrow();
});
const observation = () =>
  diagnosticSchema.parse({
    id: randomUUID(),
    endpoint: "recent",
    at: eventAt(60),
    code: null,
    status: 200,
    quota: null,
    retryAt: null,
  });
it("does not report connected before a fresh, successful observation", () => {
  const s = {
    configured: true,
    hostAllowed: true,
    settings: { ...defaultSettings(), enabled: true },
    last: observation(),
    asOf: eventAt(60),
    blockedUntil: null,
  };
  expect(connectionState(s).state).toBe("connected");
  expect(connectionState({ ...s, last: null }).state).toBe("degraded");
  expect(connectionState({ ...s, configured: false }).state).toBe(
    "not_configured",
  );
  expect(connectionState({ ...s, hostAllowed: false }).state).toBe("disabled");
  expect(connectionState({ ...s, settings: defaultSettings() }).state).toBe(
    "disabled",
  );
  expect(connectionState({ ...s, asOf: eventAt(66) }).state).toBe("degraded");
  for (const code of ["RATE_LIMITED", "CIRCUIT_OPEN"] as const)
    expect(connectionState({ ...s, last: { ...s.last, code } }).state).toBe(
      "degraded",
    );
  expect(
    connectionState({ ...s, last: { ...s.last, code: "NETWORK_ERROR" } }).state,
  ).toBe("error");
  expect(connectionState({ ...s, blockedUntil: eventAt(61) }).state).toBe(
    "degraded",
  );
});
it("keeps reset deadlines and bounded jitter/circuit delays", () => {
  expect(backoffUntil(1, eventAt(60), eventAt(90), 0)).toBe(eventAt(90));
  expect(
    Date.parse(backoffUntil(3, eventAt(60), null, 1)) - Date.parse(eventAt(60)),
  ).toBeGreaterThanOrEqual(60000);
  expect(
    Date.parse(backoffUntil(10000, eventAt(60), null, 10)) -
      Date.parse(eventAt(60)),
  ).toBeLessThanOrEqual(600000);
  expect(
    settingsSchema.safeParse({
      ...defaultSettings(),
      cache: { posts: 10, profiles: 10000, market: 60, risks: 301 },
    }).success,
  ).toBe(false);
  expect(() =>
    diagnosticSchema.parse({
      ...observation(),
      body: "sensitive raw response",
    }),
  ).toThrow();
});
it("simulates API states, budget refusal and configuration persistence without any network", () => {
  let s = initialSources();
  expect(demoSource(s, "x").state).toBe("connected");
  expect(demoSource({ ...s, scenario: "unconfigured" }, "x").state).toBe(
    "not_configured",
  );
  for (const scenario of [
    "quota",
    "budget",
    "disconnect",
    "error",
    "unconfigured",
  ] as const)
    expect(() => checkDemoProbe({ ...s, scenario }, "x")).toThrow();
  expect(() => checkDemoProbe(s, "gecko")).toThrow();
  expect(checkDemoProbe(s, "x")).toBe("150");
  s = confirmDemoProbe(s, "x");
  expect(s.entries.x.cost).toBe("150");
  expect(s.entries.x.tests).toBe(1);
  expect(() =>
    saveDemoSettings(s, "x", {
      ...s.entries.x.settings,
      budget: { ...s.entries.x.settings.budget, daily: "1" },
    }),
  ).toThrow("engagements");
  const priorities = { ...s.entries.x.settings.priorities, high: 600 };
  const next = saveDemoSettings(s, "x", {
    ...s.entries.x.settings,
    priorities,
  });
  expect(next.rules[0].seconds).toBe(600);
  expect(next.entries.x.revision).toBe(2);
  expect(s.rules[0].seconds).toBe(300);
  const publicNext = saveDemoSettings(s, "gecko", {
    ...defaultSettings(),
    enabled: true,
  });
  expect(checkDemoProbe(publicNext, "gecko")).toBe("0");
});
function setup() {
  let used = false;
  const snapshot = demoSource(initialSources(), "x"),
    repo = {
      initialize: vi.fn(async () => {}),
      read: vi.fn(async () => snapshot),
      save: vi.fn(async () => 2),
      quote: vi.fn(async (_p: unknown, _ns: unknown, ceiling: string) => ({
        id: "00000000-0000-4000-8000-000000000180" as const,
        ceiling,
        expiresAt: eventAt(62),
        revision: 1,
      })),
      consume: vi.fn(async () => {
        if (used) throw new ProviderError("INVALID_INPUT");
        used = true;
      }),
      rules: vi.fn(async () => []),
      setInterval: vi.fn(async () => {}),
      applyPriority: vi.fn(async () => 2),
    };
  const b: SourceBinding = {
    provider: "x",
    namespace: "account",
    configured: true,
    hostAllowed: true,
    pricing: {
      currency: "USD",
      request: "100",
      user: "50",
      post: "500",
      verifiedAt: eventAt(0),
    },
    settings: { ...defaultSettings(), enabled: true },
    collectionMode: "polling",
    minimumIntervalSeconds: 60,
  };
  const run = vi.fn(async () => {}),
    caps = vi.fn(async () => ({}) as never);
  return {
    repo,
    b,
    run,
    caps,
    service: new SourcesService(repo, [b], { x: { run, capabilities: caps } }),
  };
}
it("requires an explicit one-use confirmation and never probes at construction, initialize or read", async () => {
  const { service, repo, run } = setup();
  expect(run).not.toHaveBeenCalled();
  await service.initialize();
  await service.read("x");
  expect(run).not.toHaveBeenCalled();
  const q = await service.prepareProbe("x");
  expect(q.ceiling).toBe("150");
  expect(q.requests).toBe(1);
  expect(run).not.toHaveBeenCalled();
  const results = await Promise.allSettled([
    service.confirmProbe("x", q.id),
    service.confirmProbe("x", q.id),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(repo.consume).toHaveBeenCalledTimes(2);
});
it("refuses missing prerequisites, host kill switch, unknown prices and unsupported public budgets", async () => {
  for (const mutation of [
    { configured: false },
    { hostAllowed: false },
    { pricing: null },
  ]) {
    const s = setup();
    const service = new SourcesService(s.repo, [{ ...s.b, ...mutation }], {
      x: { run: s.run },
    });
    await expect(service.prepareProbe("x")).rejects.toThrow();
    expect(s.run).not.toHaveBeenCalled();
  }
  const s = setup();
  await expect(s.service.read("goplus")).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  const absent = new SourcesService(s.repo, [s.b], {
    x: { ready: false, run: s.run },
  });
  await expect(absent.prepareProbe("x")).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  const disabled = new SourcesService(s.repo, [{ ...s.b, configured: false }], {
    x: { run: s.run },
  });
  await expect(disabled.save("x", s.b.settings, 1)).rejects.toThrow();
  const publicService = new SourcesService(
    s.repo,
    [{ ...s.b, provider: "gecko", pricing: null }],
    { gecko: { run: s.run } },
  );
  await expect(
    publicService.save(
      "gecko",
      { ...s.b.settings, budget: { ...s.b.settings.budget, daily: "1" } },
      1,
    ),
  ).rejects.toThrow();
  expect((await publicService.prepareProbe("gecko")).ceiling).toBe("0");
});
it("edits settings and rule frequencies locally without probing", async () => {
  const s = setup();
  await s.service.save("x", s.b.settings, 1);
  await s.service.rules();
  await s.service.setInterval("00000000-0000-4000-8000-000000000180", 120);
  await s.service.applyPriority("high", 300);
  expect(s.repo.save).toHaveBeenCalled();
  expect(s.repo.setInterval).toHaveBeenCalled();
  expect(s.run).not.toHaveBeenCalled();
});
it.each([
  [200, "{}", null],
  [429, "error", "RATE_LIMITED"],
  [403, "secret token=LEAK", "ACCESS_DENIED"],
  [404, "missing", "NOT_FOUND"],
  [503, "secret provider body", "PROVIDER_UNAVAILABLE"],
] as const)(
  "observes HTTP %s without storing request or error bodies",
  async (status, body, code) => {
    const observe = vi.fn(async (_d: unknown) => {}),
      t = new ObservedPublicTransport(
        {
          get: async () => ({
            status,
            body,
            headers: {
              "retry-after": "30",
              "x-rate-limit-limit": "10",
              "x-rate-limit-remaining": "0",
            },
          }),
        },
        observe,
        () => Date.parse(eventAt(60)),
      );
    await t.get(
      new URL(
        "https://api.geckoterminal.com/api/v2/networks/base/tokens/private-address/pools?private-query=LEAK",
      ),
      { authorization: "Bearer LEAK" },
    );
    const d = observe.mock.calls[0][0] as never;
    expect(JSON.stringify(d)).not.toContain("LEAK");
    expect(JSON.stringify(d)).not.toContain("private-address");
    expect(d).toMatchObject({ endpoint: "pools", code });
  },
);
it("sanitizes malformed JSON/network failures and preserves no raw exception", async () => {
  const observe = vi.fn(async (_d: unknown) => {}),
    bad = new ObservedPublicTransport(
      {
        get: async () => ({ status: 200, headers: {}, body: "LEAK not-json" }),
      },
      observe,
    );
  await expect(
    bad.get(new URL("https://api.gopluslabs.io/api/v1/supported_chains"), {}),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(JSON.stringify(observe.mock.calls)).not.toContain("LEAK");
  const net = new ObservedPublicTransport(
    {
      get: async () => {
        throw new Error("Bearer LEAK");
      },
    },
    observe,
  );
  await expect(
    net.get(new URL("https://api.geckoterminal.com/api/v2/networks"), {}),
  ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  const timeout = new ObservedPublicTransport(
    {
      get: async () => {
        throw new ProviderError("TIMEOUT");
      },
    },
    observe,
  );
  await expect(
    timeout.get(
      new URL("https://api.gopluslabs.io/api/v1/token_security/1"),
      {},
    ),
  ).rejects.toMatchObject({ code: "TIMEOUT" });
  for (const path of ["/ohlcv/minute", "/trades"])
    await new ObservedPublicTransport(
      { get: async () => ({ status: 200, headers: {}, body: "[]" }) },
      observe,
    ).get(new URL("https://api.geckoterminal.com/pools/p" + path), {});
});

it("records a malformed probe payload as failure before publishing a connection success", async () => {
  const seen: unknown[] = [];
  const t = new ObservedPublicTransport(
    {
      get: async () => ({
        status: 200,
        headers: {},
        body: '{"code":0,"message":"LEAK"}',
      }),
    },
    async (d) => {
      seen.push(d);
    },
    () => Date.parse(eventAt(60)),
    (body) =>
      !!body &&
      typeof body === "object" &&
      (body as Record<string, unknown>).code === 1,
  );
  await expect(
    t.get(new URL("https://api.gopluslabs.io/api/v1/supported_chains"), {}),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
  expect(JSON.stringify(seen)).not.toContain("LEAK");
});
