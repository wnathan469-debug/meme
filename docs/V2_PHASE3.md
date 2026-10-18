# V2 — phase 3 : collecte X, recherche et filtres

Phase 3 demandée après validation de la phase 2. Le socle privé de collecte est implémenté et testé : polling, adaptateur de flux filtré, reprises, persistance idempotente, recherche locale et recherche X avec estimation préalable. Aucun appel réel à X, aucune dépense fournisseur, aucun déploiement ou changement de l'interface Windows publiée.

## Fonctions livrées et frontière de cette phase

- Worker privé exécutable et injectable : passage unique de polling ou boucle arrêtée par signal, collecte désactivée par défaut. Pas de serveur HTTP exposé ni d'authentification serveur fictive.
- Priorités critique/haute/normale/basse, intervalles par règle avec minimum configurable, pagination bornée par cycle. Les règles ayant même requête et mêmes curseurs partagent un appel ; leurs associations restent distinctes.
- Flux filtré avec synchronisation des seules règles appartenant au préfixe de cette instance/utilisateur, conservation des règles étrangères, fusion des requêtes identiques, lecture NDJSON incrémentale, heartbeat, fenêtres et nombre de trames bornés, annulation et reprises bornées. Les POST de règles dont l'envoi est ambigu ne sont pas automatiquement répétés.
- Après interruption, tentative bornée de rattrapage par recherche récente ; mode auto revient au polling si accès refusé ou reconnexions épuisées. Un budget/plafond/registre indisponible stoppe la collecte sans contourner le refus par le rattrapage.
- Recherche locale PostgreSQL gratuite, recherche X distincte avec estimation conservatrice et confirmation d'un devis éphémère à usage unique. Les résultats API sont enregistrés, avec signal explicite si partiels.
- Filtres texte intégral, mot-clé littéral, hashtag, période, langue, type, auteur, personne/catégorie, token/événement, règle, candidat adresse et minimum d'interactions connues. Pagination par curseur, valeurs SQL liées et codec URL validé.
- Événements de fil isolés par propriétaire/origine, pause locale, notifications en attente dédupliquées et bornées ; dépassement signalé pour imposer un rafraîchissement.

Les services et l'état de collecte sont prêts pour le futur branchement de l'interface, prévu en phase 12. Il n'existe pas encore de nouvelle page Electron « Veille X », de bouton visuel, de transport SSE/WebSocket exposé ou d'installateur V2. Le hub est un abonnement privé en mémoire ; une interface future devra réinterroger le stockage après reconnexion ou débordement. Le développeur peut appeler les services et tester le worker, mais aucun outil supplémentaire n'est demandé à l'utilisateur de la démo Windows.

## Migration 0006 et persistance

Migration additive `0006_x_collection_state`, sans modification de 0001–0005. Le nombre de tables applicatives reste **55**. Ajouts : jeton de bail, curseur provisoire, empreinte de requête et prochaine échéance sur les checkpoints ; état partiel et dates d'interruption sur les collectes ; empreinte de texte et référence d'auteur non récupéré sur les publications. Schéma ORM/snapshot régénérés et comparés au PostgreSQL migré. Retour conservateur bloqué si les nouvelles données sont utilisées.

L'enregistrement d'une page, des auteurs effectivement observés, métriques, références, associations règles/collectes et du curseur forme une transaction. Une page invalide ou un résultat provenant d'un bail remplacé ne peut avancer le curseur ni émettre une notification. Les baux sont renouvelés à l'enregistrement ; la reprise d'un bail expiré marque l'ancienne exécution interrompue. Un verrou de session partagé limite le flux à un worker par origine/espace de facturation ; il est relâché même si la session échoue.

Le plus grand ID REAL est comparé en BigInt, sans Number. Tant qu'une pagination reste ouverte, le `since_id` initial est conservé et le plus grand ID observé reste provisoire. Il n'est promu qu'à la dernière page enregistrée. En DEMO, les IDs restent opaques et suivent l'ordre du simulateur. Une modification de requête invalide ses anciens curseurs ; un jeton de pagination rejeté est réinitialisé sans sauter les anciennes pages. Une requête rejetée sans jeton est mise en pause, au lieu de répéter indéfiniment un appel invalide.

