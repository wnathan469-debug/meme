import { it, expect } from "vitest";
import {
  riskReport,
  checks,
  type RiskIdentity,
} from "../../packages/risks/model";
import {
  observation,
  holdersObservation,
  movementObservation,
  liquidityObservation,
  lpObservation,
  solanaMintBatch,
  solanaMetadataObservation,
} from "../../packages/risks/adapters";
import {
  demoRiskBatches,
  demoRiskReport,
} from "../../packages/risks/demo-data";
import { eventAt } from "../../packages/events/demo-data";
const id: RiskIdentity = {
  origin: "DEMO",
  chain: "base",
  address: "0xDEMO" + "0".repeat(34) + "42",
};
const p = {
  source: "[DÉMO] Test",
  url: "https://demo.memeradar.invalid/risks",
  observedAt: eventAt(60),
  fetchedAt: eventAt(60),
  limitations: "Fixture partielle, aucune sécurité garantie.",
};
const obs = (
  result: "signal" | "clear" | "unknown" | "error",
  complete = true,
) => observation(p, "mint", result, "Observation de test", complete);
const report = (observations: ReturnType<typeof obs>[], at = eventAt(60)) =>
  riskReport(id, [{ ...id, observations }], at).find(
    (r) => r.check === "mint",
  )!;
const addr = (n: number) =>
  "0xDEMO" + "0".repeat(34) + String(n).padStart(2, "0");
