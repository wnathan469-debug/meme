# MemeRadar V2 — Phase 0 : audit et plan d'évolution

Statut : audit réalisé, plan proposé à valider avant le code V2. Référence : [SPECIFICATION_V2.md](SPECIFICATION_V2.md), sections 1 et 22. Code examiné : commit `14a32554fc2ae6f5123850c7f5e5c59a9de791c3` ; application publiée : 0.1.0. Date : 17 octobre 2026, America/Toronto.

## 1. Conclusion et périmètre réel

L'application existante est un logiciel Electron Windows autonome de démonstration. Elle est fonctionnelle dans ce périmètre. Les sources, risques et données de marché sont fictifs ; les 33 tables PostgreSQL sont livrées et testées séparément, sans être utilisées par cette application. Il n'existe pas encore de backend REST, de worker, de Redis applicatif ou de connecteur réseau.

La V2 doit donc conserver le produit de bureau, ses données locales et sa distribution, puis ajouter les capacités sociales et graphiques. Il ne suffit pas d'ajouter trois entrées de menu pour obtenir un accès réel à X. Les futures capacités live restent conditionnées à des fournisseurs, à leurs droits d'accès et à un backend sécurisé.

L'objectif utilisateur reste une installation Windows sans outils de développement. PostgreSQL, Redis et les outils de compilation concernent l'environnement serveur/de développement, pas des installations à demander à l'utilisateur Windows. Aucun abonnement ou hébergement payant ne sera activé implicitement.

## 2. Inventaire de l'existant

« Fonctionnel » signifie fonctionnel dans le périmètre précisé, sans impliquer une capacité live.

| Module / fichiers | Rôle | État | Qualité et limites | Tests constatés |
|---|---|---|---|---|
| apps/desktop/main.cjs, preload.cjs | Shell, protocole local, IPC, presse-papiers, persistance | Fonctionnel, démo | Isolation configurée, refus réseau ; logique concentrée dans un fichier ; aucune API live | Banc Electron réussi |
| apps/desktop/preferences.cjs | Validation des préférences côté processus principal | Fonctionnel | Zod, taille de fichier limitée, écritures sérialisées ; schéma dupliqué dans le renderer | Validation IPC et préférences |
| apps/web/src/main.tsx | Six vues, routes hash, modales, rejeu et filtres | Fonctionnel, démo | 1 563 lignes : composants, données et état à séparer progressivement | 3 parcours Playwright |
| apps/web/src/style.css | Thèmes, adaptations écran, avertissement fixe | Fonctionnel | 1 476 lignes ; pas d'audit WCAG complet | Petit écran et thèmes vérifiés dans les parcours |
| apps/web/src/state.ts | Préférences version 1, stockage navigateur ou IPC | Fonctionnel | Préserve les fichiers invalides ; pas de stockage des collections sociales | Tests de validation et persistance |
| packages/core/domain.ts | Types, association, cinq indicateurs, règle d'attention | Fonctionnel, démo | Fonctions pures et versions ; types DEMO uniquement, preuves pédagogiques | Domaine couvert à 100 % des lignes, 97,82 % des branches |
| packages/core/demo.ts | Trois scénarios, huit tokens, publications synthétiques | Fonctionnel, démo | Pas d'identifiants X ni de conversations ; données prédéfinies | Fixtures et origine contrôlées |
| packages/db/migrations/0001_initial.*.sql | Schéma PostgreSQL serveur | Fonctionnel, indépendant | 33 tables applicatives + registre ; contraintes d'origine et provenance ; aucun ORM branché | 51 assertions, rollback/reprise/concurrence |
| packages/db/migrate.sql, rollback.sql | Application initiale et garde de destruction | Fonctionnel pour 0001 | Ne parcourt pas encore une suite de migrations ; rollback actuel détruit tout le schéma | Réapplication et refus sans confirmation vérifiés |
| Client HTTP fournisseurs | Réseau, retries, quotas, SSRF | Absent | externalRequest() refuse toujours le réseau ; ce n'est pas un transport résilient | Test de refus, pas de client live |
| Connecteurs X / actualité / DEX / RPC | Collecte de données réelles | Absents | Aucune recherche X ni accès on-chain | Aucun test live annoncé |
| Marché / risques | Métriques et résultats affichés | Partiel, simulé | Valeurs datées, contrôles prédéfinis ; pas de calcul de concentration ou simulation réseau | Affichage et cas manquants testés |
| Graphiques | Courbe d'attention SVG | Partiel | Pas de bougies, pools, volumes OHLCV ou marqueurs interactifs ; séries sans trous | Affichage dans les parcours, pas de tests OHLCV |
| Alertes | Seuil, réarmement, cooldown, faux positifs | Partiel, simulé | Une règle ; trois alertes pédagogiques ; pas de moteur durable, résumé, plafond horaire ou heures silencieuses | Fonctions de rejeu et parcours |
| Personnes / conversations | Suivi de comptes et fils de réponses | Absents | La liste de mots-clés actuelle ne remplace pas ces fonctions | Aucun |
| API / authentification / workers | Serveur live, accès administrateur et planification | Absents | Accès actuel par session Windows seulement ; tables users/sessions non utilisées | Aucun test serveur |
| Distribution Windows | NSIS français, ZIP, SHA-256 et GitHub Releases | Fonctionnel | Construction Windows et téléchargement HTTPS vérifiés ; paquet non signé ; pas de mise à jour automatique | Workflow Windows, ZIP et empreintes |
| Documentation | Cadrage, architecture cible, données, sécurité et limites | Partielle pour V2 | Architecture serveur cible différente du code réellement livré ; PROVIDERS.md et .env.example absents | Cohérence documentaire à compléter |

