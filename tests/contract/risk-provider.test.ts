import { it, expect, vi } from "vitest";
import { parseGoPlus, GoPlusRiskProvider } from "../../packages/risks/goplus";
import { riskReport, type RiskIdentity } from "../../packages/risks/model";
import { eventAt } from "../../packages/events/demo-data";
const id: RiskIdentity = {
  origin: "REAL",
  chain: "base",
  address: "0x" + "1".repeat(40),
};
const envelope = (data: Record<string, unknown>) => ({
  code: 1,
  result: { [id.address]: data },
});
const flags = {
  is_mintable: "1",
  is_blacklisted: "0",
  transfer_pausable: "",
  slippage_modifiable: "1",
  is_proxy: "0",
  is_open_source: "0",
  cannot_sell_all: "1",
  is_honeypot: "0",
  owner_address: "0x" + "0".repeat(40),
};
it("maps explicit provider flags without treating missing/empty/non-string values as false", () => {
  const b = parseGoPlus(id, envelope(flags), eventAt(60)),
    r = riskReport(id, [b], eventAt(60));
  expect(r.find((r) => r.check === "mint")?.status).toBe("signal_detected");
  expect(r.find((r) => r.check === "unverified")?.status).toBe(
    "signal_detected",
  );
  expect(r.find((r) => r.check === "pause")?.status).toBe("insufficient_data");
  expect(r.find((r) => r.check === "owner")?.status).toBe("no_signal_detected");
  for (const value of [undefined, "", false, 0, "false", "2"])
    expect(
      parseGoPlus(
        id,
        envelope({ is_honeypot: value }),
        eventAt(60),
      ).observations.find((o) => o.check === "honeypot")?.result,
    ).toBe("unknown");
  expect(
    parseGoPlus(
      id,
      envelope({ owner_address: id.address, is_open_source: "1" }),
      eventAt(60),
    ).observations.at(-1)?.result,
  ).toBe("signal");
  expect(
    parseGoPlus(id, envelope({}), eventAt(60)).observations.at(-1)?.result,
  ).toBe("unknown");
});
it("requires the requested chain/address and a success envelope", () => {
  expect(() =>
    parseGoPlus({ ...id, origin: "DEMO" }, envelope(flags), eventAt(60)),
  ).toThrow();
  expect(() =>
    parseGoPlus(
      {
        ...id,
        chain: "solana",
        address: "So11111111111111111111111111111111111111112",
      },
      envelope(flags),
      eventAt(60),
    ),
  ).toThrow();
  expect(() => parseGoPlus(id, { code: 1, result: {} }, eventAt(60))).toThrow();
  expect(() => parseGoPlus(id, { code: 0, result: {} }, eventAt(60))).toThrow();
});
const setup = (
  status = 200,
  body = JSON.stringify(envelope(flags)),
  enabled = true,
) => {
  const get = vi.fn(async (_url: URL, _headers: Record<string, string>) => ({
      status,
      headers: { "retry-after": "123" },
      body,
    })),
    reserve = vi.fn(async () => {}),
    backoff = vi.fn(async (_s: number) => {});
  return {
    get,
    reserve,
    backoff,
    provider: new GoPlusRiskProvider(
      { get },
      { reserve, backoff },
      enabled,
      () => Date.parse(eventAt(60)),
    ),
  };
};
it("makes one fixed GET after reservation, no startup request, supports the four EVM networks", async () => {
  const s = setup();
  expect(s.get).not.toHaveBeenCalled();
  for (const [chain, n] of [
    ["base", 8453],
    ["ethereum", 1],
    ["bsc", 56],
    ["arbitrum", 42161],
  ] as const) {
    const b = await s.provider.read({ ...id, chain });
    expect(b.chain).toBe(chain);
    expect(s.get.mock.calls.at(-1)?.[0].toString()).toBe(
      `https://api.gopluslabs.io/api/v1/token_security/${n}?contract_addresses=${id.address}`,
    );
  }
  expect(s.reserve).toHaveBeenCalledTimes(4);
  expect(s.get).toHaveBeenCalledTimes(4);
});
it("blocks disabled, malformed and cross-origin requests before network", async () => {
  const s = setup(200, undefined, false);
  await expect(s.provider.read(id)).rejects.toMatchObject({
    code: "NOT_CONFIGURED",
  });
  expect(s.get).not.toHaveBeenCalled();
  await expect(
    setup().provider.read({ ...id, address: "ORB" }),
  ).rejects.toThrow();
  await expect(
    setup().provider.read({ ...id, origin: "DEMO" }),
  ).rejects.toThrow();
  await expect(
    setup().provider.read({
      ...id,
      chain: "solana",
      address: "So11111111111111111111111111111111111111112",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("honors a shared rate limit without retries and sanitizes failures", async () => {
  const s = setup(429);
  await expect(s.provider.read(id)).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  expect(s.backoff).toHaveBeenCalledWith(123);
  expect(s.get).toHaveBeenCalledTimes(1);
  await expect(
    setup(503, "sensitive failure body").provider.read(id),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  for (const body of [
    "not json",
    JSON.stringify({ code: 0 }),
    "x".repeat(2000001),
  ])
    await expect(setup(200, body).provider.read(id)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  const blocked = setup();
  blocked.reserve.mockRejectedValueOnce(new Error("blocked"));
  await expect(blocked.provider.read(id)).rejects.toThrow("blocked");
  expect(blocked.get).not.toHaveBeenCalled();
});

it("does not clear unknown contract scope or tokens absent from a DEX", () => {
  const full = {
    is_open_source: "1",
    is_proxy: "0",
    is_mintable: "0",
    is_in_dex: "1",
    is_honeypot: "0",
  };
  const read = (d: Record<string, unknown>) =>
    parseGoPlus(id, envelope(d), eventAt(60)).observations;
  expect(read(full).find((o) => o.check === "mint")?.result).toBe("clear");
  expect(
    read({ ...full, is_proxy: "1" }).find((o) => o.check === "mint")?.result,
  ).toBe("unknown");
  expect(
    read({ ...full, is_open_source: "0" }).find((o) => o.check === "mint")
      ?.result,
  ).toBe("unknown");
  expect(
    read({ ...full, is_in_dex: "0" }).find((o) => o.check === "honeypot")
      ?.result,
  ).toBe("unknown");
  expect(
    read({ ...full, is_in_dex: "0", is_honeypot: "1" }).find(
      (o) => o.check === "honeypot",
    )?.result,
  ).toBe("signal");
});
