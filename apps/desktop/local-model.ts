import { z } from "zod";
export const money = z.string().regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/);
export function micros(value: string) {
  money.parse(value);
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 1000000n +
    BigInt(fraction.padEnd(6, "0"))
  ).toString();
}
export function dollars(value: string) {
  const n = BigInt(value);
  return `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, "0")}`;
}
export const localSettingsSchema = z
  .object({
    usernames: z
      .array(z.string().regex(/^[A-Za-z0-9_]{1,15}$/))
      .min(1)
      .max(3),
    dailyUsd: money,
    monthlyUsd: money,
    requestUsd: money,
    postUsd: money,
    userUsd: money,
    maxRequestsDay: z.number().int().min(1).max(150),
    verifiedTermsAndPrices: z.literal(true),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      BigInt(micros(s.dailyUsd)) > BigInt(micros(s.monthlyUsd)) ||
      BigInt(micros(s.dailyUsd)) === 0n ||
      BigInt(micros(s.monthlyUsd)) === 0n ||
      new Set(s.usernames.map((v) => v.toLowerCase())).size !==
        s.usernames.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Budgets ou profils invalides.",
      });
  });
export type LocalSettings = z.infer<typeof localSettingsSchema>;
export interface LocalSnapshot {
  stopped: boolean;
  busy: boolean;
  hasKey: boolean;
  secureStorage: boolean;
  settings: LocalSettings | null;
  verifiedAt: string | null;
  lastCollection: string | null;
  nextCollection: string | null;
  error: string | null;
  partial: boolean;
  people: import("../../packages/connectors/x/contracts").XUser[];
  posts: import("../../packages/connectors/x/contracts").XPost[];
  usage: {
    dayReservedUsd: string;
    monthReservedUsd: string;
    requestsDay: number;
    warning: boolean;
  };
}
export type LocalCommand =
  "status" | "configure" | "key" | "forgetKey" | "start" | "stop";
export interface LocalBridge {
  command(
    command: LocalCommand,
    input?: unknown,
  ): Promise<{ state?: LocalSnapshot; error?: string }>;
}
