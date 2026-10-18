import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { events, tokens, initialAlerts } from "../../packages/core/demo";
import {
  associate,
  isDemoAddress,
  externalRequest,
  NetworkDisabledInDemoMode,
  indicators,
  evaluateAttention,
  replayAlerts,
} from "../../packages/core/domain";
import {
  defaultState,
  stateSchema,
  ruleSchema,
} from "../../apps/web/src/state";
const require = createRequire(import.meta.url);
const desktopSchema = require("../../apps/desktop/preferences.cjs").schema;
const rule = {
  id: "test",
  name: "Test",
  threshold: 70,
  resetBelow: 30,
  cooldown: 30,
  enabled: true,
};
describe("Origine et fixtures", () => {
  it("garde tous les scénarios et tokens fictifs", () => {
    expect(events).toHaveLength(3);
    expect(tokens).toHaveLength(8);
    for (const event of events) {
      expect(event.data_origin).toBe("DEMO");
      expect(event.title).toContain("[DÉMO]");
      expect(event.items.filter((i) => i.tier === "A")).toHaveLength(1);
      expect(event.items.filter((i) => i.tier === "B")).toHaveLength(5);
      expect(event.items.filter((i) => i.tier === "D")).toHaveLength(20);
      for (const item of event.items)
        expect(new URL(item.url).hostname).toBe("demo.memeradar.invalid");
    }
    for (const token of tokens) {
      expect(isDemoAddress(token.address)).toBe(true);
      expect(token.data_origin).toBe("DEMO");
      for (const metric of [token.price, token.volume, token.liquidity])
        expect(new URL(metric.url).hostname).toBe("demo.memeradar.invalid");
    }
    expect(initialAlerts).toHaveLength(3);
    expect(initialAlerts.filter((a) => a.suppressed)).toHaveLength(1);
  });
  it.each([
    "0x" + "a".repeat(40),
    "DEMo",
    "0xDEMO123",
    "https://example.org",
    "",
    "DEMo" + "0".repeat(32),
  ])("rejette la fausse adresse %s", (value) =>
    expect(isDemoAddress(value)).toBe(false),
  );
  it("bloque une sortie avant toute utilisation de fetch", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(() => externalRequest()).toThrow(NetworkDisabledInDemoMode);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
describe("Association pédagogique", () => {
  it("sépare plausible, faible et manque de données", () => {
    expect(associate(tokens[0]).level).toBe("PLAUSIBLE");
    expect(associate(tokens[1]).level).toBe("WEAK");
    expect(associate(tokens[3]).level).toBe("INSUFFICIENT_DATA");
  });
  it("signale la revendication officielle sans la confirmer", () => {
    const result = associate(tokens[2]);
    expect(result.impersonation).toBe(true);
    expect(result.level).toBe("WEAK");
    expect(result.counter_reasons.join()).toContain(
      "sans publication officielle",
    );
  });
  it("ne confirme jamais une fixture sur son nom", () => {
    for (const token of tokens)
      for (const name of [
        "Official Tesla",
        "Verified",
        "Real",
        "Nom sans rapport",
      ])
        expect(
          associate({ ...token, name, officialClaim: true }).level,
        ).not.toBe("CONFIRMED");
  });
  it("exige une preuve supplémentaire et une fenêtre cohérente", () => {
    expect(associate({ ...tokens[0], additionalEvidence: false }).level).toBe(
      "WEAK",
    );
    expect(associate({ ...tokens[0], minute: 121 }).level).toBe("WEAK");
    expect(
      associate({ ...tokens[0], minute: -1 }).counter_reasons.join(),
    ).toContain("antérieure");
  });
});
describe("Cinq indicateurs indépendants", () => {
  it("explique chaque niveau et versionne les règles", () => {
    const result = indicators(tokens[0], events[0], 60);
    expect(result).toHaveLength(5);
    for (const indicator of result) {
      expect(indicator.inputs_used.length).toBeGreaterThan(0);
      expect(indicator.factors.length).toBeGreaterThan(0);
      expect(indicator.algorithm_version).toMatch(/@1\.0\.0$/);
      expect(indicator.computed_at).toBe("2026-01-15T15:00:00.000Z");
    }
  });
  it("ne remplace pas les entrées absentes par un niveau faible", () => {
    const result = indicators(tokens[3], events[0], 60);
    for (const indicator of result.filter((r) => r.indicator !== "ATTENTION")) {
      expect(indicator.level).toBe("INSUFFICIENT_DATA");
      expect(indicator.missing_inputs.length).toBeGreaterThan(0);
      expect(indicator.factors).toEqual([]);
    }
  });
  it("distingue tous les seuils d’attention", () => {
    const result = [0, 20, 40, 60].map(
      (min) => indicators(tokens[0], events[0], min)[0].level,
    );
    expect(result).toEqual(["LOW", "LOW", "HIGH", "VERY_HIGH"]);
    expect(indicators(tokens[0], events[0], 35)[0].level).toBe("MODERATE");
  });
  it("reste borné à la fin du rejeu", () =>
    expect(indicators(tokens[0], events[0], 200)[0].inputs_used[0].value).toBe(
      "5",
    ));
  it("ne transforme pas un contrôle manquant en absence de risque", () => {
    const missing = { ...tokens[0], risks: tokens[3].risks };
    expect(
      indicators(missing, events[0], 60).find(
        (i) => i.indicator === "ONCHAIN_RISK",
      )?.level,
    ).toBe("INSUFFICIENT_DATA");
    const medium = {
      ...tokens[0],
      risks: tokens[0].risks.filter((r) => r.severity !== "high"),
    };
    expect(
      indicators(medium, events[0], 60).find(
        (i) => i.indicator === "ONCHAIN_RISK",
      )?.level,
    ).toBe("MODERATE");
  });
});
describe("Alertes déterministes", () => {
  it("déclenche au seuil puis exige le réarmement", () => {
    const first = evaluateAttention(70, 10, rule, {
      armed: true,
      lastAt: null,
    });
    expect(first.fire).toBe(true);
    expect(evaluateAttention(100, 80, rule, first.state).fire).toBe(false);
    const reset = evaluateAttention(20, 85, rule, first.state);
    expect(reset.state.armed).toBe(true);
    expect(evaluateAttention(80, 90, rule, reset.state).fire).toBe(true);
  });
  it("respecte le délai même après réarmement", () => {
    const result = evaluateAttention(80, 20, rule, { armed: true, lastAt: 10 });
    expect(result.fire).toBe(false);
    expect(result.reason).toContain("récupération");
  });
  it("ne déclenche pas une règle désactivée ou un seuil non atteint", () => {
    expect(
      evaluateAttention(
        80,
        10,
        { ...rule, enabled: false },
        { armed: true, lastAt: null },
      ).fire,
    ).toBe(false);
    expect(
      evaluateAttention(40, 10, rule, { armed: true, lastAt: null }).fire,
    ).toBe(false);
  });
  it("rejoue sans doublon et ne montre pas de futur", () => {
    const a = replayAlerts(events, rule, 120);
    expect(replayAlerts(events, rule, 120)).toEqual(a);
    expect(new Set(a.map((v) => v.id)).size).toBe(a.length);
    expect(a.some((v) => v.suppressed)).toBe(true);
    expect(replayAlerts(events, rule, 0)).toEqual([]);
    expect(replayAlerts(events, rule, 60).every((v) => v.minute <= 60)).toBe(
      true,
    );
  });
});
describe("Préférences aux deux frontières", () => {
  it("partage les valeurs valides entre le renderer et Electron", () => {
    for (const theme of ["light", "dark"] as const) {
      const state = { ...defaultState, theme };
      expect(stateSchema.parse(state)).toEqual(desktopSchema.parse(state));
    }
  });
  it.each([
    { ...defaultState, timezone: "invalid" },
    { ...defaultState, watchlist: Array(51).fill("x") },
    { ...defaultState, rule: { ...rule, resetBelow: 100 } },
    { ...defaultState, disabledSources: ["remote"] },
    { ...defaultState, version: 2 },
  ])("rejette les préférences invalides %#", (state) => {
    expect(stateSchema.safeParse(state).success).toBe(false);
    expect(desktopSchema.safeParse(state).success).toBe(false);
  });
  it("rejette les seuils incohérents", () =>
    expect(ruleSchema.safeParse({ ...rule, threshold: 0 }).success).toBe(
      false,
    ));
});
