import { z } from "zod";
import { ProviderError } from "../shared/errors";
import { validateQuery } from "../connectors/x/client";
import type { XConfig } from "../connectors/x/config";
const phrase = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !/[\u0000-\u001f\u007f"\\]/.test(v));
const assisted = z.object({
  all: z.array(phrase).max(20).default([]),
  any: z.array(phrase).max(20).default([]),
  exclude: z.array(phrase).max(20).default([]),
  hashtags: z
    .array(z.string().regex(/^[\p{L}\p{N}_]{1,100}$/u))
    .max(20)
    .default([]),
  accounts: z
    .array(z.string().regex(/^[A-Za-z0-9_]{1,15}$/))
    .max(20)
    .default([]),
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .optional(),
});
export function buildXQuery(
  input: unknown,
  config: Pick<XConfig, "queryMaxLength" | "allowedOperators">,
): string {
  const value = assisted.safeParse(input);
  if (!value.success) throw new ProviderError("INVALID_INPUT");
  const q = (v: string) => `"${v}"`,
    parts = value.data.all.map(q);
  if (value.data.any.length)
    parts.push("(" + value.data.any.map(q).join(" OR ") + ")");
  parts.push(
    ...value.data.exclude.map((v) => "-" + q(v)),
    ...value.data.hashtags.map((v) => "#" + v),
  );
  if (value.data.accounts.length)
    parts.push(
      "(" + value.data.accounts.map((v) => "from:" + v).join(" OR ") + ")",
    );
  if (value.data.language) parts.push("lang:" + value.data.language);
  const query = parts.join(" ");
  validateQuery(query, config);
  return query;
}
export const localFiltersSchema = z
  .object({
    text: z.string().trim().max(512).optional(),
    keyword: z.string().trim().max(200).optional(),
    hashtag: z.string().max(100).optional(),
    authorId: z.string().max(80).optional(),
    personId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    eventId: z.uuid().optional(),
    tokenId: z.uuid().optional(),
    ruleId: z.uuid().optional(),
    language: z
      .string()
      .regex(/^[a-z]{2,3}$/)
      .optional(),
    type: z
      .enum(["original", "reply", "quote", "repost", "unknown"])
      .optional(),
    since: z.iso.datetime().optional(),
    until: z.iso.datetime().optional(),
    hasAddress: z.boolean().optional(),
    minInteractions: z
      .string()
      .regex(/^(0|[1-9][0-9]{0,39})$/)
      .optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(1000).optional(),
  })
  .strict()
  .refine((v) => !v.since || !v.until || v.since <= v.until);
export type LocalFilters = z.infer<typeof localFiltersSchema>;
export function filtersFromUrl(search: string): LocalFilters {
  const params = new URLSearchParams(search),
    input: Record<string, unknown> = {};
  for (const [key, value] of params) {
    if (key === "hasAddress") {
      if (value !== "true" && value !== "false")
        throw new ProviderError("INVALID_INPUT");
      input[key] = value === "true";
    } else if (key === "limit") input[key] = Number(value);
    else input[key] = value;
  }
  const result = localFiltersSchema.safeParse(input);
  if (!result.success) throw new ProviderError("INVALID_INPUT");
  return result.data;
}
export function filtersToUrl(input: unknown): string {
  const result = localFiltersSchema.safeParse(input);
  if (!result.success) throw new ProviderError("INVALID_INPUT");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(result.data).sort())
    if (value !== undefined) params.set(key, String(value));
  return params.toString();
}