### Pile et structure observées

Node 24, npm/package-lock.json, TypeScript 5.9.3 strict pour le frontend et le domaine, React/React DOM 19.3.1, Vite 8.3.4, Electron 44.9.0, electron-builder 26.15.3, Zod 4.3.6, Vitest 4.1.12, Playwright 1.61.1, Prettier 3.9.10. Les fichiers CommonJS du shell ne sont pas couverts par le typage TypeScript actuel.

Le dépôt contient apps/desktop, apps/web, packages/core, packages/db, assets, scripts, tests et docs. Les dossiers d'architecture apps/api, apps/worker et packages/connectors/chain/shared/alerts/analysis n'existent pas encore. Le projet n'est pas encore un monorepo npm workspaces. Les graphiques actuels sont du SVG React sans bibliothèque financière. Pas de Tailwind, TanStack Query, Fastify ou Drizzle installés.

## 3. État de validation et dépendances

Contrôles réexécutés pendant cet audit, sans modification du code applicatif :

| Contrôle | Résultat |
|---|---|
| npm run build | Réussi : TypeScript strict et Vite |
| npm test -- --coverage | 30 tests réussis, 2 fichiers |
| Couverture mesurée | domain.ts : lignes/instructions/fonctions 100 %, branches 97,82 %. Ne mesure pas les futurs modules ni toute l'interface |
| npm run format:check | Réussi ; formatage, pas un linter de sécurité |
| CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e | 3 parcours réussis |
| DISPLAY=:101 npm run test:desktop | Réussi : IPC, état après redémarrage, copie, deep link et refus réseau |
| npm run test:db | 51 contrôles réussis avant et après rollback ; atomicité et concurrence vérifiées |
| npm audit --omit=dev | 0 vulnérabilité signalée |
| npm audit complet | 8 signalements modérés, 0 élevé/critique, dans la chaîne de construction |

Le banc Electron Linux utilise --no-sandbox uniquement pour son processus de test en conteneur. Il contrôle les options d'isolation et les restrictions du renderer ; il ne certifie pas le sandbox système Windows. Aucun appel réel à X ou fournisseur de marché n'a été effectué. Aucun essai d'installation sur le PC de l'utilisateur n'est annoncé.

Les huit signalements concernent @electron/get, app-builder-lib, dmg-builder, electron-builder, electron-builder-squirrel-windows, global-agent, roarr et sprintf-js. Ils ne sont pas inclus dans les dépendances runtime du paquet. Leur remédiation doit être étudiée avant la prochaine distribution, sans npm audit fix --force ni rétrogradation aveugle.

Des versions plus récentes sont publiées pour Playwright, TypeScript, Vitest/coverage, Zod et plusieurs paquets de types/plugin React. Cela ne prouve pas une faille ou une fin de support. Conserver Node 24 et son major de types ; mettre à jour par lots compatibles et vérifier les tests, plutôt que passer automatiquement à TypeScript 7, Vitest 5 ou aux types Node 26.

## 4. Conservation, adaptations et créations

### Conservé

