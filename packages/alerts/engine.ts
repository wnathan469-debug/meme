import { z } from "zod";
import {
  ruleSchema,
  parseCandidate,
  inspect,
  type AlertRule,
  type AlertCandidate,
} from "./model";
const stamp = z.iso.datetime();
export const entrySchema = z.object({
  id: z.string().max(1000),
  candidate: z.unknown(),
  at: stamp,
  reason: z.string().max(2000),
  status: z.enum([
    "pending",
    "notified",
    "suppressed",
    "acknowledged",
    "false_positive",
  ]),
  suppression: z.string().max(100).nullable(),
  dueAt: stamp.nullable(),
  group: z.string().max(200),
  deliveredAt: stamp.nullable(),
  feedbackAt: stamp.nullable(),
});
export type AlertEntry = Omit<z.infer<typeof entrySchema>, "candidate"> & {
  candidate: AlertCandidate;
};
const notificationSchema = z.object({
  id: z.string().max(500),
  at: stamp,
  entryIds: z.array(z.string().max(1000)).min(1).max(100),
  read: z.boolean(),
});
export const stateSchema = z.object({
  clock: stamp.nullable(),
  subjects: z.record(
    z.string().max(150),
    z.object({
      armed: z.boolean(),
      lastTrigger: stamp.nullable(),
      lastObservedAt: stamp.nullable().default(null),
    }),
  ),
  entries: z.array(entrySchema).max(1000),
  notifications: z.array(notificationSchema).max(1000),
});
export type AlertState = Omit<z.infer<typeof stateSchema>, "entries"> & {
  entries: AlertEntry[];
};
export const emptyState = (): AlertState => ({
  clock: null,
  subjects: {},
  entries: [],
  notifications: [],
});
export function parseState(raw: unknown): AlertState {
  const s = stateSchema.parse(raw);
  if (
    Object.keys(s.subjects).length > 200 ||
    new Set(s.entries.map((e) => e.id)).size !== s.entries.length ||
    new Set(s.notifications.map((n) => n.id)).size !== s.notifications.length ||
    s.notifications.some((n) =>
      n.entryIds.some((id) => !s.entries.some((e) => e.id === id)),
    )
  )
    throw new Error("Alert state bound exceeded");
  return {
    ...s,
    entries: s.entries.map((e) => ({
      ...e,
      candidate: parseCandidate(e.candidate),
    })),
  };
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function local(at: number, zone: string) {
  if (!formatters.has(zone))
    formatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  const parts = formatters.get(zone)!.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export function quietAt(rule: AlertRule, at: string) {
  if (!rule.quiet.enabled) return false;
  const m = local(Date.parse(at), rule.zone).minute,
    a = minutes(rule.quiet.start),
    b = minutes(rule.quiet.end);
  return a === b || (a < b ? m >= a && m < b : m >= a || m < b);
}
/** First wall-clock boundary after now. Missing spring times use the first later local minute. */
export function nextDaily(at: string, zone: string, dailyAt: string) {
  const now = Date.parse(stamp.parse(at)),
    today = local(now, zone),
    target = minutes(dailyAt);
  const seen = new Set<string>();
  for (
    let n = Math.floor(now / 60000) * 60000 - 26 * 3600000;
    n <= now + 49 * 3600000;
    n += 60000
  ) {
    const p = local(n, zone);
    if (p.date >= today.date && p.minute >= target && !seen.has(p.date)) {
      seen.add(p.date);
      if (n > now) return new Date(n).toISOString();
    }
  }
  throw new Error("Daily boundary unavailable");
}
const fp = (r: AlertRule, c: AlertCandidate) =>
  JSON.stringify([
    "alerts-v1",
    c.origin,
    r.id,
    c.kind,
    c.subject.type,
    c.subject.id,
    c.id,
  ]);
export interface AlertContext {
  personPaused?: boolean;
  authorId?: string | null;
}
function blocked(rule: AlertRule, context: AlertContext, at: string) {
  return !rule.enabled
    ? "rule_paused"
    : rule.kind === "person_post" &&
        (context.personPaused !== false || !context.authorId)
      ? "person_paused"
      : quietAt(rule, at)
        ? "quiet_hours"
        : null;
}
export function advance(
  rawRule: AlertRule,
  rawState: AlertState,
  rawCandidates: AlertCandidate[],
  now: string,
  context: AlertContext = {},
): AlertState {
  const rule = ruleSchema.parse(rawRule),
    s = parseState(rawState),
    at = Date.parse(stamp.parse(now));
  if (s.clock && Date.parse(s.clock) > at)
    throw new Error("Alert clock cannot go backwards");
  if (rawCandidates.length > 100) throw new Error("Candidate batch too large");
  const flush = () => {
    const pending = s.entries.filter(
      (e) => e.status === "pending" && Date.parse(e.dueAt!) <= at,
    );
    const reason = blocked(rule, context, now);
    let capacity =
      rule.maxPerHour -
      s.entries.filter(
        (e) => e.deliveredAt && Date.parse(e.deliveredAt) > at - 3600000,
      ).length;
    const groups = new Map<string, AlertEntry[]>();
    for (const e of pending) {
      const why =
        reason ??
        (e.candidate.quality < rule.minQuality
          ? "data_quality"
          : capacity <= 0
            ? "hourly_limit"
            : null);
      if (why) {
        e.status = "suppressed";
        e.suppression = why;
        continue;
      }
      capacity--;
      e.status = "notified";
      e.deliveredAt = now;
      const list = groups.get(e.group) ?? [];
      list.push(e);
      groups.set(e.group, list);
    }
    for (const [group, entries] of groups) {
      const id = JSON.stringify([rule.id, group, now]),
        existing = s.notifications.find((n) => n.id === id);
      if (existing) existing.entryIds.push(...entries.map((e) => e.id));
      else
        s.notifications.push({
          id,
          at: now,
          entryIds: entries.map((e) => e.id),
          read: false,
        });
    }
  };
  flush();
  for (const raw of [...rawCandidates].sort(
    (a, b) =>
      Date.parse(a.collectedAt) - Date.parse(b.collectedAt) ||
      a.id.localeCompare(b.id),
  )) {
    const c = parseCandidate(raw);
    if (c.kind !== rule.kind) continue;
    const id = fp(rule, c);
    if (s.entries.some((e) => e.id === id)) continue;
    if (
      rule.kind === "person_post" &&
      (c.personId !== rule.personId || c.authorId !== context.authorId)
    )
      continue;
    const key = JSON.stringify([c.subject.type, c.subject.id]),
      subject = s.subjects[key] ?? {
        armed: true,
        lastTrigger: null,
        lastObservedAt: null,
      };
    const latched = [
      "mentions",
      "liquidity",
      "transactions",
      "quota",
      "budget",
      "disconnect",
      "provider_error",
    ].includes(c.kind);
    const outOfOrder =
      latched &&
      subject.lastObservedAt !== null &&
      Date.parse(c.at) < Date.parse(subject.lastObservedAt);
    const test = inspect(rule, c);
    let suppression = blocked(rule, context, now);
    if (!suppression) {
      if (
        Date.parse(c.at) > at ||
        Date.parse(c.collectedAt) > at ||
        Date.parse(c.at) > Date.parse(c.collectedAt)
      )
        suppression = "future_observation";
      else if (at - Date.parse(c.at) > rule.maxAgeSeconds * 1000)
        suppression = "stale_observation";
      else if (outOfOrder) suppression = "out_of_order";
      else if (c.quality < rule.minQuality) suppression = "data_quality";
      else if (!test.trigger) suppression = "condition_not_met";
      else if (!subject.armed) suppression = "hysteresis";
      else if (
        subject.lastTrigger &&
        at - Date.parse(subject.lastTrigger) < rule.cooldownSeconds * 1000
      )
        suppression = "cooldown";
      else if (
        s.entries.filter(
          (e) => e.status !== "suppressed" && Date.parse(e.at) > at - 3600000,
        ).length >= rule.maxPerHour
      )
        suppression = "hourly_limit";
    }
    if (
      !blocked(rule, context, now) &&
      !outOfOrder &&
      Date.parse(c.collectedAt) <= at &&
      Date.parse(c.at) <= Date.parse(c.collectedAt) &&
      at - Date.parse(c.at) <= rule.maxAgeSeconds * 1000 &&
      c.quality >= rule.minQuality &&
      c.complete
    ) {
      if (test.rearm) subject.armed = true;
      subject.lastObservedAt = c.at;
    }
    let dueAt: string | null = null,
      group = "";
    if (!suppression) {
      const seconds =
        rule.delivery === "interval"
          ? rule.intervalMinutes * 60
          : rule.groupSeconds;
      dueAt =
        rule.delivery === "daily"
          ? nextDaily(now, rule.zone, rule.dailyAt)
          : seconds
            ? new Date(
                (Math.floor(at / (seconds * 1000)) + 1) * seconds * 1000,
              ).toISOString()
            : now;
      group = rule.delivery + ":" + dueAt;
      subject.lastTrigger = now;
      subject.armed = test.rearm;
    }
    s.subjects[key] = subject;
    s.entries.push({
      id,
      candidate: c,
      at: now,
      reason: test.reason,
      status: suppression ? "suppressed" : "pending",
      suppression,
      dueAt,
      group,
      deliveredAt: null,
      feedbackAt: null,
    });
  }
  flush();
  s.clock = now;
  return parseState(s);
}
export function feedback(
  state: AlertState,
  id: string,
  kind: "false_positive" | "read",
  now: string,
) {
  const s = parseState(state);
  stamp.parse(now);
  if (kind === "false_positive") {
    const e = s.entries.find((e) => e.id === id);
    if (!e || e.status === "suppressed") throw new Error("Alert not available");
    e.status = "false_positive";
    e.feedbackAt = now;
  } else {
    const n = s.notifications.find((n) => n.id === id);
    if (!n) throw new Error("Notification not found");
    n.read = true;
    for (const e of s.entries)
      if (n.entryIds.includes(e.id) && e.status === "notified")
        e.status = "acknowledged";
  }
  return s;
}
