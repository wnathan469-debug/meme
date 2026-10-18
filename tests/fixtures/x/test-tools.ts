import posts from "./posts.json";
import {
  loadXConfig,
  type XConfig,
} from "../../../packages/connectors/x/config";
import { Secret, type Clock } from "../../../packages/shared/runtime";
import type { JsonTransport, HttpReply } from "../../../packages/shared/http";
export class FakeClock implements Clock {
  time = Date.parse("2026-01-15T14:00:00.000Z");
  sleeps: number[] = [];
  now() {
    return this.time;
  }
  async sleep(ms: number) {
    this.sleeps.push(ms);
    this.time += ms;
  }
}
export class FakeTransport implements JsonTransport {
  calls: { url: URL; headers: Record<string, string> }[] = [];
  constructor(readonly replies: (HttpReply | Error)[] = []) {}
  async get(url: URL, headers: Record<string, string>): Promise<HttpReply> {
    this.calls.push({ url: new URL(url), headers: { ...headers } });
    const result = this.replies.shift() ?? reply(posts);
    if (result instanceof Error) throw result;
    return result;
  }
}
export function reply(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): HttpReply {
  return { status, headers, body: JSON.stringify(body) };
}
export async function config(
  overrides: Partial<XConfig> = {},
): Promise<XConfig> {
  return {
    ...(await loadXConfig({ APP_MODE: "live", X_API_ENABLED: "true" })),
    token: new Secret("fixture_not_a_real_credential"),
    maxResults: 10,
    localIntervalMs: 1,
    maxRetries: 2,
    baseDelayMs: 1,
    maxWaitMs: 10000,
    allowedOperators: ["from", "lang", "conversation_id"],
    pricing: {
      currency: "USD",
      request: "3",
      post: "2",
      user: "1",
      verifiedAt: "2026-01-15T00:00:00.000Z",
    },
    budget: {
      daily: "1000000000000000000000",
      monthly: "1000000000000000000000",
      warningPercent: 80,
      features: {},
    },
    ...overrides,
  };
}
