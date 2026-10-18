import { it, expect, vi } from "vitest";
import { ChartService } from "../../packages/charts/service";
import { ProviderError } from "../../packages/shared/errors";
const input: any = {
  chain: "base",
  address: "x",
  interval: "5m",
  start: "a",
  end: "b",
  asOf: "c",
};
const fixture = () => {
  const snapshot = {
      selected: { address: "pool", provider: "demo-market-v1" },
      candles: [],
    },
    repository = {
      origin: "DEMO",
      read: vi.fn(async (..._args: any[]) => snapshot),
      claim: vi.fn(async (..._args: any[]) => ({
        id: "claim",
        lease: "lease",
        tokenId: "t",
      })),
      finish: vi.fn(async (..._args: any[]) => ({ status: "stored" })),
      storePools: vi.fn(async (..._args: any[]) => 0),
    },
    provider = {
      origin: "DEMO",
      name: "demo-market-v1",
      pools: vi.fn(async (..._args: any[]) => ({
        pools: [],
        partial: true,
        sourceUrl: "https://demo.memeradar.invalid",
        fetchedAt: "2026-01-01T00:00:00.000Z",
      })),
      history: vi.fn(async (..._args: any[]) => ({
        candles: [],
        liquidity: [],
        marketCaps: [],
        trades: [],
        fetchedAt: "2026-01-01T00:00:00.000Z",
        partial: true,
        sourceUrl: "https://demo.memeradar.invalid",
      })),
      trades: vi.fn(async (..._args: any[]) => ({
        trades: [],
        partial: false,
        fetchedAt: "2026-01-01T00:01:00.000Z",
      })),
    };
  return {
    repository,
    provider,
    service: new ChartService(repository as any, provider as any),
  };
};
it("requires explicit trusted-host confirmation and same origin without starting a call at construction", async () => {
  const f = fixture();
  expect(f.provider.pools).not.toHaveBeenCalled();
  await expect(f.service.discover(input)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(f.service.refresh(input)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  expect(
    () =>
      new ChartService(
        f.repository as any,
        { ...f.provider, origin: "REAL" } as any,
      ),
  ).toThrow();
  await expect(
    new ChartService(f.repository as any, null).discover(input, true),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  await expect(
    new ChartService(f.repository as any, null).refresh(input, true),
  ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  expect((await f.service.discover(input, true)).networkCalls).toBe(0);
  expect(await f.service.read(input)).toEqual({
    selected: { address: "pool", provider: "demo-market-v1" },
    candles: [],
  });
});
it("uses cached/no-pool results without redundant history calls", async () => {
  const f = fixture();
  f.repository.read.mockResolvedValue({ selected: null, candles: [] } as any);
  expect((await f.service.refresh(input, true)).status).toBe("no_pool");
  expect(f.provider.history).not.toHaveBeenCalled();
  f.repository.read.mockResolvedValue({
    selected: { address: "pool", provider: "demo-market-v1" },
    candles: [],
  });
  f.repository.claim.mockResolvedValue(null as any);
  expect((await f.service.refresh(input, true)).status).toBe(
    "cached_or_loading",
  );
  expect(f.provider.history).not.toHaveBeenCalled();
});
it("stores a good price batch when trades fail, marking trade failure separately", async () => {
  const f = fixture();
  f.provider.trades.mockRejectedValue(new ProviderError("RATE_LIMITED"));
  expect((await f.service.refresh(input, true, true)).status).toBe("refreshed");
  expect(f.repository.finish.mock.calls[0][3]).toMatchObject({
    tradesStatus: "error",
    tradesError: "RATE_LIMITED",
  });
  f.provider.trades.mockRejectedValue(new Error("PRIVATE"));
  await f.service.refresh(input, true, true);
  expect(f.repository.finish.mock.calls[1][3]).toMatchObject({
    tradesError: "PROVIDER_UNAVAILABLE",
  });
});
it("records sanitized provider failure while returning the previous cache, and captures successful trade recovery", async () => {
  const f = fixture();
  f.provider.history.mockRejectedValueOnce(new ProviderError("TIMEOUT"));
  expect(await f.service.refresh(input, true)).toMatchObject({
    status: "stale_or_error",
    error: "TIMEOUT",
  });
  expect(f.repository.finish.mock.calls[0][3]).toBeNull();
  f.provider.history.mockRejectedValueOnce(new Error("PRIVATE"));
  expect(await f.service.refresh(input, true)).toMatchObject({
    error: "PROVIDER_UNAVAILABLE",
  });
  await f.service.refresh(input, true, true);
  expect(f.repository.finish.mock.calls.at(-1)?.[3]).toMatchObject({
    tradesStatus: "available",
    fetchedAt: "2026-01-01T00:01:00.000Z",
  });
});
