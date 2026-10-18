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
  await expect(page).toHaveURL(/conversation=DEMO_POST_ROOT/);
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
