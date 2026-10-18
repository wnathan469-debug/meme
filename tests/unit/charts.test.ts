import { it, expect } from "vitest";
import {
  decimal,
  formatDecimal,
  plainDecimal,
  project,
  sum,
  multiply,
  percentChange,
} from "../../packages/charts/decimal";
import {
  parseTokenPath,
  tokenPath,
  buildExternalTokenUrls,
  buildExternalWalletUrl,
  defaultPool,
  candleSlots,
  chartSummary,
  marketCap,
  importantChanges,
  type Candle,
} from "../../packages/charts/model";
import {
  demoChartSnapshot,
  DemoMarketProvider,
  demoPool,
} from "../../packages/charts/demo-data";
import { socialDemoTokens } from "../../packages/social/demo-data";
import { eventAt } from "../../packages/events/demo-data";
const address = socialDemoTokens[0].address;
const c = (m: number, v = "1"): Candle => ({
  at: eventAt(m),
  open: v,
  high: v,
  low: v,
  close: v,
  volume: "0",
  fetchedAt: eventAt(60),
});
it("keeps monetary sums/products and percentage changes exact beyond binary precision", () => {
  expect(sum(["0.1", "0.2"])).toBe("0.3");
  expect(
    multiply(
      "0.000000000000000000000000000000000001",
      "0.000000000000000000000000000000000001",
    ),
  ).toBe("0." + "0".repeat(71) + "1");
  expect(
    formatDecimal(decimal("123456789012345678901234567890.000000000000000001")),
  ).toBe("123456789012345678901234567890.000000000000000001");
  expect(percentChange("0.000000000000000003", "0.000000000000000004")).toBe(
    "33.33",
  );
  expect(percentChange("1", "0.795")).toBe("-20.50");
  expect(percentChange("1", "1.00005")).toBe("0.01");
  expect(percentChange("1", "0.99995")).toBe("-0.01");
  expect(percentChange("0", "1")).toBeNull();
  expect(percentChange("1", "1")).toBe("0.00");
  expect(marketCap("0.000000000001", "100000000000000000000")).toBe(
    "100000000",
  );
  expect(marketCap("1", null)).toBeNull();
  expect(marketCap(null, "1")).toBeNull();
  for (const v of [
    "NaN",
    "Infinity",
    "-1",
    "1e-7",
    "01",
    "0." + "0".repeat(36) + "1",
    "9".repeat(61),
  ])
    expect(() => decimal(v)).toThrow();
  expect(formatDecimal(-decimal("1.25"))).toBe("-1.25");
});
it("expands scientific provider numbers losslessly and refuses unsafe drawing projections", () => {
  expect(plainDecimal("1.234567890123456789e-9")).toBe(
    "0.000000001234567890123456789",
  );
  expect(plainDecimal("1e3")).toBe("1000");
  expect(plainDecimal("1.20e+1")).toBe("12");
  expect(plainDecimal("0e-5")).toBe("0");
  for (const n of ["-1", "1e9999", "1e-99", "nope"])
    expect(() => plainDecimal(n)).toThrow();
  expect(project("0.000001")).toBe(0.000001);
  expect(project("0")).toBe(0);
  for (const n of [
    "1234567890123456",
    "0.1234567890123456",
    "0." + "0".repeat(31) + "1",
    "NaN",
  ])
    expect(project(n)).toBeNull();
});
it("routes by validated chain/address with explicit errors and produces only allowlisted token/wallet links", () => {
  const path = tokenPath("base", address);
  expect(parseTokenPath(path, "DEMO")).toEqual({ chain: "base", address });
  expect(parseTokenPath(path, "REAL")).toBeNull();
  for (const p of [
    "/tokens/base/ORB",
    "/tokens/evil/" + address,
    "/tokens/base/%zz",
    "/tokens/base/" + address + "/extra",
    "/tokens/solana/" + address,
  ])
    expect(parseTokenPath(p, "DEMO")).toBeNull();
  const real = "0x" + "1".repeat(40);
  expect(buildExternalTokenUrls("base", real)[0].url).toBe(
    "https://basescan.org/token/" + real,
  );
  expect(buildExternalTokenUrls("base", real, [])).toEqual([]);
  expect(buildExternalTokenUrls("base", address)).toEqual([]);
  expect(buildExternalWalletUrl("base", real)).toContain("/address/");
  expect(
    buildExternalWalletUrl(
      "solana",
      "So11111111111111111111111111111111111111112",
    ),
  ).toContain("/account/");
  expect(buildExternalWalletUrl("base", address)).toBeNull();
});
it("chooses the highest known liquidity deterministically, keeping missing distinct from zero", () => {
  const p = {
    address: demoPool(1),
    tokenSide: "base" as const,
    dex: "demo",
    quote: "usd",
    liquidity: null,
    createdAt: null,
    updatedAt: eventAt(60),
  };
  expect(defaultPool([])).toBeNull();
  expect(
    defaultPool([p, { ...p, address: demoPool(2), liquidity: "0" }])?.address,
  ).toBe(demoPool(2));
  expect(
    defaultPool([
      { ...p, address: demoPool(3), liquidity: "9007199254740993" },
      { ...p, address: demoPool(2), liquidity: "9007199254740992" },
    ])?.address,
  ).toBe(demoPool(3));
  expect(defaultPool([{ ...p, address: demoPool(2) }, p])?.address).toBe(
    p.address,
  );
  expect(
    defaultPool([
      { ...p, address: demoPool(2), liquidity: "1" },
      { ...p, liquidity: "1" },
    ])?.address,
  ).toBe(p.address);
});
it("shows absent/current/future intervals without interpolation, handles duplicates and refuses incoherent candles", () => {
  const slots = candleSlots(
    [c(0), c(5), c(15)],
    "5m",
    eventAt(0),
    eventAt(20),
    eventAt(60),
  );
  expect(slots.map((s) => !!s.candle)).toEqual([true, true, false, true]);
  expect(chartSummary(slots, eventAt(60), "5m")).toMatchObject({
    change: null,
    volume: null,
    gaps: 1,
  });
  const full = candleSlots(
    [c(0), { ...c(5), close: "2", high: "2" }],
    "5m",
    eventAt(0),
    eventAt(10),
    eventAt(60),
  );
  expect(chartSummary(full, eventAt(60), "5m")).toMatchObject({
    change: "100.00",
    volume: "0",
    complete: true,
    stale: false,
  });
  expect(
    chartSummary(
      candleSlots(
        [c(0), { ...c(5), volume: null }],
        "5m",
        eventAt(0),
        eventAt(10),
        eventAt(60),
      ),
      eventAt(60),
      "5m",
    ).volume,
  ).toBeNull();
  expect(
    candleSlots([c(0)], "5m", eventAt(0), eventAt(5), eventAt(2))[0].reason,
  ).toContain("cours");
  expect(
    candleSlots(
      [{ ...c(0), fetchedAt: eventAt(61) }],
      "5m",
      eventAt(0),
      eventAt(5),
      eventAt(60),
    )[0].candle,
  ).toBeNull();
  expect(
    candleSlots(
      [c(0), { ...c(0), close: "2", high: "2", fetchedAt: eventAt(59) }],
      "5m",
      eventAt(0),
      eventAt(5),
      eventAt(60),
    )[0].candle?.close,
  ).toBe("1");
  expect(() =>
    candleSlots(
      [c(0), { ...c(0), close: "2", high: "2" }],
      "5m",
      eventAt(0),
      eventAt(5),
      eventAt(60),
    ),
  ).toThrow();
  expect(() =>
    candleSlots([c(1)], "5m", eventAt(0), eventAt(5), eventAt(60)),
  ).toThrow();
  expect(() =>
    candleSlots(
      [{ ...c(0), low: "2" }],
      "5m",
      eventAt(0),
      eventAt(5),
      eventAt(60),
    ),
  ).toThrow();
  expect(() =>
    candleSlots([], "1m", eventAt(0), eventAt(1600), eventAt(60)),
  ).toThrow();
  expect(() =>
    candleSlots([], "1m", "invalid", eventAt(5), eventAt(60)),
  ).toThrow();
});
it("flags exact large adjacent changes without bridging a price gap or claiming a withdrawal", () => {
  const slots = candleSlots(
    [c(0), c(5, "2"), c(15, "4")],
    "5m",
    eventAt(0),
    eventAt(20),
    eventAt(60),
  );
  const markers = importantChanges(slots, [
    {
      at: eventAt(0),
      value: "100",
      source: "x",
      fetchedAt: eventAt(60),
      reason: null,
    },
    {
      at: eventAt(5),
      value: "50",
      source: "x",
      fetchedAt: eventAt(60),
      reason: null,
    },
    {
      at: eventAt(10),
      value: null,
      source: "x",
      fetchedAt: eventAt(60),
      reason: "gap",
    },
  ]);
  expect(markers.filter((m) => m.kind === "price_change")).toHaveLength(1);
  expect(markers.find((m) => m.kind === "liquidity_change")?.label).toContain(
    "cause non vérifiée",
  );
  expect(
    chartSummary(
      candleSlots([c(0)], "5m", eventAt(0), eventAt(5), eventAt(70)),
      eventAt(70),
      "5m",
    ).stale,
  ).toBe(true);
});
it("replays fictional pools, gaps, prices, partial volume, marker sources and unavailable states without leaking future data", async () => {
  const input = {
    chain: "base" as const,
    address,
    interval: "5m" as const,
    range: "1h",
    minute: 60,
  };
  const s = demoChartSnapshot(input)!;
  expect(s.selected?.address).toBe(demoPool(801));
  expect(s.slots.find((s) => s.at === eventAt(15))?.candle).toBeNull();
  expect(s.marketCaps.length).toBeGreaterThan(0);
  expect(s.trades.length).toBeGreaterThan(0);
  expect(s.markers.some((m) => m.kind === "event")).toBe(true);
  expect(s.markers.some((m) => m.kind === "x_post")).toBe(true);
  expect(
    demoChartSnapshot({ ...input, pool: demoPool(802) })!.summary.lastPrice,
  ).not.toBe(s.summary.lastPrice);
  expect(
    demoChartSnapshot({ ...input, simulation: "stale" })!.summary.stale,
  ).toBe(true);
  expect(
    demoChartSnapshot({ ...input, simulation: "conflict" })!.conflicts,
  ).toHaveLength(1);
  for (const simulation of ["empty", "unavailable"] as const)
    expect(demoChartSnapshot({ ...input, simulation })!.candles).toEqual([]);
  expect(
    demoChartSnapshot({ ...input, indexerDisabled: true })!.reason,
  ).toContain("exclue");
  expect(
    demoChartSnapshot({ ...input, socialDisabled: true })!.markers.some(
      (m) => m.kind === "x_post",
    ),
  ).toBe(false);
  expect(demoChartSnapshot({ ...input, interval: "1h" })!.candles).toEqual([]);
  expect(demoChartSnapshot({ ...input, minute: 5 })!.trades).toEqual([]);
  expect(
    demoChartSnapshot({ ...input, interval: "1m", range: "7d" })!.limited,
  ).toBe(true);
  expect(demoChartSnapshot({ ...input, address: "invalid" })).toBeNull();
  expect(
    demoChartSnapshot({ ...input, range: "creation" })!.slots.length,
  ).toBeGreaterThan(0);
  const provider = new DemoMarketProvider();
  expect((await provider.pools("base", address)).pools).toHaveLength(2);
  expect(
    (
      await provider.history({
        chain: "base",
        address,
        pool: s.selected!,
        interval: "5m",
        start: eventAt(0),
        end: eventAt(60),
      })
    ).candles.length,
  ).toBeGreaterThan(0);
  expect(
    (await provider.trades({ chain: "base", address, pool: s.selected! }))
      .trades.length,
  ).toBeGreaterThan(0);
});

