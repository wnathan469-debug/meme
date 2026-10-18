import { afterEach, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const {
  preparePreferencesV2,
  schema,
} = require("../../apps/desktop/preferences-v2.cjs");
const { schema: v1 } = require("../../apps/desktop/preferences.cjs");
const dirs: string[] = [];
const defaults = {
  version: 1,
  theme: "dark",
  timezone: "Europe/Paris",
  watchlist: ["fictif"],
  disabledSources: ["social"],
  dismissedAlerts: ["fixture"],
  rule: {
    id: "attention",
    name: "Attention",
    threshold: 5,
    resetBelow: 2,
    cooldown: 30,
    enabled: true,
  },
};
async function dir() {
  const value = await mkdtemp(path.join(tmpdir(), "memeradar-v2-prefs-"));
  dirs.push(value);
  return value;
}
afterEach(async () => {
  for (const value of dirs.splice(0))
    await rm(value, { recursive: true, force: true });
});
it("preserves exact V1 bytes and a backup, validates V2 and supports downgrade", async () => {
  const directory = await dir(),
    original = JSON.stringify(defaults, null, 2) + "\n";
  await writeFile(path.join(directory, "preferences-v1.json"), original);
  const result = await preparePreferencesV2(directory, defaults);
  expect(result.source).toBe("v1");
  expect(schema.parse(result.state)).toMatchObject({
    theme: "dark",
    dataOrigin: "DEMO",
    x: { enabled: false, collectionMode: "disabled" },
  });
  expect(
    await readFile(
      path.join(directory, "preferences-v1.before-v2.json"),
      "utf8",
    ),
  ).toBe(original);
  expect(
    v1.parse(
      JSON.parse(
        await readFile(path.join(directory, "preferences-v1.json"), "utf8"),
      ),
    ),
  ).toEqual(defaults);
  expect(
    (await preparePreferencesV2(directory, { ...defaults, theme: "light" }))
      .state.theme,
  ).toBe("dark");
});
it("serializes racing upgrades without overwriting either version", async () => {
  const directory = await dir();
  await writeFile(
    path.join(directory, "preferences-v1.json"),
    JSON.stringify(defaults),
  );
  const results = await Promise.all(
    Array.from({ length: 8 }, () => preparePreferencesV2(directory, defaults)),
  );
  expect(results.every((r) => r.state?.version === 2)).toBe(true);
  expect((await readdir(directory)).filter((f) => f.endsWith(".tmp"))).toEqual(
    [],
  );
});
it("does not overwrite malformed V1, V2 or a conflicting backup", async () => {
  for (const filename of [
    "preferences-v1.json",
    "preferences-v2.json",
    "preferences-v1.before-v2.json",
  ]) {
    const directory = await dir();
    await writeFile(
      path.join(directory, "preferences-v1.json"),
      JSON.stringify(defaults),
    );
    await writeFile(path.join(directory, filename), "corrupt");
    expect((await preparePreferencesV2(directory, defaults)).state).toBeNull();
    expect(await readFile(path.join(directory, filename), "utf8")).toBe(
      "corrupt",
    );
  }
});
it("initializes only DEMO defaults and rejects oversized or linked input", async () => {
  const directory = await dir();
  expect((await preparePreferencesV2(directory, defaults)).source).toBe(
    "defaults",
  );
  const large = await dir();
  await writeFile(
    path.join(large, "preferences-v1.json"),
    " ".repeat(128 * 1024 + 1),
  );
  expect((await preparePreferencesV2(large, defaults)).state).toBeNull();
  if (process.platform !== "win32") {
    const linked = await dir(),
      target = path.join(linked, "original");
    await writeFile(target, JSON.stringify(defaults));
    await symlink(target, path.join(linked, "preferences-v1.json"));
    expect((await preparePreferencesV2(linked, defaults)).state).toBeNull();
  }
  expect(() =>
    schema.parse({
      ...defaults,
      version: 2,
      dataOrigin: "REAL",
      x: { enabled: true, collectionMode: "stream" },
    }),
  ).toThrow();
});