Une publication est unique par origine/ID. Les modes sont conservés via les relations de collectes, les règles via leur jointure. Réponses/citations/republications gardent leur référence externe sans inventer de parent. Un auteur non récupéré conserve son ID externe séparément, sans création d'un faux profil. Les types inconnus sont comptés à part ; les republications ne sont pas ajoutées aux mentions originales. Les textes normalisés identiques chez plusieurs auteurs produisent un signal **interprété**, jamais une preuve de coordination et jamais une fusion des IDs. Il ne s'agit pas encore d'un moteur général de similarité sémantique.

Les mises à jour trop anciennes ne remplacent pas les observations récentes. Les métriques absentes restent null ; les observations connues portent leur date et leur historique. Une publication masquée par vérification d'indisponibilité ne peut être réactivée par une page plus ancienne. Les notifications ne sont émises qu'après COMMIT. Les modes et recherches visibles sont limités aux publications reliées aux règles du propriétaire, y compris les règles ponctuelles de recherche API ; aucune note privée ni règle d'un autre utilisateur n'est transmise à X ou au hub.

## Recherche locale et recherche X

`XSearchService.local` ne dépend pas d'une connexion X. Le filtre de période utilise la date de publication, ou celle de collecte quand elle manque. Les interactions filtrées sont la somme exacte des métriques connues, pas un total inventé lorsque des métriques manquent. Les liens personne/catégorie/token/événement sont lus lorsqu'ils existent ; les services qui les créeront automatiquement restent les phases 4–7. La détection d'adresse actuelle ne produit que des candidats de forme avec validité non vérifiée, ou DEMO ; elle ne confirme ni chaîne, contrat officiel ou risque.

Le constructeur assisté échappe les expressions textuelles, produit groupes OR/exclusions/hashtags/comptes/langue et respecte les opérateurs et la longueur autorisés par la configuration. Les filtres sont sérialisables dans une URL, mais ne donnent pas accès à un endpoint public. Le futur serveur doit authentifier le propriétaire avant de composer les services, comme indiqué en phase 2.

`quote(query,pages)` ne lance aucune recherche réseau. Il retourne origine, nombre maximal de requêtes, coût maximal estimé incluant les reprises, fenêtre connue ou inconnue, expiration et confirmation requise. Les quotas restants sont indiqués inconnus plutôt qu'inventés ; le nombre maximal de requêtes est fourni pour prévoir la consommation. `execute(id,acceptedMaxCostMicros)` exige la valeur acceptée, le même service propriétaire et la même grille de prix. Devis expiré, grille modifiée, montant différent ou deuxième utilisation : refus. Les devis sont en mémoire, valables cinq minutes, perdus au redémarrage ; un futur déploiement multi-processus devra les router vers leur propriétaire ou les persister avant exposition HTTP.

## Sécurité du flux et facturation

Les chemins `/tweets/search/stream` et `/tweets/search/stream/rules` ont été vérifiés dans le code du SDK officiel X déjà consulté en phase 1, sans ajouter ce SDK ni appeler X. Les champs gardent le paramètre explicite tweet.fields/post.fields décrit dans PROVIDERS.md ; les droits effectifs ne sont pas présumés.

Le transport de flux réutilise les contrôles HTTPS/hôte/IP publique et la résolution DNS épinglée. Il refuse les redirections et la compression, masque les erreurs, borne le délai de connexion, le silence et la taille d'une ligne, valide UTF-8 et chaque réponse. Les lignes vides comptent comme activité, les textes ne sont ni exécutés ni rendus en HTML. L'arrêt détruit la socket et les timers. Les requêtes POST de gestion des règles passent par le transport contrôlé et refusent toute redirection. Aucun jeton n'atteint le renderer.

Une limite de trames reçues ne prouve pas une limite de facturation fournisseur : des données peuvent être facturées avant traitement ou après demande d'arrêt. Le flux REAL exige donc **une borne contractuelle de facturation vérifiée**, déclarée avec `X_STREAM_BILLABLE_MAX_POSTS` et `X_STREAM_BILLING_BOUND_VERIFIED=true`. Sans cette garantie, aucun flux n'est connecté ; auto utilise le polling disponible, stream explicite indique non configuré. Déclarer arbitrairement une borne ne crée pas une garantie fournisseur. Si le contrat X ne fournit pas de borne suffisante, conserver le polling pour respecter les plafonds stricts.

