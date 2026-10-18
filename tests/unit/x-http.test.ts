import { describe, it, expect, vi } from "vitest";
import {
  SafeHttpTransport,
  isPublicAddress,
  validateDestination,
  pinnedLookup,
} from "../../packages/shared/http";
import { ProviderError } from "../../packages/shared/errors";
import { Secret, structuredAudit } from "../../packages/shared/runtime";
import { withRetry } from "../../packages/shared/retry";
import { FakeClock } from "../fixtures/x/test-tools";
import { inspect } from "node:util";
const headers = { authorization: "Bearer fixture" };
const ok = { status: 200, headers: {}, body: '{"ok":true}' };
describe("Transport fournisseur sécurisé", () => {
  it("refuse la démo avant DNS et réseau", async () => {
    const resolve = vi.fn(),
      wire = vi.fn();
    const transport = new SafeHttpTransport({
      mode: "demo",
      allowedHosts: ["api.x.com"],
      resolve,
      wire,
    });
    await expect(
      transport.get(new URL("https://api.x.com/2/tweets"), headers),
    ).rejects.toMatchObject({ code: "NETWORK_DISABLED" });
    expect(resolve).not.toHaveBeenCalled();
    expect(wire).not.toHaveBeenCalled();
  });
  it.each([
    "http://api.x.com/2",
    "https://api.x.com:444/2",
    "https://user:pass@api.x.com/2",
    "https://api.x.com/#secret",
    "https://127.0.0.1/2",
    "https://[::1]/2",
    "https://evil.example/2",
    "https://api.x.com.evil.example/2",
  ])("refuse la destination %s", (url) =>
    expect(() => validateDestination(new URL(url), ["api.x.com"])).toThrow(
      ProviderError,
    ),
  );
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "garbage",
  ])("refuse adresse privée/réservée %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(false),
  );
  it("accepte uniquement les adresses publiques validées", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("refuse un jeu DNS mixte et ne contacte aucun hôte", async () => {
    const wire = vi.fn();
    const transport = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      resolve: async () => ["8.8.8.8", "127.0.0.1"],
      wire,
    });
    await expect(
      transport.get(new URL("https://api.x.com/2"), headers),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(wire).not.toHaveBeenCalled();
  });
  it("révalide DNS à chaque redirection et bloque un rebinding", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce(["8.8.8.8"])
      .mockResolvedValueOnce(["127.0.0.1"]);
    const wire = vi.fn().mockResolvedValue({
      status: 302,
      headers: { location: "/2/next" },
      body: "",
    });
    const transport = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      resolve,
      wire,
    });
    await expect(
      transport.get(new URL("https://api.x.com/2"), headers),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it("ne transmet pas le bearer à un autre hôte autorisé", async () => {
    const wire = vi.fn().mockResolvedValue({
      status: 307,
      headers: { location: "https://api.twitter.com/2" },
      body: "",
    });
    const transport = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com", "api.twitter.com"],
      resolve: async () => ["8.8.8.8"],
      wire,
    });
    await expect(
      transport.get(new URL("https://api.x.com/2"), headers),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(wire).toHaveBeenCalledTimes(1);
  });
  it("suit un redirect interne borné et épingle les adresses", async () => {
    const wire = vi
      .fn()
      .mockResolvedValueOnce({
        status: 301,
        headers: { location: "/2/next" },
        body: "",
      })
      .mockResolvedValueOnce(ok);
    const transport = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      resolve: async () => ["8.8.8.8"],
      wire,
    });
    expect(
      await transport.get(new URL("https://api.x.com/2"), headers),
    ).toEqual(ok);
    expect(wire.mock.calls[1][0].addresses).toEqual(["8.8.8.8"]);
    expect(wire.mock.calls[1][0].headers["accept-encoding"]).toBe("identity");
  });
  it("interrompt une boucle de redirects et une réponse trop grande", async () => {
    const loop = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      maxRedirects: 1,
      resolve: async () => ["8.8.8.8"],
      wire: async () => ({
        status: 302,
        headers: { location: "/2" },
        body: "",
      }),
    });
    await expect(
      loop.get(new URL("https://api.x.com/2"), headers),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    const large = new SafeHttpTransport({
      mode: "live",
      allowedHosts: ["api.x.com"],
      maxBytes: 5,
      resolve: async () => ["8.8.8.8"],
      wire: async () => ok,
    });
    await expect(
      large.get(new URL("https://api.x.com/2"), headers),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("traite DNS échoué ou vide sans exposer les erreurs brutes", async () => {
    for (const resolve of [
      async () => [],
      async () => {
        throw new Error("secret fixture-token");
      },
    ]) {
      const transport = new SafeHttpTransport({
        mode: "live",
        allowedHosts: ["api.x.com"],
        resolve,
      });
      try {
        await transport.get(new URL("https://api.x.com/2"), headers);
        throw new Error("Expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect(String(error)).not.toContain("fixture-token");
      }
    }
  });
  it("le lookup épinglé ne refait pas de résolution DNS", () => {
    const callback = vi.fn();
    const lookup = pinnedLookup("api.x.com", [
      "8.8.8.8",
      "2606:4700:4700::1111",
    ]);
    lookup("api.x.com", { all: true }, callback);
    expect(callback.mock.calls[0][1]).toHaveLength(2);
    lookup("api.x.com", { family: 4 }, callback);
    expect(callback.mock.calls[1]).toEqual([null, "8.8.8.8", 4]);
    lookup("other.example", {}, callback);
    expect(callback.mock.calls[2][0]).toBeInstanceOf(ProviderError);
    expect(() => pinnedLookup("api.x.com", ["::1"])).toThrow(ProviderError);
  });
});
describe("Erreurs, secrets et retries bornés", () => {
  it("masque les secrets en JSON, chaîne et console", () => {
    const secret = new Secret("fixture-sensitive");
    expect(JSON.stringify({ secret })).not.toContain("fixture-sensitive");
    expect(String(secret)).not.toContain("fixture-sensitive");
    expect(inspect(secret)).not.toContain("fixture-sensitive");
    expect(secret.reveal()).toBe("fixture-sensitive");
    expect(() => new Secret("x\r\ny")).toThrow();
  });
  it("journalise uniquement les métadonnées permises", () => {
    const lines: string[] = [];
    const sink = structuredAudit((line) => lines.push(line));
    sink({
      event: "request",
      endpoint: "recent",
      ...{
        authorization: "Bearer secret",
        private_note: "note",
        text: "secret",
      },
    });
    expect(lines.join()).not.toContain("secret");
    expect(lines.join()).not.toContain("note");
  });
  it("réessaie avec backoff/gigue sans boucle et sans erreur brute", async () => {
    const clock = new FakeClock(),
      operation = vi
        .fn()
        .mockRejectedValue(new ProviderError("NETWORK_ERROR", true));
    await expect(
      withRetry(
        operation,
        { maxRetries: 2, baseDelayMs: 100, maxWaitMs: 1000 },
        clock,
        () => 1,
        () => undefined,
        "recent",
      ),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([100, 200]);
  });
  it("refuse les attentes longues, erreurs permanentes et erreurs inconnues", async () => {
    for (const error of [
      new ProviderError("RATE_LIMITED", true, 60000),
      new ProviderError("ACCESS_DENIED"),
      new Error("test"),
    ]) {
      const operation = vi.fn().mockRejectedValue(error),
        clock = new FakeClock();
      await expect(
        withRetry(
          operation,
          { maxRetries: 5, baseDelayMs: 1, maxWaitMs: 10 },
          clock,
          () => 0,
          () => undefined,
          "recent",
        ),
      ).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(clock.sleeps).toEqual([]);
    }
  });
});
