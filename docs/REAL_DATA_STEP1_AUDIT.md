# Passage aux données réelles — étape 1 : inventaire à valider

L’application Windows 0.2.0 reste entièrement **Simulé (démo)**. Aucun mode connecté, déploiement ou résultat réel n’est livré par cet audit. Le code des adaptateurs privés existe ; sa présence ne prouve ni un accès fournisseur ni une collecte réelle.

Demande de référence : prompt-memeradar-donnees-reelles.md fourni par l’utilisateur. Son paragraphe 7 demande : « Commence uniquement par l’étape 1 ». Le critère de sortie de cette étape est la validation de l’inventaire par l’utilisateur. **Inventaire validé par l’utilisateur le 19 octobre 2026. L’étape 2 prépare désormais les fournisseurs, le budget et le pilote ; voir [la proposition](REAL_DATA_STEP2_PROPOSAL.md).**

État examiné : commit 6fc5b4892196ce33f31bb58d9cb40e9cad7ed6d1, application 0.2.0. Contrôles relancés le 19 octobre 2026 UTC. Les seuls changements de cette étape concernent ce rapport et son lien dans le README.

## 1. Inventaire et réutilisation

« Réutilisable » désigne une brique de code examinée, pas une fonction réelle opérationnelle. Les adaptateurs réseau restent à vérifier auprès des fournisseurs choisis.