it("requires a closed candle at fetch time, not just a later replay clock", () => {
  const slots = candleSlots(
    [{ ...c(0), fetchedAt: eventAt(2) }],
    "5m",
    eventAt(0),
    eventAt(5),
    eventAt(60),
  );
  expect(slots[0].candle).toBeNull();
  expect(slots[0].reason).toContain("non clôturée");
});

it("does not report a complete-window financial change when providers disagree", () => {
  const slots = candleSlots(
    [c(0), c(5, "2")],
    "5m",
    eventAt(0),
    eventAt(10),
    eventAt(60),
  );
  expect(chartSummary(slots, eventAt(60), "5m", true).change).toBeNull();
  expect(chartSummary(slots, eventAt(60), "5m", true).volume).toBeNull();
});

it("neutralizes control and bidi characters in hostile token labels without treating markup as HTML", async () => {
  const { displayText } = await import("../../packages/charts/model");
  expect(displayText("Test\u202Eexe\u0000")).toBe("Test�exe�");
  expect(displayText("<img src=x onerror=alert(1)>")).toBe(
    "<img src=x onerror=alert(1)>",
  );
});

it("does not let percentage display rounding turn a sub-threshold change into a signal", () => {
  const slots = candleSlots(
    [c(0), c(5, "1.19995")],
    "5m",
    eventAt(0),
    eventAt(10),
    eventAt(60),
  );
  expect(chartSummary(slots, eventAt(60), "5m").change).toBe("20.00");
  expect(importantChanges(slots, [])).toEqual([]);
  expect(
    importantChanges(
      candleSlots(
        [c(0), c(5, "1.2")],
        "5m",
        eventAt(0),
        eventAt(10),
        eventAt(60),
      ),
      [],
    ),
  ).toHaveLength(1);
});