- Electron, identité appId local.memeradar.desktop, installation par utilisateur et raccourcis.
- React/Vite, styles, thèmes, fuseaux, avertissement permanent et explications d'indicateurs.
- Recherche et filtres existants, modales et liens internes existants comme points d'entrée compatibles.
- Règles d'association démo et principe : un nom ou symbole n'établit pas une preuve officielle.
- Les trois scénarios V1 et leurs tests, sous réserve de l'arbitrage de la section 11.
- Préférences V1 et faux positifs enregistrés, schéma SQL initial immuable et distribution 0.1.0 publiée.

### Adapté progressivement

- Extraire pages/composants/hooks de main.tsx, avec mêmes comportements et mêmes routes historiques ; ne pas réécrire l'application.
- Étendre les types avec origine, provenance, sujets sociaux, capacités et données manquantes ; séparer calculs génériques et adaptateurs DEMO/REAL.
- Conserver la courbe d'attention ; créer un composant financier distinct pour OHLCV et marqueurs.
- Étendre le routeur hash pour exposer /tokens/{chaîne}/{adresse} à l'intérieur de l'application, avec résolution typée par couple chaîne/adresse. Garder la lecture des anciens liens token=id comme compatibilité.
- Étendre alertes, état local, sources et indicateurs avec preuves sociales, sans qualifier une mention de soutien.
- Prévoir des IPC précis et validés ; ne jamais exposer fetch(url), shell ou jeton X au renderer.
- Faire évoluer le lanceur de migrations au-delà de 0001, sans réécrire la migration initiale.
- Ajouter un numéro de version ultérieur lors de la livraison V2 ; ne pas remplacer les fichiers de v0.1.0.

### Créé

Contrats XProvider, client X serveur, transport sécurisé, registre de capacités/quotas/budgets, stockage social et tâches idempotentes, schéma ORM, gestion des personnes, reconstruction de conversations, extraction d'adresses, graphiques/pools/marqueurs, nouveaux types d'alertes et résumés, page Sources et API, nouvelles fixtures, tests de contrat/intégration et documentation fournisseurs.

## 5. Écart section par section du cahier des charges V2

| Section | Existant | Évolution nécessaire |
|---|---|---|
| 0 — Conduite | Démo balisée, absence de transaction, limites documentées | Maintenir ces invariants, capacités X explicites, aucune extrapolation d'accès |
| 1 — Audit | Présent rapport et contrôles | Validation avant phase 1 |
| 2 — Méthode | Historique de phases et distribution V1 | Quatorze étapes ci-dessous ; validation à chacune sauf instruction contraire |
| 3 — API X | Aucune | Client, champs/expansions, schémas, capacités, polling/stream, coûts et suppressions |
| 4 — Données | 33 tables sans données X ni ORM | Nouvelles tables et FK d'origine, ORM et suite de migrations |
| 5 — Veille X | Publications sociales génériques dans les fixtures | Fil, pause/compteur, recherches locale/API distinctes, filtres, liens, déduplication et extraction |
| 6 — Personnes | Liste de mots-clés | Comptes stables, validation, catégories, notes, pause et historique des pseudonymes |
| 7 — Conversations | Absentes | Arbre/liste, références manquantes, citations séparées, couverture et minimisation |
| 8 — Événements | Trois scénarios et attention sans ligne de base antérieure | Liens X, avant/après et interruptions, nouvelle chronologie, alertes contextuelles, Nébula Mobile |
| 9 — Associations | Règles pédagogiques, aucun CONFIRMED dans le domaine | Preuves sociales et première apparition observée ; vrai niveau confirmé sur preuve officielle exacte seulement |
| 10 — Graphique token | Courbe de mentions, métriques ponctuelles | Route chaîne/adresse, bougies/pools/volumes/liquidité/transactions/marqueurs ; trous visibles |
| 11 — Risques | Fixtures : création, concentration, liquidité et échec | Modèle de contrôle complet, permissions EVM/Solana et fournisseurs lecture seule ; données absentes explicites |
| 12 — Alertes | Seuil absolu, cooldown, hystérésis et feedback | Nouveaux types, ligne de base, résumés, limites horaires, regroupement, pauses, qualité et canaux |
| 13 — Sources et API | Quatre sources fictives, interrupteurs de vue | Capacités, dernières collectes/erreurs, budgets, quotas, fréquences et test de connexion à coût annoncé |
| 14 — Interface | Six pages, thèmes, français, clavier et filtres partiels | Neuf pages, nouveaux liens cohérents et filtres ; audit accessibilité complet |
| 15 — Sécurité | Isolation Electron, Zod, échappement React et réseau refusé | Authentification live, SSRF, secrets serveur, Bidi/homoglyphes, rétention et suppressions X |
| 16 — Variables | Pas de .env.example, aucun APP_MODE pilotant le runtime | Validation de configuration côté serveur, documentation de chaque variable et aucun secret embarqué |
| 17 — Démo | Trois scénarios, pas de fournisseur X simulé | Ajouter 40–80 publications Nébula Mobile, conversation 35/120, bougies/marqueurs, 429/coupure/budget |
| 18 — Tests | Baseline réussie, PostgreSQL indépendant | Contrats X/DEX, Redis, budgets concurrents, contenu hostile et parcours V2 complet |
| 19 — Livrables | Documentation V1 et cet audit | Fournisseurs, matrice finale, migration, mise à niveau, environnement, limites et exploitation V2 |
| 20 — Acceptation | Invariants V1 partiellement réutilisables | Aucun critère X/live déclaré rempli avant sa preuve automatisée et sa configuration |
| 21 — Interdits | Pas de trading, portefeuille ou réseau fournisseur | Étendre tests pour comptes, liens, langage et données hostiles |
| 22 — Début | Code déjà disponible, aucune nouvelle archive nécessaire | Arrêt après cet audit pour validation |