| Module / chemins | Rôle actuel | Réutilisable tel quel | À adapter ou compléter | Manquant |
|---|---|---|---|---|
| apps/desktop/main.cjs et preload.cjs | Fenêtre Electron isolée, protocole local, préférences, copie d’adresse | Isolation du renderer, contrôle IPC, refus des fenêtres et permissions | Client du serveur autorisé, sessions, accès réseau strictement limité ; copie d’adresses réelles validées par chaîne | Connexion au serveur et stockage sécurisé de la session |
| apps/web/src/main.tsx, navigation.ts, AppNavigation.tsx, PageBoundary.tsx | Neuf pages, filtres, navigation accessible, gestion d’erreur | Navigation et structure visuelle | Séparer le fournisseur DEMO du client REAL dès la composition ; état de connexion et fraîcheur | Sélecteur de mode opérationnel et authentification |
| apps/web/src/WatchPage.tsx et watch-model.ts | Veille sur un catalogue fictif | Présentation, filtres à réutiliser sous contrats testés | Remplacer l’accès direct aux fixtures et les dates simulées par des réponses validées du serveur | Lecture des publications réelles depuis l’application |
| apps/web/src/People.tsx | Personnes, notes et catégories locales de démo | Formulaires et présentation | CRUD serveur, confirmation d’identité, pause effective, notes privées par utilisateur | Ajout de compte X réel depuis Windows |
| apps/web/src/Conversations.tsx et packages/conversations | Arbre/liste et couverture fictive ; service privé avec devis | Modèles de couverture, pagination et minimisation des commentateurs | Raccordement, confirmation de coût et reprise serveur | Conversation réelle vérifiée dans l’interface |
| apps/web/src/EventInsights.tsx et packages/events | Événements enrichis et chronologies fictives ; modèles privés | Modèles et présentation des preuves | Alimenter avec des publications et sources d’actualité autorisées | Collecteur d’actualité connecté et événement réel vérifié |
| packages/social et SocialProofs.tsx | Identité chaîne/adresse, extraction et preuves sociales | Validation d’identité et extraction à conserver sous tests | Fournir les preuves depuis le serveur ; conserver les attestations explicites | Preuves réelles visibles et vérifiées |
| TokenAnalysis.tsx, packages/charts et connectors/market/gecko.ts | Graphiques fictifs ; adaptateur GeckoTerminal privé | Bibliothèque locale, décimaux, contrats de données | Interface serveur, origines, fraîcheur, droits/quotas et budget fournisseur | Comparaison de prix/liquidité réels avec une source |
| RiskPanel.tsx et packages/risks | Dix-sept contrôles fictifs ; adaptateur GoPlus et décodeurs privés | Modèles de preuves, états inconnus/contradictoires | Acquisition réelle selon les chaînes, provenance et fraîcheur | Validation réelle ; acquisition RPC générale non livrée |
| AlertsV2.tsx et packages/alerts | Alertes locales ; moteur et dépôt privés | Moteur de règles, déduplication et journal sous tests | Ordonnancement sur les observations collectées et lecture serveur | Déclenchement réel de bout en bout ; livraison externe |
| SourcesV2.tsx et packages/sources | Diagnostics/quota/budget simulés ; service privé | Modèles et diagnostics nettoyés | Routes authentifiées, droits administrateur, arrêt général persistant | Commande d’arrêt réelle depuis Windows |
| packages/connectors/x et packages/collection | Clients X, flux borné, polling, recherche et déduplication privés | Code et contrats existants, avec validation de compatibilité | Droits du compte, tarifs vérifiés, limites pilote et exploitation | Test fournisseur réel et collecte documentée pendant 24 h |
| apps/api/*-runtime.ts | Composition des services privés | Fabriques de services | Les exposer derrière une API validée et authentifiée | Serveur HTTP, routes, limitation des requêtes et sessions |
| apps/worker/x-worker.ts et scripts/x-collect.ts | Worker privé, arrêt SIGINT/SIGTERM ; diagnostic sans argument | Collecteurs et fermeture contrôlée | Exécution supervisée, identité fiable, arrêt partagé, cycle des alertes | Worker hébergé surveillé et validation réelle |
| packages/db | Douze migrations, requêtes, origines, propriétaires, RLS et registres | Migrations et dépôts sous leurs tests existants | Rôle SQL sans BYPASSRLS, authentification de l’identité, rétention et exploitation | PostgreSQL/Redis hébergés, sauvegarde/restauration validées |
| users et sessions dans 0001_initial.up.sql | Schéma Argon2id et empreintes de sessions | Tables comme base de conception | Implémenter création, connexion, expiration, renouvellement et révocation | Service d’authentification ; une table n’authentifie personne |
| apps/desktop/preferences*.cjs et apps/web/src/state.ts | Préférences V1 et stockage Chromium ; préparation V2 séparée | Lecture validée et préservation des fichiers invalides | Migration non destructive, espace par serveur/utilisateur/origine ; protection des sessions | Migration connectée de bout en bout ; V2 préparée non active |
| tests et .github/workflows | Tests hors ligne, bases jetables, paquet et installation Windows CI | Bancs et construction existants | Tests HTTP/auth/permissions/arrêt/budgets et absence de fixtures REAL ; mise à niveau de l’ancien EXE | Recette avec les fournisseurs et sur le PC utilisateur |
| Infrastructure d’hébergement | Aucun serveur hébergé fourni ou validé dans ce travail | Documentation et schéma disponibles | Choix d’hébergement, TLS, secrets serveur, supervision | Déploiement et procédures opérationnelles testées |

L’interface demeure réutilisable. Une réécriture complète n’est pas justifiée. La modification structurante sera de séparer ses données de présentation de leur acquisition, puis de raccorder des contrats serveur sécurisés.

## 2. Points où le fictif pourrait contaminer le réel

Il s’agit de risques lors du futur raccordement ; un mode REAL n’existe pas actuellement dans l’application.

| Point constaté | Preuve dans le code | Séparation à imposer avant REAL |
|---|---|---|
| Démonstration globale | main.tsx monte DemoSessionProvider autour de l’application | Composition distincte par mode ; aucune horloge simulée pour dater une observation réelle |
| Tableau de bord et catalogue historique | main.tsx importe packages/core/demo | Aucun agrégat ou token historique fictif dans les résultats REAL |
| Veille et personnes | watch-model.ts et People.tsx importent packages/demo/scenario | Résultats serveur uniquement en REAL, y compris en cas d’erreur |
| Conversations | Conversations.tsx importe conversations/demo-data | Origine contrôlée côté serveur et données réelles partielles explicitement indiquées |
| Événements et preuves sociales | EventInsights.tsx et SocialProofs.tsx importent plusieurs demo-data | Preuves identifiées par origine, propriétaire, source et date |
| Graphiques | TokenAnalysis.tsx importe charts/demo-data et core/demo | Fournisseur REAL explicite ; trous et cache ancien signalés |
| Risques | RiskPanel.tsx charge risks/demo-data | Aucune preuve fictive de remplacement si un contrôle échoue |
| Alertes | AlertsV2.tsx et packages/demo/alerts.ts | Aucun exemple préenregistré évalué ou livré comme alerte réelle |
| Quotas et budgets | SourcesV2.tsx lit sources/demo-data | Mesures serveur ; aucun coût ou quota simulé présenté comme consommation |
| Persistances locales | Clés memeradar-demo-* et preferences-v1.json | Préserver la démo, isoler les espaces REAL, ne pas importer ses données comme observations |
| Préférences V2 préparées | preferences-v2.cjs fixe dataOrigin à DEMO et X désactivé | Nouvelle migration explicite ; changer APP_MODE ne convertit pas ce fichier |
| Compositions privées | x-runtime.ts et chart-runtime.ts choisissent selon le mode/origine | Conserver les branches explicites ; tests négatifs contre tout repli REAL → DEMO |

Les FK d’origine et la RLS existantes sont utiles, mais ne suffisent pas à protéger une réponse HTTP ou un cache client. L’origine et le propriétaire devront être établis par le serveur, pas acceptés sur la seule déclaration du renderer.

## 3. Risques et adaptations prioritaires

### Bloquants avant toute activation réelle

1. **Pas de serveur ni d’authentification exécutables.** apps/api contient quatre compositions, pas de serveur HTTP. Les tables users/sessions ne fournissent pas de connexion. Un ownerId UUID valide dans un service privé ne prouve pas l’identité de l’appelant. Ajouter l’authentification, les autorisations, l’expiration/révocation et la limitation des requêtes avant exposition.
2. **Absence de contrôle marché : admission autorisée.** Dans packages/db/source-repository.ts, publicAdmission ne vérifie les réglages que si une ligne provider_controls existe. Sans ligne, la fonction termine normalement. Les runtimes sont privés et désactivés par défaut, mais cette branche n’offre pas un refus systématique en cas de configuration absente. Elle doit être corrigée et testée avant exposition/activation.
3. **Plafonds monétaires incomplets pour tous les fournisseurs.** Le contrôle durable X est une base réutilisable. PgMarketGate borne les requêtes de marché, et SourcesService refuse un budget monétaire non nul hors X : cela ne constitue pas un plafond financier universel. Aucun fournisseur supposé gratuit ne doit être activé si son contrat de facturation n’est pas vérifié.
4. **Arrêt général non livré dans l’application.** Il existe des réglages privés par source et des arrêts de processus. Il manque une commande authentifiée, persistante et partagée qui empêche toute nouvelle collecte payante sur tous les workers. Une requête déjà envoyée peut rester facturable ; son engagement doit rester enregistré.
5. **Données de présentation directement liées aux fixtures.** Créer des contrats DEMO/REAL séparés et tester les réponses vides, erreurs et périodes anciennes avant le raccordement.
6. **Connexion et liens bloqués par le shell actuel.** Electron refuse les requêtes extérieures, les fenêtres et la navigation externe. Cette protection convient à la démo. Adapter une liste strictement limitée au serveur authentifié et une ouverture validée des liens X/explorateurs ; conserver le sandbox et le refus des destinations arbitraires.
7. **Copie d’adresses limitée à la démo.** L’IPC clipboard:address n’accepte que les préfixes 0xDEMO et DEMo. Réutiliser la validation chaîne/adresse lors de son extension, sans accepter une commande ou une URL arbitraire.

### Confidentialité, construction et exploitation

- Les notes et réglages DEMO sont stockés sans chiffrement applicatif dans le profil Windows/Chromium. Une personne ayant accès à la même session peut les lire. Ne pas y placer une clé fournisseur, un mot de passe serveur ou un jeton de renouvellement. Prévoir un stockage de session protégé par le système lors de l’étape 3.
- Les transports privés valident les destinations, les réponses et les limites ; React affiche les textes comme texte. La recherche statique n’a trouvé ni dangerouslySetInnerHTML ni exécution JavaScript de contenus externes dans apps/packages. Les appels Redis eval correspondent aux scripts Lua internes ; ils ne sont pas un eval de publications X. Ces vérifications ne constituent pas un test d’intrusion.
- Scan limité : **231 fichiers texte suivis**, de moins de 4 Mo, sur l’état initial. Recherche de clés privées, jetons reconnaissables, JWT, affectations de secrets et URL avec identifiants. Un candidat dans docs/SPECIFICATION.md:681 est un exemple localhost avec mot de passe factice confirmé. Aucun secret effectif identifié dans ce périmètre. Les fichiers .env, .env.local et .env.production sont absents de la racine. Historique Git, binaires et valeurs des secrets de l’environnement non audités ; aucune clé n’a été affichée ou utilisée.
- npm audit de production : **0 vulnérabilité signalée**. Audit complet : **8 paquets affectés de niveau modéré**, zéro élevé/critique. Ils concernent la chaîne electron-builder et notamment l’avis sprintf-js [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), avec remontées transitives ; ce ne sont pas huit avis indépendants. Certaines corrections transitives sont proposées, sans correction compatible globale annoncée pour la racine electron-builder. Évaluer une mise à jour compatible avant la future distribution ; ne pas forcer une modification des dépendances pendant cet inventaire.
- Pas de signature d’éditeur ni de mise à jour automatique. Les fournisseurs et secrets ne doivent pas être embarqués dans le futur paquet. La chaîne actuelle contient des dépendances serveur à inventorier lors du contrôle du paquet connecté.
- L’installation, le démarrage et la désinstallation de 0.2.0 ont été validés historiquement en CI Windows Server. La mise à niveau depuis l’ancien binaire et la recette manuelle Windows 10/11 restent à faire pour la version connectée.
- Pas d’hébergement, sauvegarde restaurée, surveillance ou droits fournisseur réels validés dans cette étape. Les capacités et tarifs officiels doivent être vérifiés lors du choix des accès et à l’activation.

## 4. Preuves recueillies pendant cet audit

| Contrôle relancé | Résultat / portée |
|---|---|
| npm run build | Réussi : TypeScript strict et production Vite |
| npm test -- --coverage | 25 fichiers, **316 tests réussis** ; données fictives et transports contrôlés |
| Couverture de la sélection Vitest | Lignes 96,10 %, branches 91,86 %, instructions 94,86 %, fonctions 95,63 % ; ne couvre pas toute l’application |
| npm run format:check | Réussi |
| npm run test:e2e avec Chromium local | **20 parcours réussis** ; démonstration, navigation, persistance et absence de réseau fournisseur ; aucun test de données réelles |
| npm audit --omit=dev --json | 0 vulnérabilité signalée |
| npm audit --json | 8 modérées, 0 élevée/critique ; sortie non nulle cohérente avec les alertes |
| Diagnostic X et collecte sans argument, forcés en démo et désactivés | networkCalls: 0 ; dataOrigin: DEMO ; collecte désactivée |
| Scan borné des fichiers suivis | 231 textes, un exemple documentaire factice, aucun secret effectif identifié dans le périmètre |
| Sonde publicAdmission sans ligne de configuration | Retour normal, trois requêtes factices BEGIN/SELECT/COMMIT ; aucun réseau ou PostgreSQL réel |
| Publications, marchés, risques et alertes réels validés | **0** ; aucun appel fournisseur effectué |

Le test d’échec de vue provoque volontairement un message de chargement de module dans le journal Chromium ; son parcours et les vingt tests sont réussis. Aucun délai ni assertion n’a été modifié pour cet audit.

Sonde locale exécutée sur la fonction existante, avec un client PostgreSQL factice :

~~~json
{"probe":"publicAdmission with missing provider_controls record","result":"returns successfully","queries":3,"networkCalls":0,"database":"in-memory test double"}
~~~

Preuves historiques conservées, **non réexécutées ici** : [CI 0.2.0](https://github.com/wnathan469-debug/meme/actions/runs/39184827033), tests PostgreSQL/Redis, SQL V1 et installation/désinstallation natives ; [vérification des téléchargements 0.2.0](DOWNLOAD_VERIFICATION.md). Ces preuves concernent la démonstration et ne valident pas les API fournisseurs.

Les journaux temporaires de l’audit sont dans /tmp/real-step1-*.log et les résultats npm/scan dans /tmp/real-step1-*.json. Ils ne sont pas des téléchargements publics. Le présent rapport contient les résultats consultables sans accès à ces fichiers.

## 5. Suite proposée, soumise à validation

L’ordre du document fourni reste obligatoire : **1 inventaire → 2 fournisseurs/budget → 3 serveur sécurisé → 4 hébergement → 5 collecte pilote 24 h → 6 pages connectées → 7 conversations/événements → 8 marché → 9 risques → 10 alertes → 11 recette pilote → 12 installateur connecté**.

Les blocages d’authentification, de séparation des origines et de budget/arrêt sont à traiter à l’étape 3 avant de permettre un appel réel. Le choix des droits, budgets, chaînes et comptes du pilote appartient à l’étape 2. Les hébergeurs seront comparés avant un choix et toute création de service facturable.

Action utilisateur maintenant :

1. Lire l’inventaire, les points de contamination et les risques ci-dessus.
2. Confirmer que ces éléments correspondent à l’application que vous souhaitez faire évoluer, ou indiquer les corrections.
3. Valider cet inventaire pour autoriser l’étape 2. Aucun compte, secret ou outil de développement n’est nécessaire pour cette validation.

Aucun achat, hébergement ou appel API fournisseur n’a été engagé. Les coûts d’hébergement et d’accès restent à proposer à l’étape 2, puis à vérifier sur les sites officiels à la date d’activation. Aucun nouvel EXE ou ZIP n’a été construit : 0.2.0 reste une démo.

## 6. Statut global

Les statuts des fonctions de données décrivent leur disponibilité réelle dans l’application Windows ; les composants privés sont présentés séparément pour ne pas confondre code et service opérationnel.

| Fonction ou composant | Statut | Précision |
|---|---|---|
| Tableau de bord et indicateurs | Simulé (démo) | Agrégats et chronologies fictifs |
| Veille X | Simulé (démo) | Catalogue local Nébula |
| Personnes suivies, catégories et notes | Simulé (démo) | Flux métier démontré, stockage local effectif |
| Conversations et couverture | Simulé (démo) | Conversation fictive partielle |
| Événements et preuves sociales | Simulé (démo) | Sources et attestations fictives |
| Tokens, pools, prix et graphiques | Simulé (démo) | Marché synthétique et catalogue historique séparé |
| Contrôles de risque | Simulé (démo) | Preuves fictives, états inconnus/contradictoires visibles |
| Alertes et historique | Simulé (démo) | Scénario et cas pédagogiques |
| Sources, quotas et consommation affichés | Simulé (démo) | Pannes et budgets simulés |
| Clients X/GeckoTerminal/GoPlus et collecteurs privés | Code écrit, non raccordé | Pas de validation fournisseur réel |
| Moteur d’alertes, plafonds X et dépôts PostgreSQL | Code écrit, non raccordé | Briques privées sous tests, pas un serveur accessible |
| Schéma et préparation de migration des préférences | Code écrit, non raccordé | Formats préparés, migration connectée non livrée |
| Authentification et API HTTP | Non commencé | Tables préparées, service absent |
| Arrêt général des collectes depuis Windows | Non commencé | Aucun bouton relié à des workers réels |
| Hébergement HTTPS, sauvegardes et surveillance | Non commencé | Aucun déploiement validé dans ce programme |
| Notifications externes | Non commencé | Pas de livraison exécutée |
| Installation, navigation et préférences locales 0.2.0 | Réel et vérifié | Fonctionnement local vérifié ; aucune donnée réelle implicite |
| Données réelles dans l’application / pilote de 24 h | Non commencé | Zéro donnée réelle validée |
| Nouvel installateur connecté et mise à niveau | Non commencé | Téléchargement actuel toujours en démo |

**Étape 1 : inventaire validé par l’utilisateur. Les constats et contrôles ci-dessus restent ceux de l’audit initial.**
