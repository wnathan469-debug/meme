const { z } = require("zod");
const rule = z
  .object({
    id: z.string().max(80),
    name: z.string().trim().min(1).max(100),
    threshold: z.number().int().min(2).max(1000),
    resetBelow: z.number().int().min(0).max(999),
    cooldown: z.number().int().min(0).max(1440),
    enabled: z.boolean(),
  })
  .refine((r) => r.resetBelow < r.threshold);
const schema = z.object({
  version: z.literal(1),
  theme: z.enum(["dark", "light"]),
  timezone: z.enum(["America/Toronto", "Europe/Paris", "UTC"]),
  watchlist: z.array(z.string().trim().min(1).max(80)).max(50),
  disabledSources: z
    .array(z.enum(["press", "media", "social", "indexer"]))
    .max(4),
  dismissedAlerts: z.array(z.string().max(150)).max(500),
  rule,
});
module.exports = { schema };
