/** Prepared for V2 activation; V1 continues to use preferences-v1.json. */
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { z } = require("zod");
const { schema: v1Schema } = require("./preferences.cjs");
const schema = v1Schema.extend({
  version: z.literal(2),
  dataOrigin: z.literal("DEMO"),
  x: z.object({
    enabled: z.literal(false),
    collectionMode: z.literal("disabled"),
  }),
});
async function readBounded(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024)
    throw new Error("Invalid preferences file");
  const value = await fs.readFile(file, "utf8");
  if (Buffer.byteLength(value) > 128 * 1024)
    throw new Error("Invalid preferences file");
  return value;
}
async function exclusive(file, text) {
  const temp = file + "." + randomUUID() + ".tmp";
  let handle;
  try {
    handle = await fs.open(temp, "wx", 0o600);
    await handle.writeFile(text);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.link(temp, file);
  } finally {
    await handle?.close();
    await fs.unlink(temp).catch(() => {});
  }
}
async function preparePreferencesV2(directory, defaults) {
  const destination = path.join(directory, "preferences-v2.json"),
    old = path.join(directory, "preferences-v1.json"),
    backup = path.join(directory, "preferences-v1.before-v2.json");
  const existing = async () =>
    schema.parse(JSON.parse(await readBounded(destination)));
  try {
    return { state: await existing(), source: "v2" };
  } catch (error) {
    if (error.code !== "ENOENT")
      return {
        state: null,
        warning: "Préférences V2 illisibles ou invalides : fichier conservé.",
      };
  }
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    let original, previous, source;
    try {
      original = await readBounded(old);
      previous = v1Schema.parse(JSON.parse(original));
      source = "v1";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      previous = v1Schema.parse(defaults);
      source = "defaults";
    }
    const state = schema.parse({
      ...previous,
      version: 2,
      dataOrigin: "DEMO",
      x: { enabled: false, collectionMode: "disabled" },
    });
    if (original !== undefined) {
      try {
        await exclusive(backup, original);
      } catch (error) {
        if (error.code !== "EEXIST" || (await readBounded(backup)) !== original)
          throw error;
      }
    }
    try {
      await exclusive(destination, JSON.stringify(state, null, 2));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      return { state: await existing(), source: "v2" };
    }
    return { state, source };
  } catch {
    return {
      state: null,
      warning:
        "Migration des préférences suspendue : fichiers existants conservés.",
    };
  }
}
module.exports = { schema, preparePreferencesV2 };