it("reports every check with all five meaningful statuses in the demo", () => {
  const r = demoRiskReport(id, 60);
  expect(r).toHaveLength(Object.keys(checks).length);
  expect(new Set(r.map((o) => o.status)).size).toBe(5);
  expect(
    demoRiskReport(id, 10).every(
      (r) => r.status === "insufficient_data" || r.status === "not_applicable",
    ),
  ).toBe(true);
  expect(
    demoRiskReport(id, 60, "failed").find((r) => r.check === "honeypot")
      ?.status,
  ).toBe("check_failed");
  expect(
    demoRiskReport(id, 60, "stale").find((r) => r.check === "holders")?.status,
  ).toBe("insufficient_data");
  expect(
    demoRiskReport(id, 60, "conflict").find((r) => r.check === "holders")
      ?.status,
  ).toBe("insufficient_data");
  expect(() => demoRiskBatches({ ...id, origin: "REAL" }, 60)).toThrow();
});
it.each([
  ["signal", true, "signal_detected"],
  ["clear", true, "no_signal_detected"],
  ["clear", false, "insufficient_data"],
  ["unknown", true, "insufficient_data"],
  ["error", false, "check_failed"],
] as const)("keeps %s and coverage %s distinct", (r, c, status) =>
  expect(report([obs(r, c)]).status).toBe(status),
);
it("keeps contradictions, staleness and absent data visible without a safe verdict", () => {
  expect(
    report([obs("signal"), { ...obs("clear"), source: "Other" }]).explanation,
  ).toContain("contradictoires");
  expect(report([obs("clear")], eventAt(66)).status).toBe("insufficient_data");
  expect(report([obs("clear")], eventAt(59)).evidence).toEqual([]);
  expect(report([{ ...obs("clear"), fetchedAt: eventAt(61) }]).status).toBe(
    "insufficient_data",
  );
  expect(report([{ ...obs("clear"), observedAt: eventAt(61) }]).status).toBe(
    "insufficient_data",
  );
  expect(
    report([{ ...obs("signal"), observedAt: eventAt(50) }, obs("clear")])
      .status,
  ).toBe("no_signal_detected");
  expect(
    report([{ ...obs("clear"), observedAt: eventAt(55) }, obs("error")]).status,
  ).toBe("check_failed");
});
it("rejects cross-chain, cross-origin, cross-token and unsafe provenance", () => {
  for (const b of [
    { ...id, chain: "ethereum" as const },
    { ...id, address: addr(3) },
    { ...id, origin: "REAL" as const },
  ])
    expect(() =>
      riskReport(id, [{ ...b, observations: [obs("clear")] }], eventAt(60)),
    ).toThrow();
  expect(() =>
    riskReport({ ...id, address: "ORB" }, [], eventAt(60)),
  ).toThrow();
  for (const url of [
    "http://demo.memeradar.invalid/r",
    "javascript:alert(1)",
    "https://u:p@demo.memeradar.invalid",
    "https://real.example/r",
  ])
    expect(() =>
      riskReport(
        id,
        [{ ...id, observations: [{ ...obs("clear"), url }] }],
        eventAt(60),
      ),
    ).toThrow();
});
it("excludes only verified pool, burn and lock roles; keeps the total-supply denominator", () => {
  const holders = [
    { address: addr(1), amount: "500", role: "pool", roleVerified: true },
    { address: addr(2), amount: "100", role: "wallet", roleVerified: true },
    { address: addr(3), amount: "50", role: "burn", roleVerified: true },
    { address: addr(4), amount: "50", role: "lock", roleVerified: true },
  ];
  const h = holdersObservation(
    id,
    { supply: "1000", complete: false, holders },
    p,
  );
  expect(h.result).toBe("signal");
  expect(h.detail).toContain("Top 1 : 10 %");
  holders[0].roleVerified = false;
  expect(
    holdersObservation(id, { supply: "1000", complete: true, holders }, p)
      .result,
  ).toBe("unknown");
  expect(
    holdersObservation(id, { supply: "1000", complete: true, holders: [] }, p)
      .result,
  ).toBe("unknown");
  expect(() =>
    holdersObservation(id, { supply: "0", complete: true, holders: [] }, p),
  ).toThrow();
  expect(() =>
    holdersObservation(id, { supply: "1", complete: true, holders }, p),
  ).toThrow();
  expect(() =>
    holdersObservation(
      id,
      { supply: "1000", complete: true, holders: [holders[0], holders[0]] },
      p,
    ),
  ).toThrow();
  expect(() =>
    holdersObservation(
      id,
      {
        supply: "1000",
        complete: true,
        holders: [{ ...holders[0], address: "bad" }],
      },
      p,
    ),
  ).toThrow();
});
it("does not round exact holder thresholds up or turn partial samples into absence", () => {
  const h = {
    address: addr(1),
    amount: "999999999999999999999999",
    role: "wallet",
    roleVerified: true,
  };
  expect(
    holdersObservation(
      id,
      {
        supply: "10000000000000000000000000",
        complete: true,
        holders: [
          h,
          {
            address: addr(2),
            amount: "9000000000000000000000001",
            role: "pool",
            roleVerified: true,
          },
        ],
      },
      p,
    ).result,
  ).toBe("clear");
  expect(
    holdersObservation(
      id,
      { supply: "10000000000000000000000000", complete: false, holders: [h] },
      p,
    ).result,
  ).toBe("unknown");
  expect(
    holdersObservation(
      id,
      {
        supply: "1000",
        complete: true,
        holders: [{ ...h, amount: "1", role: "unknown" }],
      },
      p,
    ).result,
  ).toBe("unknown");
});
it("interprets movements as transfers, preserving creator and transaction evidence", () => {
  const r = {
    wallet: addr(2),
    amount: "10",
    direction: "out" as const,
    creator: false,
    tx: "DEMO_TX",
  };
  expect(movementObservation(id, "1000", [r], false, p).result).toBe("signal");
  expect(
    movementObservation(
      id,
      "1000",
      [{ ...r, amount: "1", creator: true }],
      false,
      p,
    ).result,
  ).toBe("signal");
  expect(
    movementObservation(id, "1000", [{ ...r, amount: "1" }], true, p).result,
  ).toBe("clear");
  expect(movementObservation(id, "1000", [], false, p).result).toBe("unknown");
  expect(() => movementObservation(id, "0", [], true, p)).toThrow();
  expect(() =>
    movementObservation(id, "1000", [{ ...r, wallet: "invalid" }], true, p),
  ).toThrow();
});
it.each([
  ["100", "80", "signal"],
  ["100", "80.000000000000000001", "clear"],
  [null, "0", "unknown"],
  ["0", "0", "unknown"],
  ["100", "120", "clear"],
] as const)("compares liquidity %s to %s exactly", (a, b, result) =>
  expect(liquidityObservation(a, b, p).result).toBe(result),
);
it.each([
  ["locked", true, eventAt(61), "clear"],
  ["locked", true, eventAt(60), "signal"],
  ["locked", true, null, "unknown"],
  ["burned", true, null, "clear"],
  ["burned", false, null, "unknown"],
  ["unlocked", false, null, "signal"],
  ["unknown", false, null, "unknown"],
] as const)("handles LP %s, coverage %s, expiry %s", (s, c, e, result) =>
  expect(lpObservation(s, c, e, p).result).toBe(result),
);
const sol: RiskIdentity = {
  origin: "REAL",
  chain: "solana",
  address: "So11111111111111111111111111111111111111112",
};
const sp = {
  ...p,
  url: "https://api.mainnet-beta.solana.com",
  source: "Solana jsonParsed fixture",
};
const mint = (extended = false, extensions?: unknown[]) => ({
  owner: extended
    ? "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    : "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  data: {
    program: extended ? "spl-token-2022" : "spl-token",
    parsed: {
      type: "mint",
      info: {
        isInitialized: true,
        mintAuthority: sol.address,
        freezeAuthority: null,
        ...(extensions ? { extensions } : {}),
      },
    },
  },
});
it("recognizes Solana mint/freeze authorities, program identity and missing metadata", () => {
  const b = solanaMintBatch(sol, mint(), sp),
    r = riskReport(sol, [b], eventAt(60));
  expect(r.find((r) => r.check === "mint_authority")?.status).toBe(
    "signal_detected",
  );
  expect(r.find((r) => r.check === "freeze_authority")?.status).toBe(
    "no_signal_detected",
  );
  expect(r.find((r) => r.check === "extensions")?.status).toBe(
    "no_signal_detected",
  );
  expect(r.find((r) => r.check === "metadata_authority")?.status).toBe(
    "insufficient_data",
  );
  expect(r.find((r) => r.check === "owner")?.status).toBe("not_applicable");
  expect(solanaMintBatch(sol, mint(true), sp).observations[2].result).toBe(
    "unknown",
  );
  expect(solanaMintBatch(sol, mint(true, []), sp).observations[2].result).toBe(
    "clear",
  );
  expect(
    solanaMintBatch(sol, mint(true, [{ extension: "transferHook" }]), sp)
      .observations[2].result,
  ).toBe("signal");
  expect(() => solanaMintBatch(id, mint(), p)).toThrow();
  expect(() =>
    solanaMintBatch(sol, { ...mint(), owner: "unexpected-program" }, sp),
  ).toThrow();
  const bad = mint();
  bad.data.parsed.info.mintAuthority = "bad";
  expect(() => solanaMintBatch(sol, bad, sp)).toThrow();
  expect(
    demoRiskReport(
      { ...id, chain: "solana", address: "DEMo" + "A".repeat(32) },
      60,
    ).find((r) => r.check === "extensions")?.status,
  ).toBe("signal_detected");
});

it("binds Metaplex metadata and validity deadlines", () => {
  const data = {
    owner: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    mint: sol.address,
    updateAuthority: sol.address,
    isMutable: true,
  };
  expect(solanaMetadataObservation(sol, data, sp).result).toBe("signal");
  expect(
    solanaMetadataObservation(sol, { ...data, isMutable: false }, sp).result,
  ).toBe("clear");
  expect(() =>
    solanaMetadataObservation(sol, { ...data, mint: "bad" }, sp),
  ).toThrow();
  expect(() => solanaMetadataObservation(id, data, p)).toThrow();
  const o = lpObservation("locked", true, eventAt(62), p);
  const r = riskReport(id, [{ ...id, observations: [o] }], eventAt(63)).find(
    (r) => r.check === "lp",
  );
  expect(r?.status).toBe("insufficient_data");
});