## 6. Points techniques et risques de régression

| Constat vérifié / risque | Réponse proposée et preuve future |
|---|---|
| Tous les accès externes sont bloqués dans Electron et la CSP | Garder le renderer fermé ; réseau fournisseurs uniquement côté backend contrôlé, jamais lever globalement le refus réseau de la démo |
| Types Provenance/Event/Token limités à DEMO | Union discriminée et dépôts filtrés ; bases/modes séparés, tests contre toute fuite DEMO/REAL |
| Indicateurs et risques pédagogiques, pas une analyse on-chain | Conserver règles démo, créer des analyses live distinctes avec statuts et preuves |
| Moteur de mentions emploie une valeur de secours zéro ; SVG relie toutes les valeurs | Ne pas réutiliser pour séries partielles : null/manque/coupure explicites, segments discontinus et pas d'interpolation |
| Money convertit certains entiers par Number pour formater | Éviter toute perte >2^53 ; calculs et formatage exacts, tests de grands montants et très petits prix |
| Preferences Zod dupliquées TS/CJS | Centraliser le contrat partagé lors du socle, conserver tests de validation des deux frontières |
| État V1 limité à un petit fichier JSON, pas de dépôt social | Ne pas stocker les publications dans les préférences ; migrer les réglages sans écraser V1 et utiliser des dépôts de collection |
| JSON V1, nouveaux champs et retour à l'ancienne version | Créer preferences-v2.json par migration testée depuis V1, sauvegarde et refus d'écrasement ; le fichier V1 reste utilisable en retour arrière |
| Routes token=id et presse-papiers limité aux formats DEMO | Ajouter résolution chaîne/adresse et validation REAL explicites ; préserver compatibilité des deep links et refus d'adresses invalides |
| Pas d'authentification applicative, notes futures sensibles | Ajouter administrateur/service live, sessions et contrôle d'accès avant connexion à des données réelles ; notes exclues des DTO fournisseurs/logs/LLM |
| Fenêtre et capacités X variables, erreurs 401/403/429 | États disponible/limité/indisponible/non testé, appels bornés et preuve des comportements via fixtures |
| Appels simultanés pouvant dépasser un budget | Réservation atomique avant appel, rapprochement après réponse, reprise sur crash et tests de concurrence ; coût inconnu ≠ zéro |
| Pas de rétention/suppression de contenus exécutée | Jobs de purge et disponibilité des posts ; propagation aux conversations, citations et recherches sans conservation de texte interdit |
| Quota épuisé pouvant ressembler à une chute d'attention | Intervalles de collecte manquants et indicateurs de complétude, pas de zéro synthétique |
| CI actuelle n'exécute ni E2E navigateur, ni PostgreSQL/Redis, ni shell Windows | Étendre la CI avec jobs adaptés ; le script shell actuel vise Linux, pas encore Windows |
| APIs/profil X/URL externes hostiles | Destinations autorisées, résolution et redirects contrôlés, limites de taille, rendu texte et neutralisation des contrôles Unicode |
| Installateur non signé, dépendances de build signalées | Maintenir validation ZIP/SHA-256, traiter l'audit, tester mise à niveau Windows et prévoir signature avant diffusion large |

