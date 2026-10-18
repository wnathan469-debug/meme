import { z } from "zod";
export const ruleSchema = z
  .object({
    id: z.string().max(80),
    name: z.string().trim().min(1).max(100),
    threshold: z.number().int().min(2).max(1000),
    resetBelow: z.number().int().min(0).max(999),
    cooldown: z.number().int().min(0).max(1440),
    enabled: z.boolean(),
  })
  .refine(
    (r) => r.resetBelow < r.threshold,
    "Le seuil de réarmement doit être inférieur au seuil de déclenchement.",
  );
export const stateSchema = z.object({
  version: z.literal(1),
  theme: z.enum(["dark", "light"]),
  timezone: z.enum(["America/Toronto", "Europe/Paris", "UTC"]),
  watchlist: z.array(z.string().trim().min(1).max(80)).max(50),
  disabledSources: z
    .array(z.enum(["press", "media", "social", "indexer"]))
    .max(4),
  dismissedAlerts: z.array(z.string().max(150)).max(500),
  rule: ruleSchema,
});
export type SavedState = z.infer<typeof stateSchema>;
export const defaultState: SavedState = {
  version: 1,
  theme: "dark",
  timezone: "America/Toronto",
  watchlist: ["Tesla", "Nébula"],
  disabledSources: [],
  dismissedAlerts: [],
  rule: {
    id: "attention-local",
    name: "Attention soutenue",
    threshold: 70,
    resetBelow: 30,
    cooldown: 30,
    enabled: true,
  },
};
declare global {
  interface Window {
    memeradar?: {
      loadState(): Promise<{ state: unknown; warning?: string }>;
      saveState(state: unknown): Promise<void>;
      copyAddress(address: string): Promise<void>;
      version: string;
    };
  }
}
export async function loadState(): Promise<{
  state: SavedState;
  warning?: string;
}> {
  let raw: unknown;
  let warning: string | undefined;
  try {
    if (window.memeradar) {
      const result = await window.memeradar.loadState();
      raw = result.state;
      warning = result.warning;
    } else {
      const text = localStorage.getItem("memeradar-demo-state");
      raw = text ? JSON.parse(text) : null;
    }
    if (raw == null) return { state: defaultState, warning };
    const result = stateSchema.safeParse(raw);
    return result.success
      ? { state: result.data, warning }
      : {
          state: defaultState,
          warning:
            "Préférences incompatibles : les valeurs par défaut sont utilisées. Le fichier existant est conservé.",
        };
  } catch {
    return {
      state: defaultState,
      warning:
        "Les préférences ne peuvent pas être lues. Les données locales ne seront pas écrasées automatiquement.",
    };
  }
}
export async function persistState(state: SavedState): Promise<void> {
  const valid = stateSchema.parse(state);
  if (window.memeradar) await window.memeradar.saveState(valid);
  else localStorage.setItem("memeradar-demo-state", JSON.stringify(valid));
}
