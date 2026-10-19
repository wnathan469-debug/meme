import { z } from "zod";
import { eventAt } from "../events/demo-data";
import { endpointNames } from "../connectors/x/contracts";
import {
  defaultSettings,
  settingsSchema,
  diagnosticSchema,
  connectionState,
  periodKeys,
  type ProviderId,
  type ProviderSettings,
  type ProviderDiagnostic,
} from "./model";
export const scenarios = [
  "normal",
  "quota",
  "budget",
  "disconnect",
  "error",
  "unconfigured",
] as const;
const entry = z.object({
  settings: settingsSchema,
  revision: z.number().int().positive(),
  tests: z.number().int().min(0).max(100),
  cost: z.string().regex(/^\d{1,40}$/),
  lastTest: z.iso.datetime().nullable(),
});
export const demoSourcesSchema = z.object({
  version: z.literal(1),
  scenario: z.enum(scenarios),
  clock: z.iso.datetime(),
  scenarioAt: z.iso.datetime().optional(),
  entries: z.object({ x: entry, gecko: entry, goplus: entry }),
  rules: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().max(100),
        priority: z.enum(["critical", "high", "normal", "low"]),
        seconds: z.number().int().min(60).max(86400),
      }),
    )
    .max(100),
});
export type DemoSources = z.infer<typeof demoSourcesSchema>;
export function initialSources(): DemoSources {
  const x = defaultSettings();
  x.enabled = true;
  x.budget = {
    daily: "1000000",
    monthly: "5000000",
    warningPercent: 80,
    features: { people: { daily: "500000", monthly: "2500000" } },
  };
  const make = (settings: ProviderSettings) => ({
    settings,
    revision: 1,
    tests: 0,
    cost: "0",
    lastTest: null,
  });
  return {
    version: 1,
    scenario: "normal",
    clock: eventAt(60),
    entries: {
      x: make(x),
      gecko: make(defaultSettings()),
      goplus: make(defaultSettings()),
    },
    rules: [
      {
        id: "00000000-0000-4000-8000-000000000151",
        name: "[DÉMO] Veille Nébula",
        priority: "high",
        seconds: 300,
      },
      {
        id: "00000000-0000-4000-8000-000000000152",
        name: "[DÉMO] Personnes suivies",
        priority: "normal",
        seconds: 900,
      },
    ],
  };
}
export function demoSource(s: DemoSources, p: ProviderId) {
  const e = s.entries[p],
    origin = "DEMO" as const,
    asOf = s.clock,
    at =
      e.lastTest && Date.parse(e.lastTest) <= Date.parse(s.clock)
        ? e.lastTest
        : new Date(
            Math.min(
              Date.parse(s.clock),
              Date.parse(s.scenarioAt ?? eventAt(60)),
            ),
          ).toISOString(),
    anchor = s.scenarioAt ? Date.parse(s.scenarioAt) : Date.parse(eventAt(60)),
    reset = new Date(anchor + 15 * 60000).toISOString(),
    retry = new Date(anchor + 2 * 60000).toISOString(),
    code =
      p === "x"
        ? s.scenario === "quota"
          ? "RATE_LIMITED"
          : s.scenario === "disconnect"
            ? "NETWORK_ERROR"
            : s.scenario === "error"
              ? "PROVIDER_UNAVAILABLE"
              : null
        : null;
  const d: ProviderDiagnostic = diagnosticSchema.parse({
    id: "00000000-0000-4000-8000-000000000160",
    endpoint:
      p === "x" ? "recent" : p === "gecko" ? "networks" : "supported_chains",
    at,
    code,
    status:
      code === "RATE_LIMITED"
        ? 429
        : code === "PROVIDER_UNAVAILABLE"
          ? 503
          : code
            ? null
            : 200,
    quota:
      p === "x"
        ? {
            limit: 300,
            remaining: code === "RATE_LIMITED" ? 0 : 285,
            resetAt: reset,
          }
        : null,
    retryAt: code ? retry : null,
  });
  const configured = !(p === "x" && s.scenario === "unconfigured"),
    blockedUntil = code === "RATE_LIMITED" ? reset : code ? retry : null;
  const extra = BigInt(e.cost),
    daily = (
      BigInt(
        s.scenario === "budget"
          ? s.scenarioAt
            ? e.settings.budget.daily
            : "1000000"
          : "350000",
      ) + extra
    ).toString(),
    monthly = (1800000n + extra).toString();
  return {
    origin,
    provider: p,
    namespace: p === "x" ? "demo" : "default",
    asOf,
    settings: e.settings,
    revision: e.revision,
    configured,
    hostAllowed: true,
    blockedUntil,
    lastSuccess: code
      ? new Date(Math.min(Date.parse(asOf), anchor - 120000)).toISOString()
      : at,
    lastError: code ? at : null,
    diagnostics: [d],
    partial: false,
    period: periodKeys(asOf),
    ...connectionState({
      configured,
      hostAllowed: true,
      settings: e.settings,
      last: d,
      asOf,
      blockedUntil,
    }),
    day: {
      calls: (14 + e.tests).toString(),
      posts: p === "x" ? "168" : null,
      unknown_posts: p === "x" ? "1" : "0",
      cost: p === "x" ? (280000n + extra).toString() : null,
    },
    month: {
      calls: (83 + e.tests).toString(),
      posts: p === "x" ? "925" : null,
      unknown_posts: p === "x" ? "2" : "0",
      cost: p === "x" ? (1450000n + extra).toString() : null,
    },
    balances:
      p === "x"
        ? [
            {
              budget_key: periodKeys(asOf).day,
              limit_micros: e.settings.budget.daily,
              spent_micros: daily,
            },
            {
              budget_key: periodKeys(asOf).month,
              limit_micros: e.settings.budget.monthly,
              spent_micros: monthly,
            },
          ]
        : [],
    pricing:
      p === "x"
        ? {
            currency: "USD" as const,
            request: "100",
            post: "200",
            user: "50",
            verifiedAt: eventAt(0),
          }
        : null,
    capabilities:
      p === "x"
        ? Object.fromEntries(
            [...endpointNames, "metrics"].map((name, i) => [
              name,
              {
                state:
                  name === "archive"
                    ? "unavailable"
                    : name === "stream"
                      ? "untested"
                      : name === "conversation"
                        ? "limited"
                        : "available",
                reason: "demo",
                observedAt: at,
                windowSeconds: i < 2 ? 604800 : null,
              },
            ]),
          )
        : null,
    collectionMode: p === "x" ? "polling" : "explicit_read_only",
    minimumIntervalSeconds: p === "x" ? 60 : 3,
  };
}
export function saveDemoSettings(
  s: DemoSources,
  p: ProviderId,
  raw: ProviderSettings,
) {
  const settings = settingsSchema.parse(raw),
    next = structuredClone(s),
    old = demoSource(s, p);
  if (p === "x" && settings.enabled && !old.configured)
    throw new Error("Accès X non configuré dans ce scénario.");
  for (const b of old.balances)
    if (
      BigInt(b.spent_micros) >
      BigInt(
        b.budget_key.startsWith("day:")
          ? settings.budget.daily
          : settings.budget.monthly,
      )
    )
      throw new Error(
        "Plafond refusé : inférieur aux engagements déjà enregistrés.",
      );
  if (p === "x")
    for (const r of next.rules)
      if (
        settings.priorities[r.priority] !==
        s.entries.x.settings.priorities[r.priority]
      )
        r.seconds = settings.priorities[r.priority];
  next.entries[p].settings = settings;
  next.entries[p].revision++;
  return demoSourcesSchema.parse(next);
}
export function checkDemoProbe(s: DemoSources, p: ProviderId) {
  const v = demoSource(s, p);
  if (!v.configured) throw new Error("Fournisseur non configuré.");
  if (!v.settings.enabled) throw new Error("Fournisseur désactivé.");
  if (v.blockedUntil && Date.parse(v.blockedUntil) > Date.parse(v.asOf))
    throw new Error(
      "Attente active : quota ou coupe-circuit. Aucun appel simulé ajouté.",
    );
  const ceiling = p === "x" ? "150" : "0";
  if (
    v.balances.some(
      (b) => BigInt(b.spent_micros) + BigInt(ceiling) > BigInt(b.limit_micros),
    )
  )
    throw new Error("Budget atteint : test refusé avant appel.");
  return ceiling;
}
export function confirmDemoProbe(s: DemoSources, p: ProviderId) {
  const ceiling = checkDemoProbe(s, p),
    next = structuredClone(s);
  next.entries[p].tests++;
  next.entries[p].cost = (
    BigInt(next.entries[p].cost) + BigInt(ceiling)
  ).toString();
  next.entries[p].lastTest = s.clock;
  return demoSourcesSchema.parse(next);
}
