import { z } from "zod";
import { LocalStore } from "./local-store";
import { dollars, micros, type LocalSnapshot } from "./local-model";
import { loadXConfig } from "../../packages/connectors/x/config";
import { XApiClient } from "../../packages/connectors/x/client";
import type { XUser, XPost } from "../../packages/connectors/x/contracts";
import {
  SafeHttpTransport,
  type JsonTransport,
} from "../../packages/shared/http";
import { Secret, systemClock, type Clock } from "../../packages/shared/runtime";
import { ProviderError } from "../../packages/shared/errors";
export interface KeyVault {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}
export class LocalRuntime {
  readonly store: LocalStore;
  private timer: ReturnType<typeof setInterval> | undefined;
  private work: Promise<void> | undefined;
  private closed = false;
  private purgedAt = 0;
  constructor(
    filename: string,
    private vault: KeyVault,
    private clock: Clock = systemClock,
    private transport?: JsonTransport,
  ) {
    this.store = new LocalStore(filename, () => clock.now());
    this.purgePosts();
  }
  private purgePosts() {
    if (this.purgedAt && this.clock.now() - this.purgedAt < 60000) return;
    const before = new Date(this.clock.now() - 7 * 86400000).toISOString();
    this.store.db
      .prepare(
        "DELETE FROM local_posts WHERE json_extract(value,'$.collectedAt')<?",
      )
      .run(before);
    this.store.db
      .prepare(
        "DELETE FROM local_people WHERE json_extract(value,'$.observedAt')<?",
      )
      .run(before);
    this.purgedAt = this.clock.now();
  }
  snapshot(): LocalSnapshot {
    this.purgePosts();
    const day = new Date(this.clock.now()).toISOString().slice(0, 10),
      s = this.store.get<LocalSnapshot["settings"]>("settings", null);
    const daily = this.store.balance("day:" + day),
      monthly = this.store.balance("month:" + day.slice(0, 7));
    const requests = this.store.requests(day);
    const read = <T>(table: "local_posts" | "local_people", limit: number) =>
      (
        this.store.db
          .prepare(`SELECT value FROM ${table} ORDER BY rowid DESC LIMIT ?`)
          .all(limit) as { value: string }[]
      ).map((r) => JSON.parse(r.value) as T);
    const verified = this.store.get<number | null>("verifiedAt", null),
      last = this.store.get<number | null>("lastCollection", null);
    return {
      stopped: this.store.get("stopped", true),
      busy: !!this.work,
      hasKey: !!this.store.get("encryptedKey", null),
      secureStorage: this.vault.available(),
      settings: s,
      verifiedAt: verified === null ? null : new Date(verified).toISOString(),
      lastCollection: last === null ? null : new Date(last).toISOString(),
      nextCollection:
        last === null ? null : new Date(last + 3600000).toISOString(),
      error: this.store.get("lastError", null),
      partial: this.store.get("partial", false),
      people: read<XUser>("local_people", 100),
      posts: read<XPost>("local_posts", 300).sort((a, b) =>
        (b.publishedAt ?? b.collectedAt).localeCompare(
          a.publishedAt ?? a.collectedAt,
        ),
      ),
      usage: {
        dayReservedUsd: dollars(daily),
        monthReservedUsd: dollars(monthly),
        requestsDay: requests,
        warning:
          !!s &&
          (BigInt(daily) * 100n >= BigInt(micros(s.dailyUsd)) * 80n ||
            BigInt(monthly) * 100n >= BigInt(micros(s.monthlyUsd)) * 80n ||
            requests * 100 >= s.maxRequestsDay * 80),
      },
    };
  }
  async command(command: unknown, input?: unknown) {
    z.enum(["status", "configure", "key", "forgetKey", "start", "stop"]).parse(
      command,
    );
    if (this.closed) throw new ProviderError("STORE_UNAVAILABLE");
    if (command === "status") {
      z.undefined().parse(input);
      return this.snapshot();
    }
    if (command === "stop") {
      z.undefined().parse(input);
      this.store.set("stopped", true);
      return this.snapshot();
    }
    if (command === "forgetKey") {
      z.undefined().parse(input);
      this.store.transaction(() => {
        this.store.set("stopped", true);
        this.store.set("encryptedKey", null);
      });
      return this.snapshot();
    }
    if (this.work) throw new ProviderError("COLLECTION_LEASE_LOST");
    if (command === "configure") {
      this.store.configure(input);
      this.store.set("lastError", null);
    }
    if (command === "key") {
      const token = z
        .string()
        .min(10)
        .max(4096)
        .regex(/^[A-Za-z0-9%_.~+\/=:-]+$/)
        .parse(input);
      if (!this.vault.available()) throw new ProviderError("STORE_UNAVAILABLE");
      const encrypted = this.vault.encrypt(token);
      this.store.transaction(() => {
        this.store.set("stopped", true);
        this.store.set("encryptedKey", encrypted.toString("base64"));
        this.store.db
          .prepare("DELETE FROM local_kv WHERE key LIKE 'capability:%'")
          .run();
      });
    }
    if (command === "start") {
      z.object({ acceptCharges: z.literal(true) })
        .strict()
        .parse(input);
      this.store.policy();
      if (!this.vault.available() || !this.store.get("encryptedKey", null))
        throw new ProviderError("NOT_CONFIGURED");
      // Check decryption before enabling anything. There is no startup probe.
      new Secret(
        this.vault.decrypt(
          Buffer.from(this.store.get<string>("encryptedKey", ""), "base64"),
        ),
      );
      this.store.set("stopped", false);
      this.timer ??= setInterval(() => {
        void this.collect();
      }, 60000);
      this.timer.unref?.();
      void this.collect();
    }
    return this.snapshot();
  }
  async collect(): Promise<void> {
    if (this.work) {
      await this.work;
      return;
    }
    if (this.closed || this.store.get("stopped", true)) return;
    const last = this.store.get<number>("lastCollection", 0);
    if (last && this.clock.now() - last < 3600000) return;
    this.work = this.perform()
      .catch(() => {
        this.closed = true;
        try {
          this.store.set("stopped", true);
          this.store.set("lastError", "STORE_UNAVAILABLE");
        } catch {
          /* Database unavailable: all future collection is disabled in memory too. */
        }
      })
      .finally(() => {
        this.work = undefined;
      });
    await this.work;
  }
  private async perform() {
    let failed = false,
      partial = false;
    try {
      const s = this.store.policy();
      this.store.set("lastCollection", this.clock.now());
      this.store.set("lastError", null);
      const config = await loadXConfig({
        APP_MODE: "live",
        X_API_ENABLED: "true",
        X_MAX_RESULTS_PER_REQUEST: "10",
        X_MAX_LOOKUP_IDS: "10",
        X_MAX_RETRIES: "0",
        X_TIMEOUT_MS: "10000",
      });
      config.token = new Secret(
        this.vault.decrypt(
          Buffer.from(this.store.get<string>("encryptedKey", ""), "base64"),
        ),
      );
      config.pricing = {
        currency: "USD",
        request: micros(s.requestUsd),
        post: micros(s.postUsd),
        user: micros(s.userUsd),
        verifiedAt: new Date(
          this.store.get<number>("verifiedAt", 0),
        ).toISOString(),
      };
      config.budget = {
        daily: micros(s.dailyUsd),
        monthly: micros(s.monthlyUsd),
        features: {},
        warningPercent: 80,
      };
      const provider = new XApiClient(
        config,
        this.transport ??
          new SafeHttpTransport({
            mode: "live",
            allowedHosts: ["api.x.com"],
            timeoutMs: 10000,
          }),
        this.store,
        { clock: this.clock },
      );
      for (const username of s.usernames) {
        if (this.store.get("stopped", true)) break;
        await this.clock.sleep(1100);
        if (this.store.get("stopped", true)) break;
        try {
          const user = await provider.getUserByUsername(username);
          if (!user) throw new ProviderError("NOT_FOUND");
          if (user.protected !== false)
            throw new ProviderError("PROTECTED_ACCOUNT");
          this.store.db
            .prepare(
              "INSERT INTO local_people VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
            )
            .run(user.id, JSON.stringify(user));
          if (this.store.get("stopped", true)) break;
          await this.clock.sleep(1100);
          if (this.store.get("stopped", true)) break;
          const page = await provider.getUserPosts(user.id, {
            maxResults: 10,
            feature: "people",
          });
          partial ||= page.partial || !!page.nextToken;
          this.store.transaction(() => {
            for (const post of page.data) {
              if (post.dataOrigin !== "REAL" || !/^[1-9][0-9]*$/.test(post.id))
                throw new ProviderError("INVALID_RESPONSE");
              this.store.db
                .prepare(
                  "INSERT INTO local_posts VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
                )
                .run(post.id, JSON.stringify(post));
            }
          });
        } catch (e) {
          failed = true;
          this.store.set(
            "lastError",
            e instanceof ProviderError ? e.code : "STORE_UNAVAILABLE",
          );
          // Fail closed: no further account, fallback, or retry after a failure.
          this.store.set("stopped", true);
          break;
        }
      }
      this.purgePosts();
    } catch (e) {
      failed = true;
      this.store.set("stopped", true);
      this.store.set(
        "lastError",
        e instanceof ProviderError ? e.code : "STORE_UNAVAILABLE",
      );
    }
    this.store.set("partial", partial || failed);
  }
  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    try {
      this.store.set("stopped", true);
      await this.work;
    } finally {
      this.store.close();
    }
  }
}
