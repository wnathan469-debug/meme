import { it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadXConfig,
  defaultEndpoints,
} from "../../packages/connectors/x/config";
it("validates operator-controlled files and explicit monetary units before activation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "memeradar-config-"));
  try {
    const pricing = path.join(dir, "pricing.json"),
      features = path.join(dir, "features.json"),
      endpoints = path.join(dir, "endpoints.json");
    await writeFile(
      pricing,
      JSON.stringify({
        currency: "USD",
        request: "1",
        post: "2",
        user: "3",
        verifiedAt: "2026-01-15T00:00:00.000Z",
      }),
    );
    await writeFile(
      features,
      JSON.stringify({ people: { daily: "10", monthly: "100" } }),
    );
    await writeFile(endpoints, JSON.stringify(defaultEndpoints));
    const env = {
      X_PRICING_CONFIG_PATH: pricing,
      X_FEATURE_BUDGETS_PATH: features,
      X_ENDPOINTS_CONFIG_PATH: endpoints,
      X_BUDGET_DAILY_MICRO_USD: "100",
      X_BUDGET_MONTHLY_MICRO_USD: "1000",
      X_CAPABILITY_ARCHIVE: "false",
      X_RECENT_WINDOW_SECONDS: "3600",
    };
    const config = await loadXConfig(env);
    expect(config.pricing?.post).toBe("2");
    expect(config.budget?.features.people?.daily).toBe("10");
    expect(config.declared.archive).toBe(false);
    expect(config.recentWindowSeconds).toBe(3600);
    await writeFile(
      pricing,
      JSON.stringify({
        currency: "USD",
        request: null,
        post: null,
        user: null,
        verifiedAt: null,
      }),
    );
    await expect(loadXConfig(env)).rejects.toMatchObject({
      code: "PRICING_UNKNOWN",
    });
    await expect(
      loadXConfig({
        ...env,
        X_PRICING_CONFIG_PATH: "",
        X_BUDGET_DAILY_MICRO_USD: "1.5",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await writeFile(
      endpoints,
      JSON.stringify({ ...defaultEndpoints, recent: "https://evil.invalid" }),
    );
    await expect(
      loadXConfig({ ...env, X_PRICING_CONFIG_PATH: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await writeFile(features, "[");
    await expect(
      loadXConfig({ ...env, X_PRICING_CONFIG_PATH: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await writeFile(features, " ".repeat(65537));
    await expect(
      loadXConfig({ ...env, X_PRICING_CONFIG_PATH: "" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      loadXConfig({ X_PRICING_CONFIG_PATH: path.join(dir, "missing") }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
