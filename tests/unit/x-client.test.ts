import { describe, it, expect } from "vitest";
import posts from "../fixtures/x/posts.json";
import users from "../fixtures/x/users.json";
import partial from "../fixtures/x/partial.json";
import {
  config,
  FakeClock,
  FakeTransport,
  reply,
} from "../fixtures/x/test-tools";
import {
  XApiClient,
  collectionStatus,
  validateQuery,
} from "../../packages/connectors/x/client";
import { MemoryControlStore } from "../../packages/connectors/x/control";
import { ProviderError } from "../../packages/shared/errors";
async function setup(
  overrides: Parameters<typeof config>[0] = {},
  responses: ConstructorParameters<typeof FakeTransport>[0] = [],
) {
  const cfg = await config(overrides),
    transport = new FakeTransport(responses),
    store = new MemoryControlStore(),
    clock = new FakeClock(),
    audit: unknown[] = [];
  return {
    client: new XApiClient(cfg, transport, store, {
      clock,
      random: () => 1,
      audit: (event) => audit.push(event),
    }),
    cfg,
    transport,
    store,
    clock,
    audit,
  };
}
describe("Client REST X et provenance", () => {
  it("demande seulement les champs utiles et garde les IDs exacts", async () => {
    const { client, transport, store } = await setup();
    const result = await client.searchRecent("Nébula Mobile");
    expect(result.data[0].id).toBe("900000000000000000001");
    expect(result.data[0].type).toBe("original");
    expect(result.dataOrigin).toBe("REAL");
    expect(result.users[0].protected).toBe(false);
    expect(transport.calls[0].url.pathname).toBe("/2/tweets/search/recent");
    expect(transport.calls[0].url.searchParams.get("query")).toBe(
      "Nébula Mobile",
    );
    expect(transport.calls[0].url.searchParams.get("expansions")).toBe(
      "author_id",
    );
    expect(transport.calls[0].url.searchParams.has("media.fields")).toBe(false);
    expect((await store.usage())[0]).toMatchObject({
      posts: 1,
      users: 1,
      costMicros: "6",
      estimated: true,
    });
  });
  it("ne lance aucun appel de détection de capacité", async () => {
    const { client, transport } = await setup();
    expect((await client.capabilities()).recent.state).toBe("untested");
    expect(transport.calls).toHaveLength(0);
    await client.searchRecent("fixture");
    expect((await client.capabilities()).recent.state).toBe("available");
    expect(transport.calls).toHaveLength(1);
  });
  it.each([401, 403])(
    "désactive la capacité après %i sans boucle",
    async (status) => {
      const { client, transport } = await setup({}, [
        reply({ detail: "sensitive-provider-text" }, status),
      ]);
      await expect(client.searchRecent("fixture")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(client.searchRecent("fixture")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      expect(transport.calls).toHaveLength(1);
      expect((await client.capabilities()).recent.state).toBe("unavailable");
    },
  );
  it("refuse configuration absente, mode démo ou capacité désactivée avant le réseau", async () => {
    for (const overrides of [
      { enabled: false },
      { token: null },
      { mode: "demo" as const },
      { declared: { recent: false } },
    ]) {
      const { client, transport } = await setup(overrides);
      await expect(client.searchRecent("fixture")).rejects.toBeInstanceOf(
        ProviderError,
      );
      expect(transport.calls).toHaveLength(0);
      expect((await client.capabilities()).recent.state).toBe("unavailable");
    }
  });
  it("conserve les données manquantes et ne transmet pas les détails d’erreur", async () => {
    const { client, audit } = await setup({}, [reply(partial)]);
    const result = await client.searchRecent("fixture");
    expect(result.partial).toBe(true);
    expect(result.data[0].metrics.likes).toBeNull();
    expect(result.data[0].authorId).toBeNull();
    expect(result.data[0].type).toBe("reply");
    expect(result.nextToken).toBe("fixture-next-page");
    expect(JSON.stringify(result.problems)).not.toContain("Untrusted");
    expect(JSON.stringify(audit)).not.toContain(
      "fixture_not_a_real_credential",
    );
  });
  it("rejette JSON, schéma et compte de résultats invalides sans retry", async () => {
    for (const response of [
      { status: 200, headers: {}, body: "not-json" },
      reply({ data: [{ id: "DEMO_POST_X", text: "bad" }] }),
      reply({ unknown: "invalid" }),
      reply({ ...posts, data: [posts.data[0], posts.data[0]] }),
    ]) {
      const { client, transport, store } = await setup({ maxResults: 1 }, [
        response,
      ]);
      await expect(client.searchRecent("fixture")).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
      expect(transport.calls).toHaveLength(1);
      expect((await store.usage())[0].costMicros).not.toBe("0");
    }
  });
  it("facture prudemment une réponse perdue sans exposer l’erreur brute", async () => {
    const { client, store } = await setup({ maxRetries: 0 }, [
      new Error("provider secret URL fixture"),
    ]);
    try {
      await client.searchRecent("fixture");
      throw new Error("Expected failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "NETWORK_ERROR" });
      expect(String(error)).not.toContain("secret");
    }
    expect((await store.usage())[0]).toMatchObject({
      costMicros: "33",
      posts: null,
      users: null,
    });
  });
  it("relâche une réservation si la destination est rejetée avant envoi", async () => {
    const { client, store } = await setup({}, [
      new ProviderError("UNSAFE_URL"),
    ]);
    await expect(client.searchRecent("fixture")).rejects.toMatchObject({
      code: "UNSAFE_URL",
    });
    expect((await store.usage())[0].costMicros).toBe("0");
  });
  it("arrête les appels payants quand les prix ou plafonds manquent", async () => {
    for (const override of [
      { pricing: null },
      { budget: null },
      {
        budget: { daily: "1", monthly: "1", warningPercent: 80, features: {} },
      },
    ]) {
      const { client, transport } = await setup(override);
      await expect(client.searchRecent("fixture")).rejects.toBeInstanceOf(
        ProviderError,
      );
      expect(transport.calls).toHaveLength(0);
    }
  });
  it("valide les paramètres sans requête et ne traite pas un symbole comme ID", async () => {
    const { client, transport } = await setup();
    await expect(client.getPostsByIds(["$COIN"])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(client.getUsersByIds([])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(client.getPostsByIds(["1", "1"])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(client.getUserByUsername("bad/name")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(
      client.searchRecent("fixture", { maxResults: 0 }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      client.searchRecent("fixture", { sinceId: "$x" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transport.calls).toHaveLength(0);
  });
  it("sépare recherche historique, conversation et citations et ne promet pas une couverture complète", async () => {
    const { client, transport } = await setup({ recentWindowSeconds: 3600 });
    await client.searchFullArchive("fixture", {
      nextToken: "token",
      sinceId: "1",
      maxResults: 2,
    });
    await client.getConversation("900000000000000000001");
    await client.getQuotePosts("900000000000000000001", {
      nextToken: "quote-page",
    });
    expect(transport.calls[2].url.searchParams.get("pagination_token")).toBe(
      "quote-page",
    );
    expect(transport.calls[2].url.searchParams.has("next_token")).toBe(false);
    await expect(
      client.getQuotePosts("1", { sinceId: "1" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transport.calls.map((c) => c.url.pathname)).toEqual([
      "/2/tweets/search/all",
      "/2/tweets/search/recent",
      "/2/tweets/900000000000000000001/quote_tweets",
    ]);
    expect(transport.calls[1].url.searchParams.get("query")).toBe(
      "conversation_id:900000000000000000001",
    );
    expect((await client.capabilities()).conversation).toMatchObject({
      state: "limited",
      windowSeconds: 3600,
    });
  });
  it("lookup exact, timeline paginée et refus de compte protégé ou inconnu", async () => {
    const setupNormal = await setup({}, [
      reply({ data: users.data[0] }),
      reply(posts),
    ]);
    expect((await setupNormal.client.getUserByUsername("demo_julie"))?.id).toBe(
      users.data[0].id,
    );
    await setupNormal.client.getUserPosts(users.data[0].id, {
      nextToken: "p2",
    });
    expect(
      setupNormal.transport.calls[1].url.searchParams.get("pagination_token"),
    ).toBe("p2");
    expect(
      setupNormal.transport.calls[1].url.searchParams.has("next_token"),
    ).toBe(false);
    for (const protectedValue of [true, undefined]) {
      const user = { ...users.data[0], protected: protectedValue };
      const { client, transport } = await setup({}, [reply({ data: [user] })]);
      await expect(client.getUserPosts(user.id)).rejects.toMatchObject({
        code: protectedValue ? "PROTECTED_ACCOUNT" : "ACCESS_DENIED",
      });
      expect(transport.calls).toHaveLength(1);
    }
    const absent = await setup({}, [
      reply({ errors: [{ resource_id: "123" }] }),
    ]);
    await expect(absent.client.getUserPosts("123")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("un utilisateur introuvable ne désactive pas le lookup pour tous", async () => {
    const { client } = await setup({}, [reply({}, 404)]);
    expect(await client.getUserByUsername("demo_unknown")).toBeNull();
    expect((await client.capabilities()).username.state).toBe("untested");
  });
  it("les postes demandés par ID utilisent le même contrat", async () => {
    const { client, transport } = await setup();
    await client.getPostsByIds([posts.data[0].id]);
    expect(transport.calls[0].url.searchParams.get("ids")).toBe(
      posts.data[0].id,
    );
  });
});
describe("Quotas, circuits et consommation des retries", () => {
  it("respecte le reset 429 et comptabilise chaque tentative", async () => {
    const now = new FakeClock().now();
    const { client, clock, transport, store } = await setup({}, [
      reply({}, 429, {
        "x-rate-limit-limit": "10",
        "x-rate-limit-remaining": "0",
        "x-rate-limit-reset": String(now / 1000 + 2),
      }),
      reply(posts, 200, {
        "x-rate-limit-limit": "10",
        "x-rate-limit-remaining": "8",
        "x-rate-limit-reset": String(now / 1000 + 12),
      }),
    ]);
    await client.searchRecent("fixture");
    expect(transport.calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([2000]);
    expect(await store.usage()).toHaveLength(2);
    expect((await store.usage()).map((x) => x.costMicros)).toEqual(["33", "6"]);
  });
  it("défère les attentes longues et partage le blocage de débit entre fonctionnalités", async () => {
    const { client, transport, clock } = await setup({ maxWaitMs: 100 }, [
      reply({}, 429, { "retry-after": "60" }),
    ]);
    await expect(client.searchRecent("fixture")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(client.getConversation("1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(transport.calls).toHaveLength(1);
    expect(clock.sleeps).toHaveLength(0);
  });
  it("ouvre le circuit par route puis teste sa reprise après cooldown", async () => {
    const { client, transport, clock, store } = await setup(
      { circuitFailures: 2, circuitCooldownMs: 100, maxRetries: 5 },
      [reply({}, 503), reply({}, 503)],
    );
    await expect(client.searchRecent("fixture")).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
    });
    expect(transport.calls).toHaveLength(2);
    expect(await store.usage()).toHaveLength(2);
    clock.time += 101;
    expect((await client.searchRecent("fixture")).data).toHaveLength(1);
    expect(transport.calls).toHaveLength(3);
  });
  it("n’essaie pas un compte si sa timeline est explicitement désactivée", async () => {
    const { client, transport } = await setup({
      declared: { timeline: false },
    });
    await expect(client.getUserPosts("1")).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(transport.calls).toHaveLength(0);
  });
});
describe("Requête et libellé honnêtes", () => {
  it("respecte opérateurs déclarés, chaînes citées et longueur locale", async () => {
    const cfg = await config();
    expect(() => validateQuery("from:demo_julie lang:fr", cfg)).not.toThrow();
    expect(() =>
      validateQuery('"text from: inside quotes"', cfg),
    ).not.toThrow();
    expect(() => validateQuery("unknown:value", cfg)).toThrow(ProviderError);
    expect(() => validateQuery('"unterminated', cfg)).toThrow();
    expect(() => validateQuery("line\nfeed", cfg)).toThrow();
    expect(() => validateQuery("a".repeat(513), cfg)).toThrow();
  });
  it("ne dit temps réel que pour un flux REAL actif et disponible", async () => {
    const { client } = await setup();
    const caps = await client.capabilities();
    const options = {
      origin: "REAL" as const,
      enabled: true,
      streamConnected: true,
      pollingActive: true,
      pollIntervalSeconds: 300,
    };
    expect(collectionStatus(caps, options).mode).toBe("disabled");
    caps.recent.state = "available";
    expect(
      collectionStatus(caps, { ...options, streamConnected: false }).label,
    ).toContain("300 secondes");
    caps.stream.state = "available";
    expect(collectionStatus(caps, options).mode).toBe("stream");
    expect(collectionStatus(caps, { ...options, origin: "DEMO" }).mode).toBe(
      "demo",
    );
    expect(collectionStatus(caps, { ...options, enabled: false }).mode).toBe(
      "disabled",
    );
  });
});
