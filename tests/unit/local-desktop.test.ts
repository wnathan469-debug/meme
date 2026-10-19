import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { LocalRuntime, type KeyVault } from "../../apps/desktop/local-runtime";
import { LocalStore } from "../../apps/desktop/local-store";
import { micros, localSettingsSchema } from "../../apps/desktop/local-model";
import type { JsonTransport, HttpReply } from "../../packages/shared/http";
import type { Reservation } from "../../packages/connectors/x/control";

const settings = {
  usernames: ["public_test"],
  dailyUsd: "1",
  monthlyUsd: "20",
  requestUsd: "0.01",
  postUsd: "0.01",
  userUsd: "0.01",
  maxRequestsDay: 150,
  verifiedTermsAndPrices: true as const,
};
const token = "LOCAL_TEST_TOKEN_NOT_REAL_12345";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "memeradar-local-test-")),
    file = join(dir, "local.sqlite");
  let time = Date.parse("2026-10-19T14:00:00Z");
  const clock = {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
  const key = randomBytes(32);
  const vault: KeyVault = {
    available: () => true,
    encrypt: (s) => {
      const iv = randomBytes(12),
        c = createCipheriv("aes-256-gcm", key, iv);
      return Buffer.concat([iv, c.update(s), c.final(), c.getAuthTag()]);
    },
    decrypt: (b) => {
      const c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
      c.setAuthTag(b.subarray(-16));
      return Buffer.concat([
        c.update(b.subarray(12, -16)),
        c.final(),
      ]).toString();
    },
  };
  const calls: string[] = [];
  const user = {
    id: "123",
    username: "public_test",
    name: "Public Test",
    protected: false,
  };
  let status = 200;
  let reply: (url: URL) => unknown = (url) =>
    url.pathname.includes("username")
      ? { data: user }
      : {
          data: [
            {
              id: "456",
              text: "Observation de test synthétique",
              author_id: "123",
              created_at: "2026-10-19T13:59:00Z",
            },
          ],
          includes: { users: [user] },
          meta: { result_count: 1 },
        };
  const transport: JsonTransport = {
    get: async (url, headers) => {
      expect(headers.Authorization ?? headers.authorization).toBe(
        "Bearer " + token,
      );
      calls.push(url.href);
      return { status, headers: {}, body: JSON.stringify(reply(url)) };
    },
  };
  const runtime = new LocalRuntime(file, vault, clock, transport);
  return {
    dir,
    file,
    clock,
    vault,
    runtime,
    transport,
    calls,
    advance: (ms: number) => {
      time += ms;
    },
    setStatus: (s: number) => {
      status = s;
    },
    setReply: (f: typeof reply) => {
      reply = f;
    },
    cleanup: async () => {
      await runtime.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
async function configure(f: ReturnType<typeof fixture>) {
  await f.runtime.command("configure", settings);
  await f.runtime.command("key", token);
}
async function started(f: ReturnType<typeof fixture>) {
  await f.runtime.command("start", { acceptCharges: true });
  await f.runtime.collect();
}
function ticket(
  f: ReturnType<typeof fixture>,
  id = "r1",
  amount = "10",
): Reservation {
  const day = new Date(f.clock.now()).toISOString().slice(0, 10);
  return {
    id,
    amount,
    limits: [
      { key: "day:" + day, amount: micros(settings.dailyUsd) },
      { key: "month:" + day.slice(0, 7), amount: micros(settings.monthlyUsd) },
    ],
    expiresAt: f.clock.now() + 100000,
    warningPercent: 80,
    endpoint: "timeline",
    feature: "people",
  };
}
describe("Moteur Windows local sans serveur", () => {
  it("une clé remplacée permet de revérifier les droits sans effacer les dépenses", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.setStatus(401);
      await started(f);
      expect(f.runtime.snapshot().error).toBe("ACCESS_DENIED");
      const before = f.runtime.snapshot().usage.dayReservedUsd;
      f.setStatus(200);
      f.advance(3600001);
      await f.runtime.command("key", token);
      expect(f.runtime.snapshot().usage.dayReservedUsd).toBe(before);
      expect(f.calls).toHaveLength(1);
      await started(f);
      expect(f.calls).toHaveLength(3);
      expect(f.runtime.snapshot().posts).toHaveLength(1);
      expect(f.runtime.snapshot().error).toBe(null);
    } finally {
      await f.cleanup();
    }
  });

  it("refuse l’appel avant envoi si SQLite ne peut plus accueillir sa réponse", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.runtime.store.db.exec("PRAGMA max_page_count=32");
      await started(f);
      expect(f.calls).toHaveLength(0);
      expect(f.runtime.snapshot().error).toBe("STORE_UNAVAILABLE");
      expect(f.runtime.snapshot().stopped).toBe(true);
    } finally {
      await f.cleanup();
    }
  });
  it("annule la réservation du jour quand le plafond mensuel refuse", async () => {
    const f = fixture();
    try {
      await f.runtime.command("configure", { ...settings, monthlyUsd: "1" });
      f.runtime.store.set("stopped", false);
      f.runtime.store.db
        .prepare("INSERT INTO local_balances VALUES(?,?)")
        .run("month:2026-10", "999999");
      const r = ticket(f);
      r.limits[1].amount = "1000000";
      await expect(f.runtime.store.reserve(r)).rejects.toThrow();
      expect(f.runtime.store.balance("day:2026-10-19")).toBe("0");
      expect(f.runtime.store.requests("2026-10-19")).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
  it("change de jour UTC sans effacer la réservation mensuelle", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.runtime.store.set("stopped", false);
      await f.runtime.store.reserve(ticket(f));
      f.advance(86400000);
      await f.runtime.store.reserve(ticket(f, "r2"));
      expect(f.runtime.store.balance("month:2026-10")).toBe("20");
      expect(f.runtime.store.balance("day:2026-10-20")).toBe("10");
      await f.runtime.command("configure", settings);
      expect(f.runtime.snapshot().stopped).toBe(true);
      expect(f.runtime.store.balance("month:2026-10")).toBe("20");
    } finally {
      await f.cleanup();
    }
  });
  it("arrête entre un profil en vol et la timeline suivante", async () => {
    const f = fixture();
    let release = () => {};
    try {
      await configure(f);
      const original = f.transport.get;
      let entered = () => {};
      const gate = new Promise<void>((r) => {
          release = r;
        }),
        ready = new Promise<void>((r) => {
          entered = r;
        });
      f.transport.get = async (u, h) => {
        const reply = await original(u, h);
        entered();
        await gate;
        return reply;
      };
      await f.runtime.command("start", { acceptCharges: true });
      await ready;
      await expect(f.runtime.command("configure", settings)).rejects.toThrow();
      await f.runtime.command("stop");
      release();
      await f.runtime.collect();
      expect(f.calls).toHaveLength(1);
      expect(f.runtime.snapshot().posts).toEqual([]);
      expect(f.runtime.snapshot().stopped).toBe(true);
    } finally {
      release();
      await f.cleanup();
    }
  });
  it("marque une page tronquée et refuse une réponse invalide sans retry", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.setReply((url) =>
        url.pathname.includes("username")
          ? {
              data: {
                id: "123",
                username: "public_test",
                name: "Test",
                protected: false,
              },
            }
          : { data: [], meta: { result_count: 0, next_token: "more" } },
      );
      await started(f);
      expect(f.runtime.snapshot().partial).toBe(true);
      await f.runtime.command("stop");
      f.advance(3600001);
      f.setReply(() => ({ unexpected: true }));
      await started(f);
      expect(f.calls).toHaveLength(3);
      expect(f.runtime.snapshot().error).toBe("INVALID_RESPONSE");
    } finally {
      await f.cleanup();
    }
  });
  it("refuse les tarifs inconnus, profils en double, champs étrangers et décimaux imprécis", () => {
    expect(micros("0.000001")).toBe("1");
    for (const bad of [
      { ...settings, requestUsd: "" },
      { ...settings, requestUsd: "0.0000001" },
      { ...settings, verifiedTermsAndPrices: false },
      { ...settings, usernames: ["test", "TEST"] },
      { ...settings, dailyUsd: "21" },
      { ...settings, monthlyUsd: "0" },
      { ...settings, baseUrl: "http://localhost" },
    ])
      expect(localSettingsSchema.safeParse(bad).success).toBe(false);
  });
  it("démarre arrêté, sans clé, sans donnée fictive et sans réseau", async () => {
    const f = fixture();
    try {
      const s = f.runtime.snapshot();
      expect(s.stopped).toBe(true);
      expect(s.hasKey).toBe(false);
      expect(s.posts).toEqual([]);
      expect(f.calls).toEqual([]);
      await expect(
        f.runtime.command("start", { acceptCharges: true }),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  });
  it("configuration et clé ne lancent aucun appel et ne renvoient aucun secret", async () => {
    const f = fixture();
    try {
      await configure(f);
      expect(f.calls).toHaveLength(0);
      expect(JSON.stringify(f.runtime.snapshot())).not.toContain(token);
      expect(readFileSync(f.file).includes(Buffer.from(token))).toBe(false);
      expect(f.runtime.snapshot().hasKey).toBe(true);
      await expect(
        f.runtime.command("start", { acceptCharges: false }),
      ).rejects.toThrow();
      await expect(f.runtime.command("status", {})).rejects.toThrow();
      await expect(
        f.runtime.command("url", "https://evil.invalid"),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  });
  it("refuse le stockage chiffré indisponible sans repli en clair", async () => {
    const f = fixture();
    try {
      f.vault.available = () => false;
      await expect(f.runtime.command("key", token)).rejects.toThrow();
      expect(f.runtime.snapshot().hasKey).toBe(false);
    } finally {
      await f.cleanup();
    }
  });
  it("collecte une page via le client X existant et conserve les observations SQLite", async () => {
    const f = fixture();
    try {
      await configure(f);
      await started(f);
      expect(f.calls).toHaveLength(2);
      const s = f.runtime.snapshot();
      expect(s.posts[0].dataOrigin).toBe("REAL");
      expect(s.posts[0].id).toBe("456");
      expect(s.people[0].username).toBe("public_test");
      expect(s.usage.requestsDay).toBe(2);
      expect(s.usage.dayReservedUsd).toBe("0.230000");
      expect((await f.runtime.store.usage()).length).toBe(2);
      await f.runtime.collect();
      expect(f.calls).toHaveLength(2);
    } finally {
      await f.cleanup();
    }
  });
  it("redémarre arrêté et préserve clé, données et réservations", async () => {
    const f = fixture();
    let reopened: LocalRuntime | undefined;
    try {
      await configure(f);
      await started(f);
      await f.runtime.close();
      reopened = new LocalRuntime(f.file, f.vault, f.clock, f.transport);
      expect(reopened.snapshot().stopped).toBe(true);
      expect(reopened.snapshot().hasKey).toBe(true);
      expect(reopened.snapshot().posts).toHaveLength(1);
      expect(reopened.snapshot().usage.requestsDay).toBe(2);
      expect(f.calls).toHaveLength(2);
    } finally {
      await reopened?.close();
      rmSync(f.dir, { recursive: true, force: true });
    }
  });
  it("réserve atomiquement et ne rembourse pas une estimation incertaine", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.runtime.store.set("stopped", false);
      await f.runtime.store.reserve(ticket(f));
      await f.runtime.store.settle("r1", "0");
      expect(f.runtime.store.balance("day:2026-10-19")).toBe("10");
      await expect(f.runtime.store.reserve(ticket(f))).rejects.toThrow();
      expect(f.runtime.store.balance("day:2026-10-19")).toBe("10");
      expect(f.runtime.store.requests("2026-10-19")).toBe(1);
      await expect(f.runtime.store.settle("r1", "11")).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  });
  it("refuse tout appel avant de dépasser un plafond et conserve le refus après redémarrage", async () => {
    const f = fixture();
    try {
      await f.runtime.command("configure", { ...settings, dailyUsd: "0.01" });
      await f.runtime.command("key", token);
      await started(f);
      expect(f.calls).toHaveLength(0);
      expect(f.runtime.snapshot().stopped).toBe(true);
      expect(f.runtime.snapshot().error).toBe("BUDGET_EXCEEDED");
    } finally {
      await f.cleanup();
    }
  });
  it("compte aussi les requêtes explicitement sans frais et borne leur nombre", async () => {
    const f = fixture();
    try {
      await f.runtime.command("configure", {
        ...settings,
        requestUsd: "0",
        postUsd: "0",
        userUsd: "0",
        maxRequestsDay: 1,
      });
      await f.runtime.command("key", token);
      await started(f);
      expect(f.calls).toHaveLength(1);
      expect(f.runtime.snapshot().usage.requestsDay).toBe(1);
      expect(f.runtime.snapshot().error).toBe("RATE_LIMITED");
    } finally {
      await f.cleanup();
    }
  });
  it("bloque les tarifs expirés ou datés dans le futur", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.advance(8 * 86400000);
      await expect(
        f.runtime.command("start", { acceptCharges: true }),
      ).rejects.toThrow();
      f.runtime.store.set("verifiedAt", f.clock.now() + 1);
      await expect(
        f.runtime.command("start", { acceptCharges: true }),
      ).rejects.toThrow();
      expect(f.calls).toHaveLength(0);
    } finally {
      await f.cleanup();
    }
  });
  it("ne remplit pas un résultat vide avec des exemples", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.setReply((url) =>
        url.pathname.includes("username")
          ? {
              data: {
                id: "123",
                username: "public_test",
                name: "Test",
                protected: false,
              },
            }
          : { data: [], meta: { result_count: 0 } },
      );
      await started(f);
      expect(f.runtime.snapshot().posts).toEqual([]);
      expect(f.runtime.snapshot().error).toBe(null);
    } finally {
      await f.cleanup();
    }
  });
  it("arrête après 401 sans répétition ni donnée de remplacement", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.setStatus(401);
      await started(f);
      expect(f.calls).toHaveLength(1);
      expect(f.runtime.snapshot().stopped).toBe(true);
      expect(f.runtime.snapshot().posts).toHaveLength(0);
      expect(f.runtime.snapshot().error).toBe("ACCESS_DENIED");
      expect(f.runtime.snapshot().usage.requestsDay).toBe(1);
    } finally {
      await f.cleanup();
    }
  });
  it("refuse un compte protégé avant sa timeline", async () => {
    const f = fixture();
    try {
      await configure(f);
      f.setReply(() => ({
        data: {
          id: "123",
          username: "public_test",
          name: "Private",
          protected: true,
        },
      }));
      await started(f);
      expect(f.calls).toHaveLength(1);
      expect(f.runtime.snapshot().error).toBe("PROTECTED_ACCOUNT");
    } finally {
      await f.cleanup();
    }
  });
  it("supprimer une clé arrête les appels sans effacer les compteurs", async () => {
    const f = fixture();
    try {
      await configure(f);
      await started(f);
      await f.runtime.command("forgetKey");
      expect(f.runtime.snapshot().hasKey).toBe(false);
      expect(f.runtime.snapshot().stopped).toBe(true);
      expect(f.runtime.snapshot().usage.requestsDay).toBe(2);
      await expect(
        f.runtime.command("start", { acceptCharges: true }),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
  });
  it("conserve les quotas et les circuits entre appels", async () => {
    const f = fixture();
    try {
      const s = f.runtime.store;
      await s.updateQuota("timeline", {
        limit: 10,
        remaining: 0,
        resetAt: f.clock.now() + 1000,
        observedAt: f.clock.now(),
      });
      await expect(
        s.takeRate("timeline", f.clock.now(), 1000),
      ).rejects.toThrow();
      f.advance(1001);
      expect(await s.quota("timeline")).toBe(null);
      await s.takeRate("timeline", f.clock.now(), 1000);
      await expect(
        s.takeRate("timeline", f.clock.now(), 1000),
      ).rejects.toThrow();
      const p = { threshold: 1, cooldownMs: 1000 };
      await s.finishCircuit("timeline", f.clock.now(), "failure", p);
      await expect(
        s.enterCircuit("timeline", f.clock.now(), p),
      ).rejects.toThrow();
      f.advance(1001);
      await s.enterCircuit("timeline", f.clock.now(), p);
      await s.finishCircuit("timeline", f.clock.now(), "success", p);
      await s.enterCircuit("timeline", f.clock.now(), p);
    } finally {
      await f.cleanup();
    }
  });
});