Chaque fenêtre réserve son coût conservateur en PostgreSQL avant connexion, avec au maximum autant d'utilisateurs que de publications dans l'enveloppe, puis conserve cette borne facturée même si moins de trames ont été traitées. Les GET/POST de gestion des règles réservent aussi leur coût de requête ; leurs écritures apparaissent sous la catégorie stream du journal. Ils ont un contrôle de cadence distinct de la connexion. Les 401/403 désactivent la capacité sans boucle ; les 429 partagent la reprise annoncée ; les erreurs temporaires alimentent le coupe-circuit. Les tarifs configurés doivent couvrir ces opérations. Aucune connexion payante n'a été utilisée pour valider ces hypothèses.

## Exécution privée et configuration

`.env.example` décrit chaque variable effectivement lue. Défaut `X_COLLECTION_MODE=disabled`. `npm run x:collect` et `npm run x:diagnose` seuls affichent un diagnostic sans connecter PostgreSQL, Redis ou X.

```bash
npm ci
# Avec DATABASE_URL privé et rôle de migration injectés dans l'environnement :
npm run db:migrate
# Puis rôle applicatif non privilégié, origine et propriétaire autorisés :
npm run x:collect -- --once   # Un passage de polling borné
npm run x:collect -- --run    # Boucle, SIGINT/SIGTERM pour arrêter
```

Pour une simulation intégrée, utiliser APP_MODE=demo, une base de développement migrée, l'UUID d'un utilisateur DEMO existant et X_COLLECTION_MODE=polling ou stream. Aucun secret X ni Redis requis pour le fournisseur DEMO ; le worker de développement utilise PostgreSQL pour tester la persistance. Ceci est distinct de l'application de bureau autonome, qui continue de fonctionner sans ces services.

En REAL, l'accès X, les tarifs/plafonds, PostgreSQL, Redis et X_OWNER_USER_ID doivent être configurés par l'opérateur ; aucun secret à fournir dans la conversation. Le bail doit dépasser fenêtre du flux + timeout + marge, sinon démarrage refusé. Les minima d'intervalles sont des limites locales, pas des quotas d'offre X. L'opérateur doit provisionner le rôle non superuser/BYPASSRLS, le compte privé et les permissions minimales avant toute collecte réelle ; aucun endpoint utilisateur authentifié n'est livré à cette phase.

## Disponibilité, interruptions et limites

Le service fournit une vérification de disponibilité explicite, bornée au nombre d'IDs permis. Les contenus demandés mais absents d'une réponse valide sont masqués, vidés de texte/entités/métriques en vue courante et marqués **inconnus**, sans affirmer une suppression définitive. Leur ancienne ancre peut rester liée à des analyses. Cette vérification n'est pas encore un job de conformité périodique, et la rétention automatisée n'est pas activée. Leur planification et les règles applicables de stockage doivent être finalisées avant activation publique/live ; aucune conformité juridique ni suppression distante exhaustive n'est annoncée.

Le rattrapage est borné en pages et à la fenêtre réellement disponible. Un endpoint de recherche ne garantit pas l'exhaustivité, notamment si l'indexation est retardée. Les interruptions restent enregistrées et ne sont pas automatiquement déclarées totalement réparées. Les pages partielles sont conservées comme telles ; aucun terme « en direct » pour du polling ou la démo. Les reprises après crash peuvent relire des pages et consommer de nouveau le budget ; l'idempotence protège les données, pas la facturation du fournisseur. Une fenêtre de flux ambiguë reste réservée, pas automatiquement remboursée.

## Vérifications cloud exécutées

