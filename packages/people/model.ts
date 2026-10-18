import { z } from "zod";
import type { Origin, XUser } from "../connectors/x/contracts";
import { ProviderError } from "../shared/errors";
export const personInput = z.object({
  username: z.string().min(1).max(512),
  name: z.string().trim().max(200).default(""),
  categoryId: z.string().uuid().nullable().default(null),
  keywords: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  privateNote: z.string().max(10000).default(""),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  status: z.enum(["active", "paused"]).default("paused"),
});
export type PersonInput = z.infer<typeof personInput>;
export interface Person extends PersonInput {
  id: string;
  xUserId: string | null;
  validation:
    | "validated_via_api"
    | "unvalidated"
    | "not_found"
    | "suspended_or_unavailable";
  profile: XUser | null;
}
export interface Category {
  id: string;
  name: string;
}
export const intervals = {
  critical: 60,
  high: 300,
  normal: 900,
  low: 3600,
} as const;
export function normalizeUsername(input: string, origin: Origin): string {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ProviderError("INVALID_INPUT");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        url.hostname,
      ) ||
      !/^\/[A-Za-z0-9_]+\/?$/.test(url.pathname)
    )
      throw new ProviderError("INVALID_INPUT");
    value = url.pathname.replace(/^\/|\/$/g, "");
  }
  value = value.replace(/^@/, "");
  const reserved = new Set([
    "home",
    "search",
    "explore",
    "settings",
    "intent",
    "i",
    "messages",
    "notifications",
  ]);
  if (
    !(origin === "REAL" ? /^[A-Za-z0-9_]{1,15}$/ : /^[A-Za-z0-9_]{1,80}$/).test(
      value,
    ) ||
    reserved.has(value.toLowerCase())
  )
    throw new ProviderError("INVALID_INPUT");
  return value.toLowerCase();
}
export function parsePerson(input: unknown, origin: Origin): PersonInput {
  const result = personInput.safeParse(input);
  if (!result.success) throw new ProviderError("INVALID_INPUT");
  return {
    ...result.data,
    username: normalizeUsername(result.data.username, origin),
    keywords: [...new Set(result.data.keywords)],
  };
}
export function profileUrl(user: XUser): string {
  const handle = normalizeUsername(user.username, user.dataOrigin);
  return user.dataOrigin === "DEMO"
    ? `https://demo.memeradar.invalid/${handle}`
    : `https://x.com/${handle}`;
}
