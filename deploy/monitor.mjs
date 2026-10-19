import { writeFile, rename } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { checkHealth } from "./health.mjs";
// A separate host must run this to detect loss of the API host itself.
const output = process.env.MEMERADAR_MONITOR_STATE_FILE;
const interval = Number(process.env.MEMERADAR_MONITOR_INTERVAL_MS ?? "60000");
if (!output || !Number.isInteger(interval) || interval < 1000)
  throw new Error();
let previous,
  failures = 0;
do {
  let ok = false;
  try {
    ok = await checkHealth();
  } catch {
    /* Detailed URLs and network errors are intentionally not logged. */
  }
  failures = ok ? 0 : failures + 1;
  const status = ok ? "healthy" : failures >= 2 ? "alert" : "pending";
  const event = {
    at: new Date().toISOString(),
    service: "MemeRadar",
    status,
    failures,
    scope: "https_and_database_not_providers",
  };
  await writeFile(output + ".tmp", JSON.stringify(event) + "\n", {
    mode: 0o600,
  });
  await rename(output + ".tmp", output);
  if (status !== previous) process.stdout.write(JSON.stringify(event) + "\n");
  previous = status;
  if (process.env.MEMERADAR_MONITOR_ONCE === "true") break;
  await setTimeout(interval);
} while (true);
