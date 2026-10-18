import { it, expect, vi } from "vitest";
import {
  GeckoTerminalProvider,
  losslessMarketJson,
} from "../../packages/connectors/market/gecko";
import { ProviderError } from "../../packages/shared/errors";
import { eventAt } from "../../packages/events/demo-data";
const address = "0x" + "1".repeat(40),
  quote = "0x" + "2".repeat(40),
  pool = "0x" + "3".repeat(40);
const p = {
  address: pool,
  dex: "dex",
  quote,
  tokenSide: "base" as const,
  liquidity: "10",
  createdAt: null,
  updatedAt: eventAt(60),
};
const poolBody = () => ({
  data: [
    {
      id: "base_" + pool,
      attributes: {
        address: pool,
        name: "T / USD",
        reserve_in_usd: "12000.123456789012345678",
        pool_created_at: eventAt(8),
      },
      relationships: {
        base_token: { data: { id: "base_" + address } },
        quote_token: { data: { id: "base_" + quote } },
      },
    },
  ],
});
const harness = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" },
  enabled = true,
) => {
  const get = vi.fn(async (_url: URL, _headers: Record<string, string>) => ({
      status,
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })),
    reserve = vi.fn(async () => {}),
    backoff = vi.fn(async (_n: number) => {}),
    provider = new GeckoTerminalProvider(
      { get },
      { reserve, backoff },
      enabled,
      () => Date.parse(eventAt(60)),
    );
  return { get, reserve, backoff, provider };
};
it("keeps raw financial JSON numbers exact, including exponent notation, without corrupting quoted strings", () => {
  expect(
    losslessMarketJson(
      '{"price":0.123456789012345678901,"n":1e-8,"text":"price 1 \\"ok\\"","ok":true}',
    ),
  ).toEqual({
    price: "0.123456789012345678901",
    n: "1e-8",
    text: 'price 1 "ok"',
    ok: true,
  });
  expect(() => losslessMarketJson('{"broken":01}')).toThrow();
  expect(() => losslessMarketJson("x".repeat(2000001))).toThrow();
});
it("validates exact pool-token identity and preserves pool side, source and partial discovery", async () => {
  const h = harness(poolBody()),
    r = await h.provider.pools("base", address);
  expect(r.pools[0]).toMatchObject({
    address: pool,
    tokenSide: "base",
    liquidity: "12000.123456789012345678",
  });
  expect(r.partial).toBe(true);
  expect(h.reserve).toHaveBeenCalledTimes(1);
  expect(h.get.mock.calls[0][0].toString()).toContain(
    "/networks/base/tokens/" + address + "/pools?page=1",
  );
  const second = await harness(poolBody()).provider.pools("base", quote);
  expect(second.pools[0].tokenSide).toBe("quote");
  const invalid = poolBody();
  invalid.data[0].relationships.base_token.data.id =
    "base_" + "0x" + "4".repeat(40);
  await expect(
    harness(invalid).provider.pools("base", address),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(h.provider.pools("base", "DEMO_bad")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  expect(
    (await harness({ data: [] }).provider.pools("base", address)).pools,
  ).toEqual([]);
});
it("normalizes OHLCV with exact JSON lexemes, correct interval/USD/token side and exclusive upper time bound", async () => {
  const time = Math.floor(Date.parse(eventAt(10)) / 1000),
    body = `{"data":{"attributes":{"ohlcv_list":[[${time},0.000000000000000123,0.000000000000000124,0.000000000000000122,0.000000000000000123,12345678901234567.89],[${time + 300},1,1,1,1,null]]}}}`;
  const h = harness(body),
    r = await h.provider.history({
      chain: "base",
      address,
      pool: { ...p, tokenSide: "quote" },
      interval: "5m",
      start: eventAt(0),
      end: eventAt(15),
    });
  expect(r.candles).toHaveLength(1);
  expect(r.candles[0]).toMatchObject({
    open: "0.000000000000000123",
    volume: "12345678901234567.89",
  });
  const url = h.get.mock.calls[0][0] as URL;
  expect(url.searchParams.get("token")).toBe("quote");
  expect(url.searchParams.get("currency")).toBe("usd");
  expect(url.searchParams.get("include_empty_intervals")).toBe("false");
  expect(url.searchParams.get("aggregate")).toBe("5");
  await expect(
    h.provider.history({
      chain: "base",
      address,
      pool: p,
      interval: "5m",
      start: eventAt(10),
      end: eventAt(0),
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  const invalid = harness({
    data: { attributes: { ohlcv_list: [[time, "2", "1", "1", "2", "1"]] } },
  });
  await expect(
    invalid.provider.history({
      chain: "base",
      address,
      pool: p,
      interval: "1m",
      start: eventAt(0),
      end: eventAt(60),
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("derives buys/sells from the exact target address, not the provider kind or symbol", async () => {
  const row = (from: string, to: string, id: string) => ({
    id,
    attributes: {
      block_timestamp: eventAt(10),
      from_token_address: from,
      to_token_address: to,
      from_token_amount: "123",
      to_token_amount: "456",
      volume_in_usd: "9.99",
      tx_from_address: address,
    },
  });
  const r = await harness({
    data: [row(quote, address, "buy"), row(address, quote, "sell")],
  }).provider.trades({ chain: "base", address, pool: p });
  expect(r.trades.map((t) => [t.side, t.tokenAmount])).toEqual([
    ["buy", "456"],
    ["sell", "123"],
  ]);
  expect(r.partial).toBe(true);
  await expect(
    harness({ data: [row(quote, pool, "unrelated")] }).provider.trades({
      chain: "base",
      address,
      pool: p,
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("is disabled by default and bounds 429/backoff without retries or exception body leaks", async () => {
  const disabled = harness({}, 200, {}, false);
  await expect(disabled.provider.pools("base", address)).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  expect(disabled.get).not.toHaveBeenCalled();
  expect(disabled.reserve).not.toHaveBeenCalled();
  const limited = harness("PRIVATE_RESPONSE", 429, { "retry-after": "99999" });
  await expect(limited.provider.pools("base", address)).rejects.toMatchObject({
    code: "RATE_LIMITED",
    retryAfterMs: 3600000,
  });
  expect(limited.get).toHaveBeenCalledTimes(1);
  expect(limited.backoff).toHaveBeenCalledWith(3600);
  const fallback = harness("", 429);
  await expect(fallback.provider.pools("base", address)).rejects.toMatchObject({
    retryAfterMs: 60000,
  });
  for (const [status, code] of [
    [401, "ACCESS_DENIED"],
    [403, "ACCESS_DENIED"],
    [500, "PROVIDER_UNAVAILABLE"],
    [404, "PROVIDER_UNAVAILABLE"],
  ] as const)
    await expect(
      harness("PRIVATE_RESPONSE", status).provider.pools("base", address),
    ).rejects.toMatchObject({ code });
  await expect(
    harness("{}", 200, { "content-type": "text/html" }).provider.pools(
      "base",
      address,
    ),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(
    harness("not json").provider.pools("base", address),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  const gate = harness(poolBody());
  gate.reserve.mockRejectedValue(new ProviderError("RATE_LIMITED"));
  await expect(gate.provider.pools("base", address)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(gate.get).not.toHaveBeenCalled();
});