| Vérification | Résultat |
| --- | --- |
| Build/types stricts, format | Réussis |
| Tests unitaires/contrats | 138 tests réussis ; couverture élargie aux collecteurs, flux et contrôles : environ 93 % des lignes, 86 % des branches |
| Suite avec Redis réel | 145 tests réussis, dont les 138 ci-dessus + 7 Redis ; 94,91 % lignes, 88,41 % branches sur son périmètre |
| Suite PostgreSQL/Redis | 34 tests réussis, dont 20 migrations/comptabilité et 14 collecte/recherche ; 94,44 % lignes, 89,13 % branches sur persistance/recherche |
| SQL V1 sur schéma migré | Les 51 assertions historiques passent, adaptées au nombre de tables 55, sans affaiblir les invariants |
| Playwright interface existante | 3 parcours réussis |
| Electron sous Xvfb | Sandbox, IPC, préférences persistantes, liens, presse-papiers et blocage réseau réussis |
| Audit production npm | 0 vulnérabilité de production signalée |

**179 tests TypeScript distincts** : 138 + 7 + 34. Les tests unitaires exécutés de nouveau avec Redis ne sont pas comptés deux fois. Tous les tests X utilisent fixtures ou sockets simulées ; seuls PostgreSQL et Redis locaux sont réellement contactés. Les conteneurs sont jetables et nettoyés ; l'application n'a effectué aucune collecte fournisseur.

Cas nouveaux vérifiés : fusion multi-mode/règles, reprise de pagination, bail périmé, transaction rejetée sans notification, isolation propriétaire, filtres et SQL paramétré, égalité de textes sans fusion, devis expiré/consommé/modifié, tarification REAL simulée et journal durable, indisponibilité et anti-résurrection par page périmée, pause, verrous de flux, worker DEMO intégré, auteur non récupéré, 401/403/429/503, silence, UTF-8/NDJSON fragmenté, borne de taille, refus SSRF/redirections, budget inconnu/épuisé, POST ambigu non répété, rattrapage/reconnexion et état connecté après handshake seulement. Les seuils de couverture globaux restent à 80 %.

## Livraison et suite

Tous les fichiers complets sont dans le dépôt ; le manifeste ci-dessous indique créations et raisons des modifications. Aucun fichier supprimé. Les migrations historiques et les fichiers de l'interface V1 sont préservés. La construction Windows de contrôle ne constitue pas un nouvel installateur V2 publié.

La phase 4 ajoutera le service et les formulaires de personnes suivies, catégories et notes privées. Conformément au document V2, section 2 — « termine par un récapitulatif et attends ma validation » — elle attend la validation du résultat de cette phase.

## Manifeste des fichiers complets

### Créations

| Fichier | Rôle ou modification |
| --- | --- |
| [apps/worker/x-worker.ts](../apps/worker/x-worker.ts) | Composition privée du worker, recherche et arrêt propre. |
| [docs/V2_PHASE3.md](../docs/V2_PHASE3.md) | Documentation et bilan de la phase 3. |
| [packages/collection/collector.ts](../packages/collection/collector.ts) | Polling/flux, priorités, fusion, reprises et arrêt. |
| [packages/collection/contracts.ts](../packages/collection/contracts.ts) | Règles, curseurs, baux, résultats et contrat de dépôt. |
| [packages/collection/feed.ts](../packages/collection/feed.ts) | Pause et notifications bornées isolées par propriétaire. |
| [packages/collection/query.ts](../packages/collection/query.ts) | Construction assistée et filtres/URL validés. |
| [packages/collection/search-service.ts](../packages/collection/search-service.ts) | Recherche locale, devis de recherche API et disponibilité. |
| [packages/connectors/x/demo-stream.ts](../packages/connectors/x/demo-stream.ts) | Rejeu local du contrat de flux sans réseau. |
| [packages/connectors/x/stream-client.ts](../packages/connectors/x/stream-client.ts) | Règles distantes, coûts et fenêtres de flux contrôlés. |
| [packages/connectors/x/stream-contracts.ts](../packages/connectors/x/stream-contracts.ts) | Contrat optionnel du flux et des règles. |
| [packages/db/migrations/0006_x_collection_state.down.sql](../packages/db/migrations/0006_x_collection_state.down.sql) | Retour transactionnel conservateur et sans perte. |
| [packages/db/migrations/0006_x_collection_state.up.sql](../packages/db/migrations/0006_x_collection_state.up.sql) | État et références additionnels sans réécriture historique. |
| [packages/db/x-collection-repository.ts](../packages/db/x-collection-repository.ts) | Ingestion/curseurs atomiques, déduplication et SQL de recherche. |
| [packages/shared/stream-http.ts](../packages/shared/stream-http.ts) | Transport de flux épinglé et parseur NDJSON borné. |
| [scripts/x-collect.ts](../scripts/x-collect.ts) | Diagnostic sûr et exécution opérateur explicite. |
| [tests/integration/x-collection.test.ts](../tests/integration/x-collection.test.ts) | Tests associés de collecte, flux ou sécurité. |
| [tests/unit/x-collection.test.ts](../tests/unit/x-collection.test.ts) | Tests associés de collecte, flux ou sécurité. |
| [tests/unit/x-stream-wire.test.ts](../tests/unit/x-stream-wire.test.ts) | Tests associés de collecte, flux ou sécurité. |
| [tests/unit/x-stream.test.ts](../tests/unit/x-stream.test.ts) | Tests associés de collecte, flux ou sécurité. |

