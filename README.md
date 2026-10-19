# MemeRadar

Application de veille et d'analyse explicable, en français. Édition de bureau V2 **démo hors ligne** pour Windows 10/11 x64 : neuf pages, scénario Nébula de 63 publications et quatre tokens fictifs, graphiques, indicateurs et alertes. Aucune donnée réelle ni recommandation financière.

## Installer sur Windows

[Télécharger MemeRadar 0.2.0 pour Windows (ZIP de l’installateur)](https://github.com/wnathan469-debug/meme/releases/download/v0.2.0/MemeRadar-0.2.0-Windows-x64-installer.zip)

Dans Chrome, télécharger le ZIP, choisir **Extraire tout** dans l’Explorateur Windows, puis ouvrir `MemeRadar-0.2.0-Windows-x64.exe`. Suivre l’assistant et lancer MemeRadar depuis le bureau ou le menu Démarrer. Aucun Node.js, Docker, compte ou clé API nécessaire pour l’utiliser.

[Page de téléchargement et empreintes](https://github.com/wnathan469-debug/meme/releases/tag/v0.2.0) · [Vérifications du téléchargement](docs/DOWNLOAD_VERIFICATION.md)

Consultez [le guide Windows](docs/DESKTOP.md) pour les étapes, le stockage local et les limites de signature/validation. Le mode réel et les connecteurs du cahier des charges ne sont pas encore livrés : voir [LIMITATIONS.md](docs/LIMITATIONS.md).

## Fonctionnalités de la démo

- Tableau de bord, veille, personnes, conversations, événements, tokens, alertes, sources et paramètres.
- Fiches avec provenance, risque d'usurpation, chronologie et cinq indicateurs expliqués.
- Rejeu temporel accéléré, règles d'attention modifiables et faux positifs.
- Recherche, filtres dans l'URL interne, mots-clés suivis, thème clair/sombre et fuseau horaire.
- Préférences conservées sur le PC ; pas de portefeuille, transaction, télémétrie ou appel fournisseur.

## Passage aux données réelles

Le nouveau programme suit douze étapes, avec validation à chaque étape. [Inventaire et risques — étape 1](docs/REAL_DATA_STEP1_AUDIT.md) : inventaire validé. [Fournisseurs, budget et pilote — étape 2](docs/REAL_DATA_STEP2_PROPOSAL.md) : proposition à valider, sans achat ni collecte réelle activée. Le téléchargement 0.2.0 reste une démonstration ; aucun serveur connecté ou nouveau paquet réel n’est livré par cet inventaire.

[Serveur sécurisé — étape 3](docs/REAL_DATA_STEP3_SERVER.md) : API et contrôles testés localement, sans hébergement ni collecte activée. La reprise technique ne valide pas le budget proposé. Construction serveur séparée : npm run api:build ; démarrage avec configuration serveur sécurisée : npm run api:start.

[Préparation de l’hébergement — étape 4](docs/REAL_DATA_STEP4_HOSTING.md) : conteneurs HTTPS, base/Redis privés, sauvegarde chiffrée et recette de restauration/panne. Hébergeur, devis et accès de production encore à fournir ; aucune dépense ni collecte réelle activée.

## Développer

Node 24 et npm requis. Depuis la racine :

```bash
npm ci
npm run dev          # Interface dans le navigateur local pour le développement
npm run build       # Types stricts et compilation de production
npm start           # Application Electron
npm test -- --coverage
npm run test:e2e     # Après npx playwright install chromium
npm run format:check
npm run dist:win    # Installateur Windows dans release/
```

Le banc cloud utilise `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. Le test du shell se lance avec `npm run test:desktop` sur une machine disposant d'un affichage et du runtime Electron local. Sur Linux cloud, un affichage virtuel est requis. La construction NSIS depuis Linux utilise un adaptateur limité au lecteur de désinstalleur natif inclus dans electron-builder ; voir DESKTOP.md. Sur Windows, la construction suit le chemin natif du builder.

## Base serveur — référence V1 et migrations V2

Le schéma PostgreSQL et les migrations du futur backend sont livrés séparément dans `packages/db/`. [La procédure V2](docs/V2_PHASE2.md) utilise le nouveau lanceur `npm run db:migrate` et conserve la référence V1. L'application de bureau démo n'a pas besoin de cette base.

Avec Docker :

```bash
npm run test:db
```

Le banc crée une base jetable sans réseau ni port publié, vérifie l'intégrité et le rollback, puis la supprime. Voir [DATA_MODEL.md](docs/DATA_MODEL.md).

## Structure

```text
apps/desktop/       Shell Electron, IPC et préférences locales
apps/web/           Interface React/Vite en français
packages/core/      Types, fixtures et règles pédagogiques de démo
packages/db/        Schéma PostgreSQL, migrations et banc de test
assets/             Icônes locales
tests/              Tests métier, sécurité et parcours
release/            Paquets générés, non versionnés
```

## Évolution V2

[Audit V2 et plan de modification](docs/AUDIT_V2.md) : phase 0 validée. [Phase 1 V2](docs/V2_PHASE1.md) : client X privé, fournisseur démo, contrôles de sécurité, quotas et budgets implémentés et testés. [Phase 2 V2](docs/V2_PHASE2.md) : migrations additives, 55 tables applicatives, ORM de requêtes, budgets et journal durables, conversion des préférences préparée. [Phase 3 V2](docs/V2_PHASE3.md) : collecteurs privés, reprise, déduplication, recherche locale/API et filtres testés ; branchement des nouvelles vues à venir. [Phase 4 V2](docs/V2_PHASE4.md) : personnes suivies, catégories, notes privées, confirmation et collecte par ID stable ; première page de démonstration locale dans le code. [Phase 5 V2](docs/V2_PHASE5.md) : conversations avec devis et reprise, arbre/liste, citations séparées, couverture privée et minimisation des commentateurs ; page démo 35/120 (29,17 %). [Phase 6 V2](docs/V2_PHASE6.md) : événements enrichis, publications liées, attention avant/après avec couverture documentée, chronologie et règles d’alerte configurables en pause. [Phase 7 V2](docs/V2_PHASE7.md) : extraction chaîne/adresse et URL autorisées, mentions privées, première apparition observée, preuves sociales et revue officielle explicite ; nouveaux parcours démo sans réseau. [Phase 8 V2](docs/V2_PHASE8.md) : route chaîne/adresse, analyse et bougies financières locales, pools, volumes, liquidité/capitalisation fictive, transactions et marqueurs ; adaptateur/cache de marché privé testé sur fixtures. [Phase 9 V2](docs/V2_PHASE9.md) : 17 contrôles de risque, preuves datées, états inconnus/échec/contradiction, adaptateurs de lecture et historique conservé ; interface toujours en démo. [Phase 10 V2](docs/V2_PHASE10.md) : moteur privé, 12 types d’alertes, résumés, limites et centre démo persistant, sans livraison externe. [Phase 11 V2](docs/V2_PHASE11.md) : page Sources et API démo, diagnostics nettoyés, quotas, plafonds durables et tests de connexion à confirmation unique ; aucun appel fournisseur réel. [Phase 12 V2](docs/V2_PHASE12.md) : neuf pages, veille locale, filtres URL, synthèse des personnes actives et navigation clavier/mobile ; interface toujours hors ligne, raccordement serveur non livré. [Phase 13 V2](docs/V2_PHASE13.md) : scénario Nébula de 63 publications et quatre tokens, horloge persistante partagée, fournisseur X simulé et parcours complet hors ligne. [Configuration et limites fournisseur](docs/PROVIDERS.md). [Phase 14 V2](docs/V2_PHASE14.md) : validation et distribution Windows 0.2.0 ; le branchement complet de l’interface au serveur et la collecte live ne sont pas encore livrés.

`npm run x:diagnose` et `npm run x:collect` sans argument fonctionnent hors ligne sans clé. `npm run test:redis` lance un Redis Docker éphémère pour les tests partagés ; `npm run test:db:v2` vérifie migrations, PostgreSQL et restauration en conteneurs jetables ; ces outils concernent le développement du serveur, pas l’installation Windows.

## Documentation et avancement

Pour le cahier des charges V1 : phases 1 et 2 validées, phase 3 réalisée et testée. La demande d'une application Windows a ensuite conduit à une édition de bureau démo ; les autres phases serveur/live restent ouvertes.

- [Cadrage](docs/CADRAGE.md) · [Architecture serveur](docs/ARCHITECTURE.md) · [Décisions](docs/DECISIONS.md)
- [Guide de bureau](docs/DESKTOP.md) · [Indicateurs](docs/INDICATORS.md) · [Validation](docs/VALIDATION.md)
- [Sécurité](docs/SECURITY.md) · [Limites](docs/LIMITATIONS.md) · [Exploitation](docs/RUNBOOK.md)
- [Cahier des charges original](docs/SPECIFICATION.md)

Cette analyse est automatisée, peut être incomplète et ne constitue pas un conseil financier. Les memecoins sont des actifs très spéculatifs ; il est possible de perdre la totalité des sommes investies.