Aucune exploitation concrète nouvelle n'a été démontrée pendant cet audit ; les limites ci-dessus empêchent en revanche de déclarer la V1 prête à ingérer des données hostiles en live.

## 7. Architecture d'évolution proposée

Conserver Electron/React comme client Windows et le mode démo autonome. Ajouter un backend Node/TypeScript privé pour le live, avec PostgreSQL et Redis/BullMQ, en réutilisant le schéma initial. Les jetons restent dans l'environnement de ce backend. Le renderer ne reçoit que des réponses filtrées ; aucune clé fournisseur dans un bundle ou un IPC générique.

La démo utilise un XProvider local de même contrat, une horloge injectée et des dépôts locaux de démonstration ; le backend fournit l'adaptateur REAL. L'absence de backend ou de clé produit « Accès X non configuré », sans transformer les fixtures en données réelles. Les notes privées sont stockées localement pour la démo et dans le stockage privé authentifié de l'instance pour le live ; elles ne font partie d'aucune requête fournisseur.

Le serveur géré est une proposition d'architecture, pas un service actuellement hébergé. Son hébergement, sa connexion et ses coûts devront être décidés avant activation réelle. L'utilisateur final ne devra pas installer Docker, PostgreSQL ou Redis sur son PC pour la démonstration. Ne pas embarquer à la hâte des serveurs tiers dans l'installateur.

## 8. Plan de migration des données

Aucune migration exécutée ou fichier SQL modifié en phase 0. Les noms ci-dessous sont proposés, pas encore du code livré.

| Migration future | Contenu additif | Contraintes / retour arrière |
|---|---|---|
| 0002_x_identity_collection | x_users, x_username_history, x_posts, x_post_metrics_history, x_rules, x_collection_runs ; jointures de règles et modes de collecte | Unicité origine/identifiant fournisseur ; FK origine ; conserver IDs numériques X comme texte exact, jamais Number ; rollback seulement après vérification de l'absence de dépendances |
| 0003_people_conversations | person_categories, tracked_people, conversations et références de réponses/citations | Personne non validée sans faux x_user_id ; unicité partielle après validation et résolution atomique des doublons ; conversations tolérant parents/racine manquants |
| 0004_social_chart_evidence | post_token_mentions, post_event_links, token_chart_markers, price_candles ; colonnes first_social_seen_at et first_social_post_id sur tokens | Références au token/événement/source avec origine ; bougies uniques origine/token/pool/intervalle/bucket/fournisseur ; NUMERIC exact, invariants OHLC |
| 0005_provider_controls_alerts | provider_status, provider_budgets, x_usage_ledger, réservations de coût et checkpoints ; nouveaux types/champs d'alertes et résumés | Réservations durables et idempotentes ; CHECK des anciens + nouveaux types ; rollback refusé si suppression de règles/données V2 nécessaire |
| Préférences bureau V1 → V2 | Lecture de V1, copie des réglages, nouveau fichier versionné et nouveaux dépôts DEMO | Ne pas convertir une fixture en REAL ni écraser un fichier invalide ; sauvegarde, échec atomique et essai de downgrade |

Toutes les nouvelles lignes applicatives porteront origine non nulle indexée, marqueur de connaissance approprié et timestamps UTC ; toutes les FK métier incluront l'origine. La propriété created_at de l'API X sera mappée vers published_at/x_created_at pour ne pas confondre publication et insertion SQL. Les IDs fournisseur externes non encore récupérés peuvent être conservés comme références externes, sans inventer de ligne observée.

Les tables V1 ne seront ni renommées ni supprimées. La migration 0001 reste immuable ; le runner doit reconnaître une liste de versions et leurs checksums avant 0002, puis sérialiser les mises à niveau. Le schéma Drizzle sera aligné avec le SQL existant, sans génération destructrice de remplacement. Le rollback V2 ne doit jamais appeler le DROP SCHEMA de V1.

Tests requis : base vide → V1 → V2 ; base V1 peuplée → V2 avec conservation des données ; réapplication et concurrence ; rollback V2 sur données compatibles ; refus explicite si perte de données ; aucune liaison inter-origine ; changements de pseudonymes, réponses orphelines, upsert multi-mode et annulation sur échec. Les procédures de sauvegarde/restauration seront documentées et vérifiées avant un usage réel.

