import { describe, it, expect, vi } from "vitest";
import {
  XFilteredStream,
  type RuleTransport,
} from "../../packages/connectors/x/stream-client";
import { MemoryControlStore } from "../../packages/connectors/x/control";
import {
  SafeStreamTransport,
  ndjson,
  type StreamTransport,
} from "../../packages/shared/stream-http";
import { SafeHttpTransport } from "../../packages/shared/http";
import { FakeClock, config } from "../fixtures/x/test-tools";
import raw from "../fixtures/x/posts.json";
import type { XPage, XPost } from "../../packages/connectors/x/contracts";
import type { XStreamRule } from "../../packages/connectors/x/stream-contracts";
const localId = "00000000-0000-4000-8000-000000000001";
class Rules implements RuleTransport {
  data: { id: string; value: string; tag?: string }[] = [
    { id: "99", value: "foreign", tag: "other_app" },
  ];
  calls: { method: string; body: any }[] = [];
  async send(
    _url: URL,
    _headers: Record<string, string>,
    method: "GET" | "POST",
    body?: string,
  ) {
    const input = body ? JSON.parse(body) : null;
    this.calls.push({ method, body: input });
    if (input?.delete) {
      const n = input.delete.ids.length;
      this.data = this.data.filter((r) => !input.delete.ids.includes(r.id));
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          meta: { summary: { deleted: n, not_deleted: 0 } },
        }),
      };
    }
    let data = this.data;
    if (input?.add) {
      data = input.add.map((r: any, i: number) => ({
        id: String(100 + this.data.length + i),
        ...r,
      }));
      this.data.push(...data);
    }
    return { status: 200, headers: {}, body: JSON.stringify({ data }) };
  }
}
async function setup(
  frames: unknown[] = [],
  status = 200,
  headers: Record<string, string> = {},
) {
  const cfg = await config(),
    clock = new FakeClock(),
    store = new MemoryControlStore(),
    rules = new Rules(),
    close = vi.fn(async () => {});
  const transport: StreamTransport = {
    open: vi.fn(async () => ({
      status,
      headers,
      body: (async function* () {
        for (const frame of frames)
          yield Buffer.from(JSON.stringify(frame) + "\r\n");
      })(),
      close,
    })),
  };
  const settings = {
    ...cfg.streaming,
    billingBoundVerified: true,
    billableMaxPosts: 10,
    maxPosts: 2,
    windowMs: 1000,
    idleMs: 10,
    tagPrefix: "mr:test:",
  };
  const client = new XFilteredStream(
    cfg,
    settings,
    transport,
    store,
    rules,
    clock,
  );
  return { client, cfg, settings, clock, store, rules, transport, close };
}
function frame(remoteId: string) {
  return {
    data: raw.data[0],
    includes: raw.includes,
    matching_rules: [{ id: remoteId }],
  };
}
describe("bounded filtered stream and remote rule ownership", () => {
  it("merges equal rules, preserves foreign rules and removes only stale owned rules", async () => {
    const { client, rules } = await setup();
    const merged = await client.setRules([
      { localId, query: "fict" },
      { localId: "00000000-0000-4000-8000-000000000002", query: "fict" },
    ]);
    expect(merged.rules).toHaveLength(1);
    expect(merged.rules[0].localIds).toHaveLength(2);
    expect(rules.data.some((r) => r.tag === "other_app")).toBe(true);
    await client.setRules([{ localId, query: "changed" }]);
    expect(rules.data.map((r) => r.value).sort()).toEqual([
      "changed",
      "foreign",
    ]);
  });
  it("reserves a verified window envelope, routes matching frames and closes on limits", async () => {
    const s = await setup();
    const synced = await s.client.setRules([{ localId, query: "fict" }]);
    const remoteId = synced.rules[0].remoteId;
    vi.mocked(s.transport.open).mockResolvedValue({
      status: 200,
      headers: {},
      body: (async function* () {
        yield Buffer.from(
          JSON.stringify(frame(remoteId)) +
            "\n" +
            JSON.stringify(frame(remoteId)) +
            "\n",
        );
      })(),
      close: s.close,
    });
    const received = vi.fn(async (_page: XPage<XPost>, _ids: string[]) => {}),
      connected = vi.fn();
    const outcome = await s.client.connect(received, { onConnected: connected })
      .done;
    expect(outcome).toEqual({ reason: "rotated", posts: 2 });
    expect(received).toHaveBeenCalledTimes(2);
    expect(received.mock.calls[0][1]).toEqual([localId]);
    expect(connected).toHaveBeenCalledOnce();
    expect(s.close).toHaveBeenCalledOnce();
    expect((await s.store.usage()).at(-1)).toMatchObject({
      endpoint: "stream",
      costMicros: "33",
      posts: 2,
      users: 2,
    });
  });
  it("treats socket EOF as an interruption and charges the conservative window bound", async () => {
    const s = await setup();
    await s.client.setRules([{ localId, query: "fict" }]);
    expect(await s.client.connect(async () => {}).done).toMatchObject({
      reason: "disconnected",
      posts: 0,
    });
    expect((await s.store.usage()).at(-1)?.costMicros).toBe("33");
  });
  it.each([401, 403, 429, 503])(
    "handles HTTP %s with typed failure and shared controls",
    async (status) => {
      const s = await setup([], status, { "retry-after": "5" });
      await s.client.setRules([{ localId, query: "fict" }]);
      await expect(s.client.connect(async () => {}).done).rejects.toMatchObject(
        {
          code:
            status === 429
              ? "RATE_LIMITED"
              : status === 503
                ? "PROVIDER_UNAVAILABLE"
                : "ACCESS_DENIED",
        },
      );
      if (status === 401 || status === 403)
        expect((await s.store.capability("stream"))?.state).toBe("unavailable");
      if (status === 429)
        await expect(
          s.store.takeRate("stream", s.clock.now(), 1),
        ).rejects.toMatchObject({ retryAfterMs: 5000 });
    },
  );
  it("rejects unverified billing, exhausted budgets, demo networking and malformed stream data before persistence", async () => {
    const s = await setup();
    const unverified = new XFilteredStream(
      s.cfg,
      { ...s.settings, billingBoundVerified: false },
      s.transport,
      s.store,
      s.rules,
      s.clock,
    );
    await expect(
      unverified.setRules([{ localId, query: "fict" }]),
    ).rejects.toMatchObject({ code: "PRICING_UNKNOWN" });
    expect(s.rules.calls).toHaveLength(0);
    const demo = new XFilteredStream(
      { ...s.cfg, mode: "demo" },
      s.settings,
      s.transport,
      s.store,
      s.rules,
      s.clock,
    );
    await expect(demo.setRules([])).rejects.toMatchObject({
      code: "NETWORK_DISABLED",
    });
    const empty = new XFilteredStream(
      {
        ...s.cfg,
        budget: { daily: "0", monthly: "0", warningPercent: 80, features: {} },
      },
      s.settings,
      s.transport,
      new MemoryControlStore(),
      s.rules,
      s.clock,
    );
    await expect(
      empty.setRules([{ localId, query: "fict" }]),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const invalid = await setup([
      { errors: [{ detail: "secret untrusted response" }] },
    ]);
    await invalid.client.setRules([{ localId, query: "fict" }]);
    const persist = vi.fn(async () => {});
    await expect(invalid.client.connect(persist).done).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(persist).not.toHaveBeenCalled();
  });
  it("cancels before any stream connection and cleans up a silent timeout", async () => {
    const s = await setup();
    await s.client.setRules([{ localId, query: "fict" }]);
    const controller = new AbortController();
    controller.abort();
    expect(
      await s.client.connect(async () => {}, { signal: controller.signal })
        .done,
    ).toMatchObject({ reason: "stopped" });
    expect(s.transport.open).not.toHaveBeenCalled();
    vi.mocked(s.transport.open).mockResolvedValue({
      status: 200,
      headers: {},
      body: {
        [Symbol.asyncIterator]() {
          return { next: () => new Promise(() => {}) };
        },
      },
      close: s.close,
    });
    await expect(s.client.connect(async () => {}).done).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(s.close).toHaveBeenCalled();
  });
});
it("parses NDJSON across UTF8 chunk boundaries and rejects oversized, malformed and truncated records", async () => {
  const controller = new AbortController();
  async function parse(chunks: Uint8Array[], max = 1000) {
    const result = [];
    for await (const item of ndjson(
      (async function* () {
        yield* chunks;
      })(),
      { signal: controller.signal, idleMs: 100, maxLineBytes: max },
    ))
      result.push(item);
    return result;
  }
  const bytes = Buffer.from('\r\n{"text":"boréale"}\n');
  expect(await parse([bytes.subarray(0, 15), bytes.subarray(15)])).toEqual([
    { text: "boréale" },
  ]);
  for (const value of [
    "invalid\n",
    '{"unfinished":',
    '{"large":"' + "x".repeat(50) + '"}\n',
  ])
    await expect(parse([Buffer.from(value)], 20)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
});
it("refuses stream DEMO before DNS and rejects unsafe DNS or POST redirection", async () => {
  const resolve = vi.fn(async () => ["127.0.0.1"]);
  await expect(
    new SafeStreamTransport({
      mode: "demo",
      allowedHosts: ["api.x.com"],
      resolve,
    }).open(
      new URL("https://api.x.com/2/tweets/search/stream"),
      {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
  expect(resolve).not.toHaveBeenCalled();
  await expect(
    new SafeStreamTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      resolve,
    }).open(
      new URL("https://api.x.com/2/tweets/search/stream"),
      {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "UNSAFE_URL" });
  const http = new SafeHttpTransport({
    mode: "live",
    allowedHosts: ["api.x.com"],
    resolve: async () => ["8.8.8.8"],
    wire: async () => ({
      status: 302,
      headers: { location: "/redirect" },
      body: "",
    }),
  });
  await expect(
    http.send(
      new URL("https://api.x.com/2/tweets/search/stream/rules"),
      {},
      "POST",
      "{}",
    ),
  ).rejects.toMatchObject({ code: "UNSAFE_URL" });
});

it("does not retry an ambiguously sent rules mutation and never connects after a rule denial", async () => {
  const s = await setup();
  s.rules.send = vi.fn(async (_url, _headers, method) =>
    method === "GET"
      ? { status: 200, headers: {}, body: '{"data":[]}' }
      : { status: 503, headers: {}, body: "{}" },
  );
  await expect(
    s.client.setRules([{ localId, query: "fict" }]),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  expect(
    vi.mocked(s.rules.send).mock.calls.filter((call) => call[2] === "POST"),
  ).toHaveLength(1);
  expect(s.transport.open).not.toHaveBeenCalled();
  const denied = await setup();
  denied.rules.send = vi.fn(async () => ({
    status: 403,
    headers: {},
    body: "{}",
  }));
  await expect(
    denied.client.setRules([{ localId, query: "fict" }]),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(denied.rules.calls).toHaveLength(0);
  expect(denied.transport.open).not.toHaveBeenCalled();
});
