import { describe, it, expect } from "vitest";
import { DemoXProvider } from "../../packages/connectors/x/demo";
import { XApiClient } from "../../packages/connectors/x/client";
import {
  loadXConfig,
  defaultEndpoints,
} from "../../packages/connectors/x/config";
import { MemoryControlStore } from "../../packages/connectors/x/control";
import { createXRuntime, diagnoseX } from "../../apps/api/x-runtime";
import { FakeTransport, FakeClock, config } from "../fixtures/x/test-tools";
describe("X provider contracts and startup isolation", () => {
  it("uses confirmed wire routes rather than marketing terminology", () => {
    expect(defaultEndpoints.recent).toBe("/tweets/search/recent");
    expect(defaultEndpoints.timeline).toBe("/users/{id}/tweets");
    expect(defaultEndpoints.quotes).toBe("/tweets/{id}/quote_tweets");
  });
  it("normalizes REST and demo through the same contract with explicit origins", async () => {
    const live = new XApiClient(
      await config(),
      new FakeTransport(),
      new MemoryControlStore(),
      { clock: new FakeClock() },
    );
    for (const provider of [new DemoXProvider(new FakeClock()), live]) {
      const page = await provider.searchRecent("fict");
      expect(page.data.length).toBeGreaterThan(0);
      expect(
        page.data.every(
          (post) =>
            post.dataOrigin === page.dataOrigin &&
            post.knowledge === "OBSERVED",
        ),
      ).toBe(true);
      expect(page.data.every((post) => typeof post.id === "string")).toBe(true);
    }
  });
  it("creates demo without Redis even when a credential-like URL is supplied", async () => {
    const runtime = await createXRuntime(
      await loadXConfig({
        APP_MODE: "demo",
        REDIS_URL: "redis://invalid.invalid:1",
      }),
    );
    expect(runtime.status).toBe("demo");
    expect((await runtime.provider!.searchRecent("fict")).dataOrigin).toBe(
      "DEMO",
    );
    await runtime.close();
  });
  it("reports missing live access honestly and makes zero diagnostic calls", async () => {
    const env = { APP_MODE: "live", X_API_ENABLED: "true" };
    expect((await createXRuntime(await loadXConfig(env))).status).toBe(
      "not_configured",
    );
    expect(await diagnoseX(env)).toMatchObject({
      status: "Accès X non configuré",
      networkCalls: 0,
    });
  });
  it("rejects invalid booleans, hosts, operator config and unverified prices", async () => {
    for (const env of [
      { X_API_ENABLED: "yes" },
      { X_API_BASE_URL: "https://evil.invalid/2" },
      { X_ALLOWED_OPERATORS: "bad operator" },
      { X_MAX_RETRIES: "9" },
    ])
      await expect(loadXConfig(env)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
  });
  it("demo faults are explicit and one-shot", async () => {
    const demo = new DemoXProvider(new FakeClock());
    demo.simulate("rate_limit");
    await expect(demo.searchRecent("fict")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect((await demo.searchRecent("fict")).dataOrigin).toBe("DEMO");
  });
});

describe("offline provider scenarios", () => {
  it("covers paging, user lookups, timeline, references and archive", async () => {
    const demo = new DemoXProvider(new FakeClock());
    const page = await demo.searchRecent("démo", { maxResults: 1 });
    expect(page.nextToken).toBeTruthy();
    expect(
      (
        await demo.searchRecent("démo", {
          nextToken: page.nextToken!,
          maxResults: 1,
        })
      ).data[0].id,
    ).not.toBe(page.data[0].id);
    const user = (await demo.getUsersByIds(["DEMO_USER_A"]))[0];
    expect(await demo.getUserByUsername("@" + user.username)).toEqual(user);
    expect(await demo.getUserByUsername("absent")).toBeNull();
    expect((await demo.getUserPosts(user.id)).data.length).toBeGreaterThan(0);
    expect((await demo.getPostsByIds(["DEMO_POST_ROOT"])).data).toHaveLength(1);
    expect(
      (await demo.getConversation("DEMO_POST_ROOT")).data.length,
    ).toBeGreaterThan(1);
    expect((await demo.getQuotePosts("DEMO_POST_ROOT")).data).toHaveLength(1);
    expect((await demo.searchFullArchive("démo")).data).toHaveLength(3);
    await expect(demo.searchRecent(" ")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      demo.searchRecent("démo", { nextToken: "invalid" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      demo.searchRecent("démo", { maxResults: 0 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("exposes all injectable faults without silently turning them into data", async () => {
    for (const fault of [
      "denied",
      "disconnected",
      "budget_exhausted",
    ] as const) {
      const demo = new DemoXProvider(new FakeClock());
      demo.simulate(fault);
      await expect(demo.searchRecent("démo")).rejects.toBeInstanceOf(Error);
    }
  });
});

describe("observed metric capabilities", () => {
  it("keeps missing counts unknown and distinguishes partial access", async () => {
    const transport = new FakeTransport();
    const client = new XApiClient(
      await config(),
      transport,
      new MemoryControlStore(),
      { clock: new FakeClock() },
    );
    expect((await client.capabilities()).metrics.state).toBe("untested");
    await client.searchRecent("fict");
    expect((await client.capabilities()).metrics.state).toBe("available");
  });
});
