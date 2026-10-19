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
  await page.getByRole("link", { name: "Sources et API", exact: true }).click();
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

test("conversation démo : confirmation, 35/120, parents manquants, citations et erreurs sans réseau", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:5173") &&
      !request.url().startsWith("data:")
    )
      external.push(request.url());
  });
  await page.goto("/#page=people");
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("demo_analyste_julie");
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Voir la conversation", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Conversations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Réponses récupérées", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Annuler le chargement", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Réponses récupérées", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const coverage = page.getByRole("region", {
    name: "Couverture de la conversation",
    exact: true,
  });
  await expect(coverage.getByRole("status")).toContainText(
    "35 réponses récupérées sur environ 120",
  );
  await expect(coverage).toContainText("29,17 %");
  const replies = page.getByRole("region", {
    name: "Réponses récupérées",
    exact: true,
  });
  await expect(replies.locator("article")).toHaveCount(35);
  await expect(
    replies.getByText(
      "Réponse à une publication non récupérée (maillon manquant).",
      { exact: true },
    ),
  ).toHaveCount(2);
  const quotes = page.getByRole("region", {
    name: "Citations récupérées",
    exact: true,
  });
  await expect(
    quotes.getByText("[DÉMO] Citation fictive de cette annonce.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    replies.getByText("[DÉMO] Citation fictive de cette annonce.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Liste chronologique", exact: true })
    .click();
  await expect(replies.locator("article")).toHaveCount(35);
  await page
    .getByLabel("Réponses contenant une adresse candidate", { exact: true })
    .check();
  await expect(replies.locator("article")).toHaveCount(9);
  await expect(coverage.getByRole("status")).toContainText(
    "35 réponses récupérées",
  );
  await page
    .getByLabel("Réponses contenant une adresse candidate", { exact: true })
    .uncheck();
  await page
    .getByLabel("Rechercher dans la conversation", { exact: true })
    .fill("introuvable");
  await expect(replies).toContainText(
    "ne prouve pas l’absence d’autres commentaires",
  );
  await page
    .getByLabel("Rechercher dans la conversation", { exact: true })
    .fill("");
  await page
    .getByLabel("Simuler un état", { exact: true })
    .selectOption("window");
  await expect(coverage).toContainText("fenêtre temporelle accessible");
  await page
    .getByLabel("Simuler un état", { exact: true })
    .selectOption("unknown_count");
  await expect(coverage).toContainText("Couverture observée : inconnue");
  await page
    .getByLabel("Simuler un état", { exact: true })
    .selectOption("rate_limit");
  await expect(page.getByRole("alert")).toContainText("429 simulé");
  await page
    .getByLabel("Simuler un état", { exact: true })
    .selectOption("budget");
  await expect(page.getByRole("alert")).toContainText("Budget épuisé simulé");
  await page
    .getByLabel("Simuler un état", { exact: true })
    .selectOption("unavailable");
  await expect(
    page.getByText(
      "Publication racine non récupérée ou indisponible. Les réponses accessibles restent consultables.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
});

test("événement V2 : ligne de base, trou visible, liens interprétés et règle persistante sans réseau", async ({
  page,
}) => {
  const id = "00000000-0000-4000-8000-000000000060",
    title =
      "[DÉMO] Annonce virale d’un nouveau produit par l’entreprise fictive Nébula Mobile",
    external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/#page=events");
  await expect(
    page.getByRole("button", {
      name: /Annonce virale d’un nouveau véhicule par Tesla/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: new RegExp("Annonce virale d’un nouveau produit"),
    })
    .click();
  const detail = page.getByRole("region", {
    name: "Fiche événement enrichie",
    exact: true,
  });
  await expect(
    detail.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const attention = detail.getByRole("region", {
    name: "Attention avant et après",
    exact: true,
  });
  await expect(attention).toContainText(
    "Ligne de base : 1 mentions par tranche",
  );
  const gap = attention.getByRole("row").filter({ hasText: "T+15 à T+20 min" });
  await expect(gap).toContainText("Inconnu (au moins");
  await expect(gap).toContainText("Indisponible");
  const provenance = detail.getByRole("region", {
    name: "Fiabilité et popularité distinctes",
    exact: true,
  });
  await expect(provenance).toContainText("Niveau A");
  await expect(provenance).toContainText("ne modifie pas la fiabilité");
  await expect(
    detail.getByRole("region", { name: "Chronologie enrichie", exact: true }),
  ).toContainText("Première mention exacte connue du token");
  const posts = detail.getByRole("region", {
    name: "Publications liées à l’événement",
    exact: true,
  });
  await posts
    .getByLabel("Catégorie du compte", { exact: true })
    .selectOption("official_attested");
  await expect(posts).toContainText("@demo_nebula_officiel");
  await expect(posts).not.toContainText("@demo_analyste_julie");
  await posts
    .getByLabel("Catégorie du compte", { exact: true })
    .selectOption("followed");
  await expect(posts).toContainText("@demo_trader_k");
  await expect(posts).not.toContainText("@demo_nebula_officiel");
  await detail
    .getByRole("button", {
      name: "Configurer l’alerte d’événement",
      exact: true,
    })
    .click();
  await detail
    .getByLabel("Type de sujet", { exact: true })
    .selectOption("hashtag");
  await detail
    .getByLabel("Sujet de l’alerte", { exact: true })
    .fill("#ProduitCosmique");
  await detail
    .getByRole("button", {
      name: "Enregistrer la règle d’événement",
      exact: true,
    })
    .click();
  await expect(detail.getByRole("status")).toContainText(
    "Règle d’événement enregistrée",
  );
  await detail
    .getByRole("link", { name: "Voir mes règles d’événement", exact: true })
    .click();
  await page.reload();
  const drafts = page.getByRole("region", {
    name: "Règles d’événement enregistrées",
    exact: true,
  });
  await expect(drafts).toContainText("#ProduitCosmique");
  await expect(drafts).toContainText("En pause");
  await drafts
    .getByRole("link", { name: "Voir l’événement associé", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(id));
  await page.getByRole("slider").fill("10");
  await expect(
    page.getByRole("region", { name: "Attention avant et après", exact: true }),
  ).toContainText("Ligne de base : inconnue");
  await page.getByRole("slider").fill("60");
  await page.goto("/#page=conversations&conversation=DEMO_POST_ROOT");
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .click();
  await page.getByLabel("Événement lié", { exact: true }).selectOption(id);
  await page
    .getByRole("region", { name: "Citations récupérées", exact: true })
    .getByRole("link", { name: "Voir l’événement lié", exact: true })
    .count()
    .then((n) => expect(n).toBe(0));
  const firstEventLink = page
    .getByRole("link", { name: "Voir l’événement lié", exact: true })
    .first();
  await expect(firstEventLink).toBeVisible();
  await firstEventLink.click();
  await expect(
    page.getByRole("region", { name: "Fiche événement enrichie", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/#page=sources");
  await page.getByLabel("Inclure dans les vues de sources").nth(2).uncheck();
  await page.goto(`/#page=events&event=${id}`);
  await expect(
    page.getByRole("region", { name: "Attention avant et après", exact: true }),
  ).toContainText("Ligne de base : inconnue");
  await expect(
    page.getByRole("region", {
      name: "Fiabilité et popularité distinctes",
      exact: true,
    }),
  ).toContainText("Indisponible : source X exclue");
  expect(external).toEqual([]);
});

test("preuves sociales V2 : adresse complète, indices faibles, première observation et navigation sans réseau", async ({
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
  const id = "00000000-0000-4000-8000-000000000071";
  await page.goto("/#page=tokens");
  const region = page.getByRole("region", {
    name: "Preuves sociales des tokens",
    exact: true,
  });
  await expect(region).toBeVisible();
  const main = region
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: /Nébula Étincelle/ }) })
    .first();
  await expect(main).toContainText("Plausible");
  await expect(main).toContainText("0xDEMO" + "0".repeat(34) + "42");
  await expect(main).toContainText("DEMO_EVENT_AFTER_8");
  await expect(region).toContainText("Alphabets mêlés");
  await expect(region).toContainText("Token créé avant");
  await expect(region).toContainText("Âge des auteurs : inconnu");
  await main.getByText(/Publications associées et méthodes/).click();
  await region.getByLabel("Méthode de preuve").selectOption("token_page_url");
  await expect(main.getByRole("article")).toContainText(
    "Page de token autorisée",
  );
  await main
    .getByRole("link", { name: "Voir l’événement Nébula Mobile", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Fiche événement enrichie", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Voir les preuves du token.*Nébula Étincelle/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(id));
  await expect(
    region.getByRole("heading", { name: /Nébula Étincelle/ }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", { name: /Ancienne Étincelle/ }),
  ).toHaveCount(0);
  await page.getByRole("slider").fill("10");
  await expect(region).toContainText(
    "Première apparition observée dans les données collectées : Inconnue",
  );
  await page.getByRole("slider").fill("60");
  await page.goto("/#page=conversations&conversation=DEMO_POST_ROOT");
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .click();
  await page.getByLabel("Token lié", { exact: true }).selectOption(id);
  await expect(
    page.getByRole("link", { name: "Voir le token lié", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Voir le token lié", exact: true })
    .first()
    .click();
  await expect(region).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.goto("/#page=sources");
  await page.getByLabel("Inclure dans les vues de sources").nth(2).uncheck();
  await page.goto("/#page=tokens");
  await expect(region.getByRole("status")).toContainText("Source X exclue");
  await expect(region).toContainText("Données insuffisantes");
  expect(external).toEqual([]);
});

test("graphique token : identité, pools, périodes manquantes, sources et marqueurs sans réseau", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#page=tokens");
  const row = page.getByRole("row").filter({ hasText: "Orbit Véhicule" });
  await row
    .getByRole("link", { name: "Ouvrir le graphique", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/tokens\/base\/0xDEMO/);
  const region = page.getByRole("region", {
    name: "Analyse et graphique du token",
    exact: true,
  });
  await expect(region).toBeVisible();
  await expect(region.getByRole("img", { name: /Bougies OHLC/ })).toBeVisible();
  await expect(region.locator("canvas").first()).toBeVisible();
  await expect(region).toContainText("ne constitue pas un conseil financier");
  await page.goto("/#/tokens/base/0xDEMO" + "0".repeat(34) + "42");
  await expect(region).toContainText("Nébula Étincelle");
  await expect(region).toContainText("18000 USD");
  await expect(region).toContainText("tranches sans données");
  const price = region
    .getByText("Dernière clôture connue", { exact: true })
    .locator("..");
  const firstPrice = await price.textContent();
  await region
    .getByLabel("Pool du graphique", { exact: true })
    .selectOption("0xDEMO" + "0".repeat(32) + "0802");
  await expect(price).not.toHaveText(firstPrice!);
  await expect(page).toHaveURL(/pool=/);
  await region
    .getByLabel("État du graphique démo", { exact: true })
    .selectOption("stale");
  await expect(region).toContainText("Données anciennes");
  await region
    .getByLabel("État du graphique démo", { exact: true })
    .selectOption("conflict");
  await expect(region).toContainText("Données incohérentes");
  await expect(region).toContainText("0.009999 USD");
  await region
    .getByLabel("État du graphique démo", { exact: true })
    .selectOption("empty");
  await expect(region).toContainText("Aucune donnée de prix");
  await expect(region.locator("canvas")).toHaveCount(0);
  await region
    .getByLabel("État du graphique démo", { exact: true })
    .selectOption("normal");
  await region
    .getByLabel("Granularité du graphique", { exact: true })
    .selectOption("1m");
  await region
    .getByLabel("Plage du graphique", { exact: true })
    .selectOption("7d");
  await region
    .getByRole("button", { name: /Charger les tranches précédentes/ })
    .click();
  await expect(region).toContainText("300 tranches affichées");
  await page.reload();
  await expect(
    region.getByLabel("Granularité du graphique", { exact: true }),
  ).toHaveValue("1m");
  await region
    .getByLabel("Plage du graphique", { exact: true })
    .selectOption("1h");
  const markers = region.getByRole("region", {
    name: "Marqueurs et changements",
    exact: true,
  });
  await expect(markers).toContainText("Mention exacte");
  await markers
    .getByRole("link", { name: "Ouvrir la publication", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/page=watch&post=DEMO_/);
  await expect(
    page
      .getByRole("region", { name: "Veille X locale", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await page.goto("/#/tokens/base/0xDEMO" + "0".repeat(34) + "42");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await region
    .getByLabel("État du graphique démo", { exact: true })
    .selectOption("unavailable");
  await expect(region).toContainText("Fournisseur fictif indisponible");
  await page.goto("/#/tokens/base/ORB");
  await expect(
    page.getByRole("region", { name: "Erreur de route token", exact: true }),
  ).toContainText("invalides");
  await page.goto("/#/tokens/base/0x" + "1".repeat(40));
  await expect(
    page.getByRole("region", { name: "Erreur de route token", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("risques : preuves, inconnues, erreurs, contradictions et absence de réseau", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#/tokens/base/0xDEMO" + "0".repeat(34) + "42");
  const risk = page.getByRole("region", {
    name: "Analyse des risques du token",
    exact: true,
  });
  await expect(risk).toBeVisible();
  await expect(risk).toContainText(
    "L'absence de signal ne signifie pas l'absence de risque.",
  );
  await expect(
    risk.getByRole("complementary", { name: "Activité sociale et légitimité" }),
  ).toContainText("promotion payée");
  const holder = risk.getByRole("article", { name: /Concentration/ });
  await expect(holder).toContainText("Signal détecté");
  await holder.getByText(/Preuve et limites/).click();
  await expect(holder).toContainText("Top 1 : 16 %");
  await expect(holder).toContainText("UTC");
  await expect(holder).toContainText("demo.memeradar.invalid/risks");
  await expect(
    risk.getByRole("article", { name: "Autorité de gel Solana", exact: true }),
  ).toContainText("Non applicable");
  const state = risk.getByLabel("État des contrôles de risque démo");
  await state.selectOption("conflict");
  await expect(holder).toContainText("Sources contradictoires");
  await state.selectOption("missing");
  await expect(holder).toContainText("Données insuffisantes");
  await state.selectOption("failed");
  await expect(
    risk.getByRole("article", {
      name: "Signal de honeypot ou de vente bloquée",
      exact: true,
    }),
  ).toContainText("Vérification échouée");
  await state.selectOption("stale");
  await expect(holder).toContainText("Observations anciennes");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.goto("/#page=sources");
  await page.getByLabel("Inclure dans les vues de sources").nth(3).uncheck();
  await page.goto("/#/tokens/base/0xDEMO" + "0".repeat(34) + "42");
  await expect(risk.getByRole("status")).toContainText(
    "Source d’analyse exclue",
  );
  await expect(holder).toContainText("Données insuffisantes");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("alertes V2 : résumé, plafond, preuve, faux positif et reprise sans réseau", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#page=alerts");
  const center = page.getByRole("region", {
      name: "Centre d’alertes V2",
      exact: true,
    }),
    form = center.getByRole("form", { name: "Configurer une alerte V2" });
  await form.getByLabel("Nom de l’alerte V2").fill("Résumé navigateur");
  await form
    .getByLabel("Termes (séparés par des virgules)")
    .fill("Nébula Mobile, #nebula");
  await form.getByLabel("Mode de livraison V2").selectOption("interval");
  await form.getByLabel("Maximum d’alertes par heure").fill("2");
  await form.getByLabel("Délai de récupération (secondes)").fill("0");
  await form
    .getByRole("button", { name: "Enregistrer l’alerte V2", exact: true })
    .click();
  await expect(center.getByRole("status")).toContainText("enregistrée");
  await center
    .getByRole("button", {
      name: "Avancer les alertes de 5 minutes",
      exact: true,
    })
    .click();
  const history = center.getByRole("region", {
      name: "Historique des alertes V2",
      exact: true,
    }),
    notifications = center.getByRole("region", {
      name: "Notifications V2 dans l’application",
      exact: true,
    });
  await expect(
    history
      .getByRole("article")
      .filter({ hasText: "Résumé navigateur" })
      .first(),
  ).toContainText("En attente du résumé");
  await history.getByLabel("Afficher les décisions supprimées V2").check();
  await expect(history).toContainText("Plafond horaire atteint");
  await center
    .getByRole("button", {
      name: "Avancer les alertes d’une heure",
      exact: true,
    })
    .click();
  const digest = notifications
    .getByRole("article")
    .filter({ hasText: "Résumé navigateur" });
  await expect(digest).toHaveCount(1);
  await expect(digest).toContainText("2 observation(s)");
  await digest.getByText("Voir les observations du résumé").click();
  await expect(digest).toContainText("Nébula Mobile");
  await expect(
    digest.getByRole("link", { name: "Voir la publication" }).first(),
  ).toBeVisible();
  await digest
    .getByRole("button", { name: "Marquer comme lue", exact: true })
    .click();
  const entry = history
    .getByRole("article")
    .filter({ hasText: "Résumé navigateur" })
    .first();
  await entry
    .getByRole("button", { name: "Signaler un faux positif", exact: true })
    .click();
  await expect(entry).toContainText("Faux positif signalé");
  await expect(history).toContainText("ne constitue pas un conseil financier");
  await page.reload();
  await expect(digest).toHaveCount(1);
  await expect(digest).toContainText("Lue");
  await expect(entry).toContainText("Faux positif signalé");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("alertes V2 : pause d’une personne et stockage corrompu préservé", async ({
  page,
}) => {
  await page.goto("/#page=people");
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("@demo_analyste_julie");
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await page.goto("/#page=alerts");
  const center = page.getByRole("region", {
      name: "Centre d’alertes V2",
      exact: true,
    }),
    form = center.getByRole("form", { name: "Configurer une alerte V2" });
  await form.getByLabel("Nom de l’alerte V2").fill("Julie en pause");
  await form.getByLabel("Type d’alerte V2").selectOption("person_post");
  await form
    .getByLabel("Personne suivie pour l’alerte")
    .selectOption({ index: 1 });
  await form.getByLabel("Termes (séparés par des virgules)").fill("");
  await form
    .getByRole("button", { name: "Enregistrer l’alerte V2", exact: true })
    .click();
  await center
    .getByRole("button", {
      name: "Avancer les alertes de 5 minutes",
      exact: true,
    })
    .click();
  const history = center.getByRole("region", {
    name: "Historique des alertes V2",
    exact: true,
  });
  await history.getByLabel("Afficher les décisions supprimées V2").check();
  await expect(
    history.getByRole("article").filter({ hasText: "Julie en pause" }),
  ).toContainText([
    "Personne en pause",
    "Personne en pause",
    "Personne en pause",
  ]);
  await page.evaluate(() =>
    localStorage.setItem(
      "memeradar-demo-alerts-phase10-v1",
      "{invalid-preserved",
    ),
  );
  await page.reload();
  await expect(center).toContainText("Stockage des alertes illisible");
  await expect(
    center.getByRole("button", {
      name: "Avancer les alertes de 5 minutes",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("memeradar-demo-alerts-phase10-v1"),
    ),
  ).toBe("{invalid-preserved");
});

test("Sources et API : confirmation unique, plafonds, quotas et persistance hors ligne", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/#page=sources");
  const center = page.getByRole("region", {
    name: "Sources et API V2",
    exact: true,
  });
  const x = center.getByRole("region", { name: "Fournisseur X", exact: true });
  await expect(center).toContainText("Aucun secret à saisir");
  await expect(x.getByRole("table")).toContainText("Non testée");
  const state = () =>
    page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("memeradar-demo-sources-phase11-v1") || "null",
      ),
    );
  await x
    .getByRole("button", { name: "Préparer le test X", exact: true })
    .click();
  await expect(
    x.getByRole("region", { name: "Devis du test X", exact: true }),
  ).toContainText("une requête");
  expect(await state()).toBeNull();
  await x
    .getByRole("button", { name: "Confirmer le test démo X", exact: true })
    .click();
  expect((await state()).entries.x.tests).toBe(1);
  expect((await state()).entries.x.cost).toBe("150");
  await expect(
    x.getByRole("button", { name: "Confirmer le test démo X", exact: true }),
  ).toHaveCount(0);
  const daily = x.getByLabel("Plafond quotidien X (USD)");
  await daily.fill("0.01");
  await x
    .getByRole("button", { name: "Enregistrer les réglages X", exact: true })
    .click();
  expect((await state()).entries.x.settings.budget.daily).toBe("1000000");
  await daily.fill("2.000001");
  await x
    .getByRole("button", { name: "Enregistrer les réglages X", exact: true })
    .click();
  expect((await state()).entries.x.settings.budget.daily).toBe("2000001");
  await page.reload();
  await expect(daily).toHaveValue("2.000001");
  await center.getByLabel("État des API démo").selectOption("quota");
  await expect(x).toContainText("RATE_LIMITED");
  await expect(x).toContainText("Quota : 0 / 300");
  await x
    .getByRole("button", { name: "Préparer le test X", exact: true })
    .click();
  await expect(
    x.getByRole("region", { name: "Devis du test X", exact: true }),
  ).toHaveCount(0);
  await center
    .getByRole("button", {
      name: "Avancer les diagnostics de deux minutes",
      exact: true,
    })
    .click();
  await x
    .getByRole("button", { name: "Préparer le test X", exact: true })
    .click();
  await expect(
    x.getByRole("region", { name: "Devis du test X", exact: true }),
  ).toHaveCount(0);
  await center.getByLabel("État des API démo").selectOption("normal");
  await x.getByLabel("Activer X", { exact: true }).uncheck();
  await x
    .getByRole("button", { name: "Enregistrer les réglages X", exact: true })
    .click();
  await page.reload();
  await expect(x.getByLabel("Activer X", { exact: true })).not.toBeChecked();
  await x
    .getByRole("button", { name: "Préparer le test X", exact: true })
    .click();
  await expect(
    x.getByRole("region", { name: "Devis du test X", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("Sources et API : stockage illisible conservé sans écrasement", async ({
  page,
}) => {
  await page.goto("/#page=sources");
  await page.evaluate(() =>
    localStorage.setItem(
      "memeradar-demo-sources-phase11-v1",
      "{invalid-preserved",
    ),
  );
  await page.reload();
  const center = page.getByRole("region", {
    name: "Sources et API V2",
    exact: true,
  });
  await expect(center).toContainText("Stockage Sources et API illisible");
  await expect(
    center.getByRole("button", { name: "Préparer le test X", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("memeradar-demo-sources-phase11-v1"),
    ),
  ).toBe("{invalid-preserved");
});

test("navigation V2 : neuf pages, filtres URL, retour arrière, clavier et écran mobile", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/#page=watch");
  const nav = page.getByRole("navigation", { name: "Navigation principale" }),
    watch = page.getByRole("region", { name: "Veille X locale", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(9);
  await expect(
    nav.getByRole("link", { name: "Veille X", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await watch.getByLabel("Hashtag exact").fill("NebulaProduit");
  await expect(page).toHaveURL(/tag=NebulaProduit/);
  const count = await watch.getByRole("article").count();
  expect(count).toBeGreaterThan(0);
  await watch.getByLabel("Mot-clé de la veille").fill("INEXISTANT");
  await expect(
    watch.getByRole("heading", {
      name: "Aucune publication correspondante",
      exact: true,
    }),
  ).toBeVisible();
  await page.goBack();
  await expect(watch.getByLabel("Mot-clé de la veille")).toHaveValue("");
  await expect(watch.getByRole("article")).toHaveCount(count);
  await page.reload();
  await expect(watch.getByLabel("Hashtag exact")).toHaveValue("NebulaProduit");
  await nav.getByRole("link", { name: "Événements", exact: true }).click();
  await expect(page).toHaveURL(/tag=NebulaProduit/);
  await expect(
    page.getByRole("heading", { name: "Événements", exact: true, level: 1 }),
  ).toBeFocused();
  await nav.getByRole("link", { name: "Veille X", exact: true }).click();
  await expect(watch.getByLabel("Hashtag exact")).toHaveValue("NebulaProduit");
  await watch
    .getByRole("button", { name: "Effacer les filtres de veille", exact: true })
    .click();
  await watch.getByLabel("Mot-clé de la veille").fill("Adresse fictive");
  const card = watch
    .getByRole("article")
    .filter({
      has: page.getByRole("link", { name: "Ouvrir le graphique", exact: true }),
    })
    .first();
  await card
    .getByRole("link", { name: "Ouvrir le graphique", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", {
      name: "Analyse et graphique du token",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Tokens détectés", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goto("/#page=watch");
  await page
    .getByRole("link", { name: "Aller au contenu principal", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    nav.getByRole("link", { name: "Veille X", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Changer de thème", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.setViewportSize({ width: 1024, height: 600 });
  await nav.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true, level: 1 }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Tableau de bord", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tableau de bord",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("veille X : états honnêtes, données suivies et résumés persistants sans réseau", async ({
  page,
}) => {
  await page.goto("/#page=people");
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("@demo_analyste_julie");
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Réactiver demo_analyste_julie", exact: true })
    .click();
  await page.goto("/#page=watch");
  const watch = page.getByRole("region", {
    name: "Veille X locale",
    exact: true,
  });
  await watch
    .getByRole("combobox", { name: "Personne suivie", exact: true })
    .selectOption({ index: 1 });
  await expect(watch.getByRole("article").first()).toContainText("Julie");
  await expect(
    watch
      .getByRole("button", { name: "Ouvrir sur X (démo)", exact: true })
      .first(),
  ).toBeDisabled();
  const state = watch.getByLabel("État de la veille démo");
  for (const [value, text] of [
    ["loading", "Chargement simulé"],
    ["error", "Erreur simulée"],
    ["unconfigured", "Accès X non configuré"],
    ["quota", "Quota X fictif épuisé"],
  ]) {
    await state.selectOption(value);
    await expect(watch).toContainText(text);
    await expect(watch.getByRole("article")).toHaveCount(0);
  }
  for (const [value, text] of [
    ["stale", "Données anciennes"],
    ["partial", "Données partielles"],
  ]) {
    await state.selectOption(value);
    await expect(watch).toContainText(text);
  }
  await state.selectOption("empty");
  await expect(watch).toContainText("Aucune publication correspondante");
  await page.goto("/#page=dashboard");
  await expect(
    page.getByRole("region", { name: "Synthèse de la veille X", exact: true }),
  ).toContainText("Julie");
  await expect(
    page.getByRole("region", { name: "Synthèse de la veille X", exact: true }),
  ).toContainText("Engagement quotidien");
  await page.goto("/#page=people&peopleQuery=INEXISTANT");
  await expect(page.getByLabel("Filtrer les personnes")).toHaveValue(
    "INEXISTANT",
  );
  await page.reload();
  await expect(page.getByLabel("Filtrer les personnes")).toHaveValue(
    "INEXISTANT",
  );
});

test("navigation V2 : lien invalide et échec de vue conservent les autres pages", async ({
  page,
}) => {
  await page.goto("/#page=inconnue");
  await expect(
    page.getByRole("heading", { name: "Lien invalide", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Revenir au tableau de bord", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Tableau de bord",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  const lazyModule = /\/src\/TokenAnalysis\.tsx(?:\?.*)?$/;
  let failedLoads = 0;
  await page.route(lazyModule, (route) => {
    failedLoads++;
    return route.abort();
  });
  await page.goto("/#/tokens/base/0xDEMO" + "0".repeat(34) + "42");
  await expect(
    page.getByRole("heading", {
      name: "Cette vue n’a pas pu être affichée",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText(
    "ne constitue pas un conseil financier",
  );
  expect(failedLoads).toBeGreaterThan(0);
  await page.unroute(lazyModule);
  await page
    .getByRole("button", { name: "Recharger la vue", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Analyse et graphique du token",
      exact: true,
    }),
  ).toBeVisible();
});

test("navigation démo : les références externes affichent un motif sans ouvrir le réseau", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/#page=sources");
  await page
    .getByRole("link", { name: "Documentation X", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Les liens externes sont désactivés" }),
  ).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  expect(external).toEqual([]);
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Veille X", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Veille X locale", exact: true }),
  ).toBeVisible();
});

test("démo unifiée : personne, veille, conversation, adresse, graphique, risques, alerte et quota", async ({
  page,
}) => {
  const external: string[] = [],
    errors: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#page=people");
  await page
    .getByLabel("Identifiant X ou URL de profil")
    .fill("@demo_analyste_julie");
  await page
    .getByRole("button", { name: "Vérifier le compte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer l’ajout", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Réactiver demo_analyste_julie", exact: true })
    .click();
  await page.goto("/#page=watch");
  const watch = page.getByRole("region", {
    name: "Veille X locale",
    exact: true,
  });
  await watch
    .getByRole("combobox", { name: "Personne suivie", exact: true })
    .selectOption({ index: 1 });
  const root = watch
    .getByRole("article")
    .filter({ hasText: "Une annonce entièrement fictive sur Nébula Mobile." });
  await root
    .getByRole("link", { name: "Voir la conversation fictive", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Couverture de la conversation",
      exact: true,
    }),
  ).toContainText("35 réponses récupérées sur environ 120");
  await page
    .getByLabel("Réponses contenant une adresse candidate", { exact: true })
    .check();
  await page
    .getByRole("region", { name: "Réponses récupérées", exact: true })
    .getByRole("link", { name: "Ouvrir le graphique", exact: true })
    .first()
    .click();
  const analysis = page.getByRole("region", {
    name: "Analyse et graphique du token",
    exact: true,
  });
  await expect(analysis).toBeVisible();
  await expect(analysis.locator("canvas").first()).toBeVisible();
  await expect(
    analysis.getByRole("region", {
      name: "Analyse des risques du token",
      exact: true,
    }),
  ).toContainText("non une certification de sécurité");
  await page.goto("/#page=alerts");
  const center = page.getByRole("region", {
      name: "Centre d’alertes V2",
      exact: true,
    }),
    form = center.getByRole("form", { name: "Configurer une alerte V2" });
  await form.getByLabel("Nom de l’alerte V2").fill("Parcours unifié");
  await form
    .getByLabel("Termes (séparés par des virgules)")
    .fill("Nébula Mobile");
  await form
    .getByRole("button", { name: "Enregistrer l’alerte V2", exact: true })
    .click();
  await center
    .getByRole("button", {
      name: "Avancer les alertes de 5 minutes",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("slider", { name: "Temps simulé en minutes" }),
  ).toHaveValue("65");
  const history = center.getByRole("region", {
    name: "Historique des alertes V2",
    exact: true,
  });
  const entry = history
    .getByRole("article")
    .filter({ hasText: "Parcours unifié" })
    .first();
  await expect(entry).toContainText("Nébula");
  await entry
    .getByRole("link", { name: "Voir la publication", exact: true })
    .click();
  await expect(page).toHaveURL(/page=watch&post=DEMO_EVENT_AFTER_/);
  await expect(watch.getByRole("article")).toHaveCount(1);
  await expect(watch.getByRole("article")).toContainText(
    "Réaction au produit inventé",
  );
  await page.goto("/#page=tokens");
  await expect(
    page.getByRole("region", {
      name: "Preuves sociales des tokens",
      exact: true,
    }),
  ).toContainText("Écho Boréal");
  await page.goto("/#page=sources");
  const sources = page.getByRole("region", {
    name: "Sources et API V2",
    exact: true,
  });
  await sources.getByLabel("État des API démo").selectOption("quota");
  await expect(
    sources.getByRole("region", { name: "Fournisseur X", exact: true }),
  ).toContainText("RATE_LIMITED");
  await page.goto("/#page=watch");
  await expect(watch).toContainText("Quota X fictif épuisé");
  await expect(watch.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "État global de la démo", exact: true }),
  ).toHaveValue("quota");
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("démo unifiée : horloge conservée et observations futures masquées après retour en arrière", async ({
  page,
}) => {
  await page.goto("/#page=watch");
  const slider = page.getByRole("slider", { name: "Temps simulé en minutes" });
  await slider.fill("10");
  await page.reload();
  await expect(slider).toHaveValue("10");
  await page.goto("/#page=conversations");
  await expect(slider).toHaveValue("10");
  await page
    .getByRole("button", { name: "Préparer le chargement", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmer le chargement démo", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Réponses récupérées", exact: true })
      .getByRole("article"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Couverture de la conversation",
      exact: true,
    }),
  ).toContainText("Couverture observée : inconnue");
  await page.goto("/#page=sources");
  await page
    .getByRole("button", {
      name: "Avancer les diagnostics de deux minutes",
      exact: true,
    })
    .click();
  await expect(slider).toHaveValue("12");
  await page.goto("/#page=watch");
  await expect(slider).toHaveValue("12");
  await expect(
    page.getByRole("region", { name: "Veille X locale", exact: true }),
  ).not.toContainText("Écho Boréal");
  const watch = page.getByRole("region", {
    name: "Veille X locale",
    exact: true,
  });
  await watch.getByLabel("État de la veille démo").selectOption("quota");
  await page
    .getByRole("combobox", { name: "État global de la démo", exact: true })
    .selectOption("normal");
  await expect(watch.getByLabel("État de la veille démo")).toHaveValue(
    "normal",
  );
  expect(await watch.getByRole("article").count()).toBeGreaterThan(0);
  await page
    .getByRole("combobox", { name: "État global de la démo", exact: true })
    .selectOption("disconnect");
  await expect(
    page.getByRole("region", { name: "Veille X locale", exact: true }),
  ).toContainText("Flux déconnecté simulé");
  await slider.fill("0");
  await expect(
    page.getByRole("combobox", { name: "État global de la démo", exact: true }),
  ).toHaveValue("normal");
  await page.goto("/#page=people");
  await expect(slider).toHaveValue("0");
  await page.reload();
  await expect(slider).toHaveValue("0");
});

test("démo unifiée : session corrompue conservée, commandes verrouillées", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "memeradar-demo-session-phase13-v1",
      "{invalid-preserved",
    ),
  );
  await page.reload();
  await expect(
    page.getByRole("region", {
      name: "Scénario partagé de démonstration",
      exact: true,
    }),
  ).toContainText("Session de démonstration illisible");
  await expect(
    page.getByRole("slider", { name: "Temps simulé en minutes" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "État global de la démo", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("memeradar-demo-session-phase13-v1"),
    ),
  ).toBe("{invalid-preserved");
});

test("boutons locaux lisibles avec les thèmes sombre et clair", async ({
  page,
}) => {
  // UI-only bridge: no provider access or real credentials in this regression test.
  await page.addInitScript(() => {
    Object.defineProperty(window, "memeradar", {
      value: {
        local: {
          command: async () => ({
            state: {
              stopped: true,
              busy: false,
              hasKey: false,
              secureStorage: true,
              settings: null,
              verifiedAt: null,
              lastCollection: null,
              nextCollection: null,
              error: null,
              partial: false,
              people: [],
              posts: [],
              usage: {
                dayReservedUsd: "0.000000",
                monthReservedUsd: "0.000000",
                requestsDay: 0,
                warning: false,
              },
            },
          }),
        },
      },
    });
  });
  await page.goto("/");
  const sources = page.getByRole("button", {
    name: "Sources et accès",
    exact: true,
  });
  await expect(sources).toBeVisible();
  const checkContrast = async (selector: string) => {
    const ratios = await page.locator(selector).evaluateAll((buttons) => {
      const luminance = (color: string) => {
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            const n = v / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          });
        return (
          channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        );
      };
      return buttons.map((button) => {
        const style = getComputedStyle(button);
        const fg = luminance(style.color),
          bg = luminance(style.backgroundColor);
        return {
          text: button.textContent,
          ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
          opacity: style.opacity,
        };
      });
    });
    expect(ratios.length).toBeGreaterThan(0);
    for (const result of ratios) {
      expect(result.ratio, result.text ?? "button").toBeGreaterThanOrEqual(4.5);
      expect(result.opacity).toBe("1");
    }
  };
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    await checkContrast(".local-app button");
    await sources.click();
    await expect(sources).toHaveAttribute("aria-pressed", "true");
    await sources.hover();
    await checkContrast(".local-app button");
    await sources.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(sources).toBeFocused();
    await expect(sources).toHaveCSS("outline-style", "solid");
  }
  await page
    .getByRole("button", { name: "Ouvrir la démonstration", exact: true })
    .click();
  const back = page.getByRole("button", {
    name: "Utiliser sur mon PC",
    exact: true,
  });
  await expect(back).toBeVisible();
  for (const theme of ["dark", "light"]) {
    await page.evaluate(
      (value) => document.documentElement.setAttribute("data-theme", value),
      theme,
    );
    await checkContrast(".local-mode-button");
  }
  await back.click();
  await expect(sources).toBeVisible();
});
