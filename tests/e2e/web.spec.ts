import { test, expect } from "@playwright/test";
test("parcours Tesla, indicateurs, alertes, filtres et aucune requête externe", async ({
  page,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("MODE DÉMO", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: /Annonce virale d’un nouveau véhicule par Tesla/,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Aucune affirmation n’est faite sur Tesla ou ses produits réels.",
      { exact: false },
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /Tesla Official/ }).click();
  await expect(
    dialog.getByRole("heading", {
      name: "[DÉMO] Tesla Official — imitateur",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/Aucune preuve d’un lien officiel/),
  ).toBeVisible();
  await expect(dialog.getByText(/Cette analyse est automatisée/)).toBeVisible();
  await dialog
    .getByRole("button", { name: /Pourquoi ce niveau/ })
    .nth(3)
    .click();
  await expect(dialog.getByText(/Le niveau élevé exige/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: /Tokens détectés/ }).click();
  await page
    .getByRole("combobox", { name: "Chaîne", exact: true })
    .selectOption("Solana");
  await expect(page).toHaveURL(/chain=Solana/);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("textbox", { name: "Rechercher" }).fill("introuvable");
  await expect(
    page.getByRole("heading", { name: "Aucun token correspondant" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Alertes/ }).click();
  await page.getByLabel("Inclure les alertes supprimées").check();
  await expect(
    page.getByText("Répétition supprimée", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Signaler un faux positif" })
    .first()
    .click();
  await expect(
    page.getByText("Faux positif signalé", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("footer")).toContainText(
    "ne constitue pas un conseil financier",
  );
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test("préférences persistantes, règle éditable et rejeu", async ({ page }) => {
  await page.goto("/#page=settings");
  await page
    .getByRole("combobox", { name: "Apparence", exact: true })
    .selectOption("light");
  await page.getByLabel("Fuseau horaire").selectOption("Europe/Paris");
  await page.getByRole("textbox", { name: "Nouveau mot-clé" }).fill("Boréal");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Apparence", exact: true }),
  ).toHaveValue("light");
  await expect(
    page.getByRole("button", { name: "Boréal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Boréal", exact: true }).click();
  await expect(page).toHaveURL(/q=Bor/);
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("link", { name: /Alertes/ }).click();
  await page.getByRole("button", { name: "Ma règle d’attention" }).click();
  await page.getByLabel("Déclencher à partir de").fill("100");
  await page.getByRole("button", { name: "Enregistrer la règle" }).click();
  await expect(page.getByRole("status")).toContainText("enregistrées");
  await page.getByRole("button", { name: "Recommencer", exact: true }).click();
  await expect(page.getByLabel("Temps simulé en minutes")).toHaveValue("0");
  await page.getByRole("button", { name: "Rejouer ×300" }).click();
  await expect(page.getByLabel("Temps simulé en minutes")).not.toHaveValue("0");
  await page.getByRole("button", { name: "Ⅱ Pause" }).click();
});
test("petit écran, données manquantes et sources exclues", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.goto("/#page=tokens&token=unknown");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Non disponible", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    dialog.getByText("Vérification échouée", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: /Pourquoi ce niveau/ })
    .nth(1)
    .click();
  await expect(
    dialog.getByText(/Donnée manquante : métadonnées/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Sources", exact: true }).click();
  await page.getByLabel("Inclure dans les vues de sources").nth(2).uncheck();
  await page.getByRole("link", { name: /Tableau de bord/ }).click();
  await expect(
    page.getByRole("heading", { name: "Source sociale exclue" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("personnes : confirmation, note échappée, pause, catégories, persistance et suppression hors réseau", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/#page=people");
  await page.getByLabel("Nom de catégorie", { exact: true }).fill("Experts");
  await page
    .getByRole("button", { name: "Créer la catégorie", exact: true })
    .click();
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("@demo_analyste_julie");
  await page.getByLabel("Nom personnalisé").fill("Julie suivie");
  await page
    .getByLabel("Catégorie", { exact: true })
    .selectOption({ label: "Experts" });
  const note =
    '<img src="https://example.invalid/trap" onerror="window.stolen=true"> note privée';
  await page.getByLabel("Note privée", { exact: true }).fill(note);
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmer le compte", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Julie suivie", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  const observations = page.getByRole("region", {
    name: "Publications de demo_analyste_julie",
    exact: true,
  });
  await expect(
    observations.getByText(
      "[DÉMO] Une annonce entièrement fictive sur Nébula Mobile.",
      { exact: true },
    ),
  ).toBeVisible();
  await observations.getByLabel("Texte des publications").fill("introuvable");
  await expect(
    observations.getByText(
      "Aucune publication correspondante dans cet instantané.",
      { exact: true },
    ),
  ).toBeVisible();
  await observations.getByLabel("Texte des publications").fill("");
  expect(await page.locator('img[src*="trap"]').count()).toBe(0);
  await page
    .getByRole("button", { name: "Réactiver demo_analyste_julie", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Mettre en pause demo_analyste_julie",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Julie suivie", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Renommer Experts", exact: true })
    .click();
  await page.getByLabel("Nom de catégorie", { exact: true }).fill("Analystes");
  await page
    .getByRole("button", { name: "Renommer la catégorie", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Supprimer Analystes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Supprimer demo_analyste_julie", exact: true })
    .click();
  await expect(
    page.getByText("Aucune personne suivie.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(note, { exact: true })).toHaveCount(0);
  expect(external).toEqual([]);
});
