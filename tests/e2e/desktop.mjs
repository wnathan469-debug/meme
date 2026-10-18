import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const dir = await mkdtemp(path.join(tmpdir(), "memeradar-shell-"));
let app;
try {
  await mkdir(path.join(dir, "config"), { recursive: true });
  const launch = () =>
    electron.launch({
      executablePath: path.join(root, "node_modules/electron/dist/electron"),
      args: ["--no-sandbox", root],
      env: {
        ...process.env,
        XDG_CONFIG_HOME: path.join(dir, "config"),
        XDG_CACHE_HOME: path.join(dir, "cache"),
      },
      timeout: 30000,
    });
  app = await launch();
  let page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("heading", { name: "Tableau de bord", exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  assert.equal(await page.evaluate(() => typeof window.process), "undefined");
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
          .sandbox,
    ),
    true,
  );
  assert.equal(
    await page.evaluate(() => typeof window.memeradar.saveState),
    "function",
  );
  const remote = await app.evaluate(async ({ net }) => {
    try {
      await net.fetch("https://example.org/");
      return "unexpected";
    } catch {
      return "blocked";
    }
  });
  assert.equal(remote, "blocked");
  const rendererRemote = await page.evaluate(async () => {
    try {
      await fetch("https://example.org/");
      return "unexpected";
    } catch {
      return "blocked";
    }
  });
  assert.equal(rendererRemote, "blocked");
  assert.equal(
    await page.evaluate(async () => {
      try {
        await window.memeradar.saveState({ version: 1, theme: "invalid" });
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  await page.getByRole("link", { name: /Paramètres/ }).click();
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("light");
  await page.getByRole("status").filter({ hasText: "enregistrées" }).waitFor();
  const statePath = await app.evaluate(({ app }) => app.getPath("userData"));
  const stored = JSON.parse(
    await readFile(path.join(statePath, "preferences-v1.json"), "utf8"),
  );
  assert.equal(stored.theme, "light");
  await page.goto("memeradar://app/index.html#page=tokens&token=official");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Copier l’adresse" }).click();
  assert.match(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    /^0xDEMO/,
  );
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-token.png"),
  });
  await page.goto("memeradar://app/index.html#page=people");
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("demo_analyste_julie");
  await page
    .getByLabel("Note privée", { exact: true })
    .fill("Note locale persistante du test Electron");
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await page
    .getByText("Note locale persistante du test Electron", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Tableau de bord", exact: true })
    .waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-dashboard.png"),
  });
  await page.goto("memeradar://app/index.html#page=people");
  await page
    .getByText("Note locale persistante du test Electron", { exact: true })
    .waitFor();
  console.log(
    "PASS: Electron sandbox, IPC validation, persistent preferences across restart, clipboard, deep link and blocked main/renderer network.",
  );
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