## 9. Dépendances envisagées

Métadonnées npm version/licence consultées pendant l'audit ; aucune installation ni mise à jour effectuée. Les versions ci-dessous sont des candidates observées, pas des choix de compatibilité déjà validés. Vérifier licence complète, NOTICE, attribution, moteurs Node, dépendances transitives et tests avant verrouillage.

| Dépendance candidate | Version observée / licence déclarée | Justification | Alternative |
|---|---|---|---|
| lightweight-charts | 5.2.1 / Apache-2.0 | Bougies, volumes, interactions et marqueurs | SVG existant pour attention seulement ; Recharts ou ECharts à évaluer pour le prix |
| decimal.js | 10.6.0 / MIT | Montants, budgets et OHLC exacts | BigInt avec échelle documentée |
| fastify | 5.12.7 / MIT | Backend privé, schémas et routes | Node HTTP natif, NestJS |
| pg | 8.23.1 / MIT | Accès PostgreSQL | Pilote postgres compatible Drizzle |
| drizzle-orm | 0.45.4 / Apache-2.0 | Contrat ORM aligné sur le SQL déjà livré | Dépôts SQL typés sans ORM, avec écart explicite au cahier des charges |
| ioredis | 6.0.0 / MIT | Registre de quotas, cache et limites partagées | Client redis officiel compatible avec la file retenue |
| bullmq | 6.3.16 / MIT | Collectes, reprises et purges durables | Planificateur initial sur PostgreSQL, sans annoncer les garanties d'une file Redis |
| undici | 8.12.2 / MIT | Transport et contrôle de connexion/DNS | HTTPS natif Node ; pas de nouveau SDK X nécessaire |
| viem | 2.57.7 / MIT | Fonctions d'identité EVM en lecture seule | Keccak d'une bibliothèque reconnue, sans primitive de signature applicative |
| bs58 | 6.0.0 / MIT | Décodage et longueur des adresses Solana | Bibliothèque d'adresses Solana sans wallet |
| argon2 | 0.45.1 / MIT | Hash administrateur du service live | OIDC ; valider les binaires natifs du backend |

Les grandes versions proposées de Redis/BullMQ/HTTP devront être testées ensemble avec Node 24. Aucun ajout massif de SDK blockchain ni API d'écriture/signature ne sera accepté. Aucun iframe graphique ou CDN n'est nécessaire au choix proposé. Le rendu graphique peut nécessiter une projection numérique bornée dans la bibliothèque : stockage/calculs restent exacts, valeur d'origine affichable et refus de valeurs hors précision admissible.

## 10. Clés, accès et matrice de fonctionnement

Présence des variables vérifiée sans afficher leurs valeurs : X_API_BEARER_TOKEN, X_API_ENABLED, DATABASE_URL, REDIS_URL, BIRDEYE_API_KEY et GOPLUS_API_KEY sont absentes ou vides dans cette machine ; pas de fichier .env local. Cela ne prouve rien sur le PC de l'utilisateur et ne justifie pas une demande de secret en chat.

| Exigence | Niveau et fonction débloquée | Comportement sans accès |
|---|---|---|
| Aucun secret | Obligatoire pour préserver la démo sans clé | Démo pleinement autonome, réseau externe refusé |
| Backend privé authentifié + stockage/configuration | Obligatoire pour le live proposé | Client en mode non configuré, pas de repli vers des données fictives |
| Jeton d'application X, droits sur endpoints voulus | Obligatoire pour chaque capacité live X | Fonctions X live indisponibles, matrice explicite |
| Grille tarifaire et plafonds jour/mois/fonction | Obligatoire avant collecte X facturable en mode strict | Coût inconnu affiché comme inconnu ; collecte payante bloquée, pas estimée à zéro |
| Accès recherche récente / utilisateur | Recommandé pour première collecte et validation de comptes | Comptes locaux non validés, aucun faux identifiant stable |
| Flux filtré, archive complète, publications citantes | Optionnel, selon droits réellement disponibles | Polling ou fonctions limitées ; aucun mot « en direct » abusif |
| Fournisseur OHLCV/DEX, éventuellement clé | Obligatoire pour de vrais graphiques selon fournisseur/chaîne | Graphique indisponible avec motif ; fixtures uniquement en démo |
| RPC/explorateur/risques | Requis par contrôle réel, pas pour toute la navigation | Check indisponible/échoué, jamais absence de risque implicite |
| SMTP, webhook HMAC, Telegram/Discord | Optionnels | Notification interne seulement |
| Signature d'éditeur Windows | Recommandée avant diffusion large | Paquet explicitement non signé |

