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
      executablePath:
        process.env.MEMERADAR_EXECUTABLE ||
        path.join(
          root,
          "node_modules/electron/dist",
          process.platform === "win32" ? "electron.exe" : "electron",
        ),
      args: [
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        `--user-data-dir=${path.join(dir, "profile")}`,
        ...(process.env.MEMERADAR_EXECUTABLE ? [] : [root]),
      ],
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
    .getByRole("heading", { name: "MemeRadar — sur mon PC", exact: true })
    .waitFor();
  await page
    .getByText("Aucune donnée réelle collectée.", { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Démarrer la collecte", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Sources et accès", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Configurer les profils et budgets",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Profils publics X, séparés par une virgule", { exact: true })
    .fill("test_public");
  for (const label of [
    "Coût maximal par requête USD",
    "Coût maximal par publication retournée USD",
    "Coût maximal par profil retourné USD",
  ])
    await page.getByLabel(label, { exact: true }).fill("0.01");
  await page
    .getByLabel(
      "J’ai vérifié les droits de lecture, de conservation et les bornes de facturation dans mon compte X.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", {
      name: "Enregistrer la configuration locale",
      exact: true,
    })
    .click();
  await page
    .getByText("Configuration enregistrée sur ce PC ; collecte arrêtée.", {
      exact: true,
    })
    .waitFor();
  const localState = await page.evaluate(() =>
    window.memeradar.local.command("status"),
  );
  assert.equal(localState.state.stopped, true);
  assert.equal(localState.state.usage.requestsDay, 0);
  assert.equal(localState.state.posts.length, 0);
  const testKey = "TEST_LOCAL_KEY_DO_NOT_USE_12345";
  if (localState.state.secureStorage) {
    await page.getByLabel("Jeton Bearer X", { exact: true }).fill(testKey);
    await page
      .getByRole("button", { name: "Enregistrer la clé", exact: true })
      .click();
    await page
      .getByText("Clé protégée enregistrée ; aucun appel X effectué.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("Jeton Bearer X", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      JSON.stringify(
        await page.evaluate(() => window.memeradar.local.command("status")),
      ).includes(testKey),
      false,
    );
    const secure = await app.evaluate(({ app, safeStorage }, value) => {
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(
        require("node:path").join(
          app.getPath("userData"),
          "local-data-v1.sqlite",
        ),
        { readOnly: true },
      );
      const row = db
        .prepare("SELECT value FROM local_kv WHERE key='encryptedKey'")
        .get();
      db.close();
      return (
        safeStorage.decryptString(
          Buffer.from(JSON.parse(row.value), "base64"),
        ) === value
      );
    }, testKey);
    assert.equal(secure, true);
  } else {
    assert.equal(
      await page
        .getByRole("button", { name: "Enregistrer la clé", exact: true })
        .isDisabled(),
      true,
    );
  }
  await page
    .getByRole("button", { name: "Ouvrir la démonstration", exact: true })
    .click();
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
  assert.equal(path.relative(path.join(dir, "profile"), statePath), "");
  assert.equal(
    await page.evaluate(() => window.memeradar.version),
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version,
  );
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
  const restartedLocal = await page.evaluate(() =>
    window.memeradar.local.command("status"),
  );
  assert.equal(restartedLocal.state.stopped, true);
  assert.equal(restartedLocal.state.usage.requestsDay, 0);
  assert.deepEqual(restartedLocal.state.settings.usernames, ["test_public"]);
  assert.equal(restartedLocal.state.hasKey, localState.state.secureStorage);
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
  await page.goto(
    "memeradar://app/index.html#page=conversations&conversation=DEMO_POST_ROOT",
  );
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .click();
  const conversationCoverage = page.getByRole("region", {
    name: "Couverture de la conversation",
    exact: true,
  });
  assert.match(await conversationCoverage.textContent(), /29,17 %/);
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-conversation.png"),
  });
  await page.goto(
    "memeradar://app/index.html#page=events&event=00000000-0000-4000-8000-000000000060",
  );
  const eventDetail = page.getByRole("region", {
    name: "Fiche événement enrichie",
    exact: true,
  });
  await eventDetail.waitFor();
  assert.match(
    await eventDetail
      .getByRole("region", { name: "Attention avant et après", exact: true })
      .textContent(),
    /Ligne de base : 1 mentions par tranche/,
  );
  await eventDetail
    .getByRole("button", {
      name: "Configurer l’alerte d’événement",
      exact: true,
    })
    .click();
  await eventDetail
    .getByLabel("Sujet de l’alerte", { exact: true })
    .fill("Événement Electron");
  await eventDetail
    .getByRole("button", {
      name: "Enregistrer la règle d’événement",
      exact: true,
    })
    .click();
  await eventDetail.getByRole("status").waitFor();
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-event.png"),
  });
  const social = eventDetail.getByRole("region", {
    name: "Preuves sociales des tokens",
    exact: true,
  });
  await social.waitFor();
  assert.match(await social.textContent(), /Nébula Étincelle/);
  assert.match(
    await social.textContent(),
    /Première apparition observée dans les données collectées/,
  );
  assert.match(
    await social.textContent(),
    /0xDEMO000000000000000000000000000000000042/,
  );
  await social.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-social.png"),
  });
  await page.goto(
    "memeradar://app/index.html#/tokens/base/0xDEMO" + "0".repeat(34) + "42",
  );
  const analysis = page.getByRole("region", {
    name: "Analyse et graphique du token",
    exact: true,
  });
  await analysis.waitFor();
  await analysis.locator("canvas").first().waitFor();
  assert.match(await analysis.textContent(), /Nébula Étincelle/);
  assert.match(await analysis.textContent(), /tranches sans données/);
  await analysis
    .getByRole("button", { name: "Copier l’adresse", exact: true })
    .click();
  assert.equal(
    await app.evaluate(({ clipboard }) => clipboard.readText()),
    "0xDEMO" + "0".repeat(34) + "42",
  );
  await analysis
    .getByLabel("Pool du graphique", { exact: true })
    .selectOption("0xDEMO" + "0".repeat(32) + "0802");
  assert.match(page.url(), /pool=/);
  await analysis
    .getByRole("img", { name: /Bougies OHLC/ })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(root, "tests/e2e/desktop-chart.png"),
  });
  const risks = analysis.getByRole("region", {
    name: "Analyse des risques du token",
    exact: true,
  });
  await risks.waitFor();
  assert.match(await risks.textContent(), /non une certification de sécurité/);
  assert.match(await risks.textContent(), /Activité sociale et légitimité/);
  await risks
    .getByLabel("État des contrôles de risque démo")
    .selectOption("conflict");
  assert.match(await risks.textContent(), /Sources contradictoires/);
  await risks
    .getByLabel("État des contrôles de risque démo")
    .selectOption("failed");
  assert.match(await risks.textContent(), /Vérification échouée/);
  await page.goto("memeradar://app/index.html#/tokens/base/INVALID");
  await page
    .getByRole("region", { name: "Erreur de route token", exact: true })
    .waitFor();
  await page.goto("memeradar://app/index.html#page=alerts");
  assert.match(
    await page
      .getByRole("region", {
        name: "Règles d’événement enregistrées",
        exact: true,
      })
      .textContent(),
    /Événement Electron/,
  );
  const center = page.getByRole("region", {
    name: "Centre d’alertes V2",
    exact: true,
  });
  await center.waitFor();
  await center
    .getByRole("button", {
      name: "Avancer les alertes d’une heure",
      exact: true,
    })
    .click();
  const notifications = center.getByRole("region", {
    name: "Notifications V2 dans l’application",
    exact: true,
  });
  assert.ok((await notifications.getByRole("article").count()) > 0);
  await notifications
    .getByRole("button", { name: "Marquer comme lue", exact: true })
    .first()
    .click();
  const before = await notifications.getByRole("article").count();
  await page.reload();
  await center.waitFor();
  assert.equal(await notifications.getByRole("article").count(), before);
  assert.match(await notifications.textContent(), /Lue/);
  await page.goto("memeradar://app/index.html#page=sources");
  const sources = page.getByRole("region", {
    name: "Sources et API V2",
    exact: true,
  });
  await sources.waitFor();
  const sourceX = sources.getByRole("region", {
    name: "Fournisseur X",
    exact: true,
  });
  assert.match(await sourceX.textContent(), /Capacités X/);
  await sourceX
    .getByRole("button", { name: "Préparer le test X", exact: true })
    .click();
  await sourceX
    .getByRole("button", { name: "Confirmer le test démo X", exact: true })
    .click();
  assert.equal(
    await sourceX
      .getByRole("button", { name: "Confirmer le test démo X", exact: true })
      .count(),
    0,
  );
  await sourceX.getByLabel("Activer X", { exact: true }).uncheck();
  await sourceX
    .getByRole("button", { name: "Enregistrer les réglages X", exact: true })
    .click();
  await page.reload();
  await sources.waitFor();
  assert.equal(
    await sourceX.getByLabel("Activer X", { exact: true }).isChecked(),
    false,
  );
  await page.goto("memeradar://app/index.html#page=watch");
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  assert.equal(await navigation.getByRole("link").count(), 9);
  const watch = page.getByRole("region", {
    name: "Veille X locale",
    exact: true,
  });
  await watch.waitFor();
  await watch.getByLabel("Hashtag exact").fill("NebulaProduit");
  assert.match(page.url(), /tag=NebulaProduit/);
  assert.ok((await watch.getByRole("article").count()) > 0);
  await page.reload();
  assert.equal(
    await watch.getByLabel("Hashtag exact").inputValue(),
    "NebulaProduit",
  );
  await watch.getByLabel("État de la veille démo").selectOption("quota");
  assert.match(await watch.textContent(), /Quota X fictif épuisé/);
  assert.equal(await watch.getByRole("article").count(), 0);
  await page
    .getByRole("combobox", { name: "État global de la démo", exact: true })
    .selectOption("normal");
  await page
    .getByRole("slider", { name: "Temps simulé en minutes" })
    .fill("12");
  await page.reload();
  assert.equal(
    await page
      .getByRole("slider", { name: "Temps simulé en minutes" })
      .inputValue(),
    "12",
  );
  await page.goto("memeradar://app/index.html#page=sources");
  assert.equal(
    await page
      .getByRole("slider", { name: "Temps simulé en minutes" })
      .inputValue(),
    "12",
  );
  await page
    .getByRole("region", { name: "Sources et API V2", exact: true })
    .getByLabel("État des API démo")
    .selectOption("quota");
  await page.goto("memeradar://app/index.html#page=watch");
  assert.match(await watch.textContent(), /Quota X fictif épuisé/);
  await page.getByRole("slider", { name: "Temps simulé en minutes" }).fill("0");
  assert.equal(
    await page
      .getByRole("combobox", { name: "État global de la démo", exact: true })
      .inputValue(),
    "normal",
  );
  console.log(
    "PASS: Electron sandbox, IPC validation, persistent preferences across restart, clipboard, deep link and blocked main/renderer network.",
  );
} catch (error) {
  if (process.env.GITHUB_ACTIONS) {
    console.error(
      `::error::${String(error.stack || error)
        .replaceAll("%", "%25")
        .replaceAll("\r", "%0D")
        .replaceAll("\n", "%0A")}`,
    );
  }
  throw error;
} finally {
  if (app) await app.close();
  await rm(dir, { recursive: true, force: true });
}