### Modifications

| Fichier | Rôle ou modification |
| --- | --- |
| [.env.example](../.env.example) | Paramètres de collecte commentés, défaut désactivé et aucune clé réelle. |
| [.github/workflows/x-foundation.yml](../.github/workflows/x-foundation.yml) | Diagnostic du worker ajouté à la CI. |
| [README.md](../README.md) | Documentation et bilan de la phase 3. |
| [apps/api/x-runtime.ts](../apps/api/x-runtime.ts) | Exige 0006 ; flux attaché seulement avec borne vérifiée. |
| [docs/DATA_MODEL.md](../docs/DATA_MODEL.md) | Documentation et bilan de la phase 3. |
| [docs/DECISIONS.md](../docs/DECISIONS.md) | Documentation et bilan de la phase 3. |
| [docs/LIMITATIONS.md](../docs/LIMITATIONS.md) | Documentation et bilan de la phase 3. |
| [docs/PROVIDERS.md](../docs/PROVIDERS.md) | Documentation et bilan de la phase 3. |
| [docs/RUNBOOK.md](../docs/RUNBOOK.md) | Documentation et bilan de la phase 3. |
| [docs/SECURITY.md](../docs/SECURITY.md) | Documentation et bilan de la phase 3. |
| [package.json](../package.json) | Commande worker et format des nouveaux modules. |
| [packages/connectors/x/client.ts](../packages/connectors/x/client.ts) | Accès optionnel au flux via XProvider. |
| [packages/connectors/x/config.ts](../packages/connectors/x/config.ts) | Paramètres validés des collecteurs et du flux. |
| [packages/connectors/x/contracts.ts](../packages/connectors/x/contracts.ts) | Contrat XProvider enrichi sans rupture des méthodes REST. |
| [packages/connectors/x/demo.ts](../packages/connectors/x/demo.ts) | Curseur du simulateur et flux local. |
| [packages/db/migrations/manifest.json](../packages/db/migrations/manifest.json) | Empreintes de 0006, empreintes historiques préservées. |
| [packages/db/schema.snapshot.json](../packages/db/schema.snapshot.json) | Snapshot de la forme SQL actualisée et vérifiée. |
| [packages/db/schema.ts](../packages/db/schema.ts) | Nouvelles colonnes ORM générées depuis SQL. |
| [packages/shared/errors.ts](../packages/shared/errors.ts) | Erreur typée de bail périmé. |
| [packages/shared/http.ts](../packages/shared/http.ts) | POST contrôlé pour règles, sans redirection. |
| [tests/integration/v2-database.test.ts](../tests/integration/v2-database.test.ts) | Même contrôle de migration couvrant désormais les six versions, sans affaiblissement des invariants. |
| [tsconfig.json](../tsconfig.json) | Modules de collecte/worker inclus dans les types stricts. |
| [vitest.config.ts](../vitest.config.ts) | Couverture élargie collecteurs/flux. |
| [vitest.db.config.ts](../vitest.db.config.ts) | Suite et couverture persistance/recherche élargies. |