Les valeurs sensibles seront saisies dans une configuration sécurisée de l'environnement serveur, jamais demandées dans la conversation, enregistrées dans Git ou transférées au renderer. Les accès X, endpoints, tarifs, fenêtres et quotas restent **à vérifier dans la documentation officielle à l'installation**. Aucun quota ou prix fixe n'est validé par cet audit ; aucun appel payant de découverte n'a été tenté.

| Fonction | Réelle en V1 ? | Simulée en V1 ? | Condition V2 |
|---|---|---|---|
| Navigation, recherche locale, préférences | Oui, sur données intégrées | Données fictives | Conservées et étendues |
| Veille X, personnes et conversations | Non | Non, seulement publications sociales génériques | Nouveau XProvider + fixtures ; live dépend des capacités |
| Association, marché et risques | Aucun résultat on-chain réel | Oui | Preuves exactes et fournisseurs de lecture |
| Graphique prix OHLCV | Non | Non | Dépôt OHLCV, bibliothèque, fournisseur ou fixtures explicites |
| Budget/quota/429 | Non | Non | Registre et gardes testées, simulations disponibles hors réseau |
| Alertes | Pas de notifications fournisseur | Oui, seuil et fixtures | Moteur étendu et canaux explicitement configurés |

## 11. Questions ouvertes et décisions par défaut proposées

Ces propositions font partie du plan à valider ; aucune dépense, activation réseau live ou migration de données utilisateur n'est engagée.

| Question | Défaut proposé | Conséquence / point à confirmer |
|---|---|---|
| Garder une application Windows sans outils de développement ? | Oui, Electron et installateur conservés | Serveur live géré séparément ; hébergement à décider avant activation |
| Quel accès X et quel budget disponibles ? | Aucun accès présumé ; démo et état non configuré | Tarifs/règles de droits vérifiés plus tard, limite stricte avant le premier appel |
| Faut-il du flux ou du polling ? | Auto selon capacités constatées ; polling si seul disponible | Fréquences configurables et aucune promesse d'instantanéité |
| Où stocker les notes privées ? | Démo locale ; live dans l'instance privée authentifiée | Pas d'envoi fournisseur/LLM, accès et chiffrement du stockage à préciser |
| Quelle bibliothèque et quel fournisseur de prix ? | Évaluer lightweight-charts, GeckoTerminal en premier | Licences/NOTICE, endpoints, chaînes, CGU et coûts à vérifier ; Birdeye possible pour Solana |
| Le scénario Tesla V1 doit-il disparaître ? | Conserver le scénario historique balisé, comme demandé par la non-régression ; toutes les nouvelles données V2 entièrement inventées | Le texte exige à la fois de conserver les scénarios et aucune entreprise réelle en démo. Si l'interdiction est globale, renommer le scénario et adapter ses tests devra être une décision explicitement validée |
| Les pseudonymes de démonstration doivent-ils passer la validation X réelle ? | Non : espace de validation DEMO distinct, liens .invalid et identifiants factices | Les exemples ont 20/19/19/13 caractères. Ne pas élargir un validateur REAL pour satisfaire une fixture ; contraintes officielles à vérifier |
| Compte ajouté sans API : quel identifiant ? | x_user_id absent jusqu'à validation ; handle normalisé provisoire | Pas d'ID numérique inventé ; fusion avec fiche existante une fois l'ID connu |
| Conversation 35/120 : « complète » possible ? | Afficher 29,17 % et toujours partielle | Compter uniquement réponses uniques, pas racine/citations ; dénominateur absent ou incohérent → couverture inconnue |
| Intervalle et pool du graphique ? | Pools disponibles, principal par liquidité récente comparable ; aucun choix si données insuffisantes | Pas de symbole comme identité ; pas de consolidation de pools non documentée |
| Rétention de départ ? | Proposition V2 : posts 90 j, conversations/commentateurs 30 j, purge plus tôt si suppression fournisseur | À valider selon CGU/juridiction ; notes privées et audit ont une politique séparée |
| Multi-utilisateur ou privé ? | Instance privée à administrateur unique | Pas de SaaS multi-tenant implicite |
| Faut-il tout livrer avant une nouvelle version Windows ? | Jalons validés ; V1 téléchargeable conservée pendant le travail | La V2 ne sera annoncée installable qu'après build et vérification HTTPS de son nouveau paquet |

## 12. Plan des phases suivantes et portes de validation

| Phase | Fichiers / responsabilités prévus | Preuve attendue avant suite |
|---|---|---|
| 1 — Accès X et socle manquant | packages/shared et packages/connectors/x : transport, erreurs, configuration, schémas, capacités, budget ; composition serveur minimale ; interface XProvider et adaptateur simulé | Fixtures de contrat, refus réseau démo, 401/403/429 bornés, coupe-circuit, coûts inconnus et budgets concurrents ; documentation officielle revue |
| 2 — Données | packages/db : ORM, runner versionné, migrations 0002–0005 ; migration des préférences | Parcours V1 → V2, rollback sûr et conservation des données/origines ; Postgres/Redis |
| 3 — Veille X | Collecteurs stream/polling, curseurs, fusion de règles, recherche locale/API, filtres | Idempotence multi-mode, reprises, republications séparées et contrôle préalable du budget |
| 4 — Personnes suivies | Service de personnes/catégories/notes et formulaires | Normalisation, confirmation API, comptes protégés, ancien pseudo, pause et données privées |
| 5 — Conversations | Dépôts, arbre/liste, citations et couverture | Parents manquants, 35/120, fenêtre dépassée et absence de profilage |
| 6 — Événements | Liens X, ligne de base et chronologie enrichie | Interruptions visibles, fiabilité/popularité séparées et événements V1 conservés |
| 7 — Preuves sociales/token | Extraction texte/URL, normalisation, mentions et première observation | Chaîne/adresse exacte ; jamais confirmé sur cashtag/nom ; domaine d'URL autorisé |
| 8 — Graphique | Page token, route identitaire, cache OHLCV, pools, volumes, transactions et marqueurs | Validation de route, variations exactes, trous sans interpolation, sources et limites |
| 9 — Risques | Adaptateurs lecture seule et présentation complète | Chaque statut, preuves/limites, données absentes et aucun code de transaction |
| 10 — Alertes | Règles, résumés, plafond horaire, qualité, pauses et canaux | Hystérésis/cooldown, déduplication, DST/heures silencieuses et états supprimés |
| 11 — Sources et API | Matrice, quotas/budget, coûts estimés et diagnostic | Test de connexion à coût annoncé, 429/coupure/plafond et secrets expurgés |
| 12 — Navigation/UI | Neuf pages, composants extraits, filtres et liens cohérents | Français, clavier, thèmes, états erreur/vide/partiel/ancien et compatibilité deep links |
| 13 — Démo étendue | Nébula Mobile, 40–80 posts, quatre tokens, conversation, OHLCV et simulations | Aucun appel externe, comptes/adresses/liens factices et cohérence temporelle |
| 14 — Validation/livraison | Nouveaux tests, CI étendue, PROVIDERS, SECURITY, LIMITATIONS, RUNBOOK, environnement, matrice et installateur | Baseline V1 + parcours V2, migrations, budget, audit dépendances, upgrade Windows et ZIP HTTPS retéléchargé/vérifié |

Le scénario minimal de validation V2 est : Veille X → publication d'une personne suivie → conversation partielle → réponse avec adresse → fiche token → graphique et marqueurs → risques → création d'alerte → Sources et API avec 429 simulé. Aucune suite réussie sur des fixtures ne sera décrite comme une vérification réelle de X.

## 13. Livrables de cette phase et prochaine action

Créés : docs/AUDIT_V2.md et docs/SPECIFICATION_V2.md. Mis à jour : docs/DECISIONS.md avec propositions V2 et README.md avec lien vers l'audit. Supprimés : aucun fichier. Code applicatif, tests, dépendances, migrations et paquet Windows 0.1.0 : inchangés.

Le document fourni demande : « Tu t'arrêtes après la Phase 0 et tu attends ma validation. » La phase 1 ne commence donc qu'après validation de cet audit. Les choix de la section 11 peuvent être corrigés dans cette validation ; il n'est pas nécessaire de fournir une clé ou d'installer un outil sur le PC pour approuver le plan.
