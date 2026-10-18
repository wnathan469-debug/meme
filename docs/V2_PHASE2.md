# V2 — phase 2 : migrations et persistance

Phase 1 validée, phase 2 demandée par l'utilisateur. Quatre migrations additives prêtes et testées sur PostgreSQL 16 ; **33 tables V1 conservées, 22 nouvelles tables, soit 55 tables applicatives**, plus le registre technique des migrations. Aucun déploiement ni migration de données utilisateur effectué. L'application Windows publiée reste la démo 0.1.0.

## Ce qui est livré

| Migration | Ajouts |
| --- | --- |
| 0002_x_identity_collection | x_users, x_username_history, x_posts, x_post_metrics_history, x_rules, x_collection_runs, x_post_rules, x_post_collections, x_collection_checkpoints |
| 0003_people_conversations | person_categories, tracked_people, conversations, x_post_references |
| 0004_social_chart_evidence | post_token_mentions, post_event_links, token_chart_markers, price_candles ; premiers indices sociaux sur tokens |
| 0005_provider_controls_alerts | provider_status, provider_budgets, x_cost_reservations, x_reservation_budgets, x_usage_ledger ; nouveaux types de règles, résumés et limites de fréquence sur règles/alertes |

Toutes les nouvelles tables ont origine non nulle indexée, UUID, marqueur de connaissance, dates et trigger d'actualisation ; chaque FK métier inclut l'origine. Les IDs fournisseur restent des chaînes et les identités X sont immuables. Les publications non récupérées peuvent rester des références externes ; une conversation peut manquer de racine, et son taux de couverture inconnu reste null. Les parents absents ne sont pas inventés comme publications observées. Les associations règles/collectes permettent de rattacher une même publication à plusieurs découvertes sans dupliquer son identité.

Les bougies utilisent NUMERIC exact et des invariants OHLC, avec une pool de liquidité déjà connue pour ce token. Un marqueur de pool doit correspondre au même token. Les références JSON de publications sont typées et contrôlées ; elles ne peuvent mélanger DEMO/REAL. Les trois tables privées x_rules, person_categories et tracked_people appliquent RLS forcée selon utilisateur et origine. Les catégories ne peuvent être attribuées à la personne d'un autre utilisateur.

## Lanceur versionné et retours arrière

`npm run db:migrate` remplace le point d'entrée V1 pour les nouvelles opérations. Il vérifie tous les fichiers up/down contre le manifeste SHA-256 avant connexion, puis les empreintes et l'ordre du registre appliqué. Un verrou de session commun à V1 et V2 sérialise les migrateurs. Chaque montée est transactionnelle, avec inscription du checksum dans la même transaction ; les erreurs sont expurgées. Une version inconnue, une empreinte modifiée ou un trou dans le registre bloque l'opération.

Le registre V1 historique ne contenait aucune empreinte : son adoption n'est autorisée que pour l'unique version 0001 avec 33 tables d'origine. Son empreinte est enregistrée à partir du fichier initial inchangé. Cela suppose une base V1 de confiance ; cela ne prouve pas rétrospectivement l'absence de modifications manuelles. Sauvegarder et examiner une base V1 administrée hors procédure avant adoption. Les fichiers 0001 up/down restent strictement inchangés.

Le retour V2 → V1 conserve les tables et données V1. Il verrouille les tables concernées, refuse toute suppression de ligne V2 ou de champ V2 renseigné et effectue **toutes les étapes du retour dans une seule transaction** : un refus tardif remet aussi les étapes précédentes en état. Aucune option de suppression forcée de données V2 n'est fournie. Les vérifications des tables privées utilisent row_security=off : si le rôle ne peut pas les examiner, PostgreSQL refuse au lieu de masquer les lignes. Le rôle administratif de migration doit donc disposer des droits nécessaires, séparément du rôle applicatif.

Le script historique `packages/db/migrate.sql` reste un outil de bootstrap V1 pour son banc original ; il ne met pas à niveau V2 et n'est plus la commande opérateur recommandée. `rollback.sql` refuse désormais toute destruction du schéma si des migrations V2 sont inscrites. Ne jamais exécuter directement les fichiers .up/.down sur une base réelle : passer par le lanceur versionné.

## Usage opérateur, côté serveur uniquement

Injecter `DATABASE_URL` dans l'environnement sécurisé du serveur, avec le rôle de migration pour ces commandes. Ne pas coller de mot de passe dans le terminal enregistré ou la conversation. Le script ne charge pas automatiquement `.env` et ne crée pas les bases. Le transport TLS suit la configuration PostgreSQL du déploiement, sans option de désactivation de vérification ajoutée.

```bash
npm ci
npm run db:migrate
# Répétable : une base à jour ne reçoit aucune nouvelle application.

# Retour conservateur jusqu'à V1, seulement si toutes les données V2 sont absentes :
npm run db:migrate -- --rollback --target=0001_initial
```

Un retour partiel est possible avec un nom exact du manifeste. Une cible antérieure donnée sans `--rollback` est refusée. Le lanceur ne supprime jamais la migration 0001. Il ne met pas à jour automatiquement une base au démarrage du runtime.

Arrêter les collecteurs avant mise à niveau et garder un seul modèle de comptabilité actif : ne pas mélanger workers phase 1 (compteurs Redis) et phase 2 (PostgreSQL). Aucun worker de collecte réel n'est livré ni actif dans ce projet. Des compteurs Redis externes éventuels ne sont pas importés automatiquement ; un rapprochement explicite serait nécessaire avant activation.

## ORM aligné au SQL

`schema.ts` définit les **56 tables techniques/applicatives** et toutes leurs colonnes, nullabilité, valeurs par défaut et colonnes générées, par introspection d'une base jetable migrée. Les types NUMERIC/domaines monétaires restent des chaînes exactes ; les bigint restent des bigint. `schema.snapshot.json` conserve la forme vérifiée ; `schema-tools.ts` permet de la contrôler. `client.ts` compose Drizzle et prépare un contexte utilisateur transactionnel.

Le SQL demeure l'autorité pour les FK, contraintes, index, triggers, domaines et politiques RLS. Ils ne sont volontairement pas recopiés dans un second générateur DDL. **Ne pas utiliser drizzle push/generate pour remplacer ces migrations**. Le schéma ORM sert aux requêtes et aux types. Toute modification SQL future exige une nouvelle migration et une régénération sur base de test :

```bash
# DATABASE_URL doit désigner une base jetable déjà migrée.
npm run db:schema              # lecture et contrôle, sans modifier la base ni le fichier
npm run db:schema -- --write   # actualise les deux fichiers générés du dépôt
```

Drizzle 0.45.4 (Apache-2.0), pg 8.23.1 (MIT), types pg en développement : versions exactes dans le lockfile et notices ajoutées. Aucun Drizzle Kit ni mécanisme de migration concurrent supplémentaire.

## Comptabilité durable et coordination

Le runtime réel exige désormais **PostgreSQL migré + Redis**, en plus de la clé, de la grille vérifiée et des plafonds. Il ne retombe jamais sur des budgets mémoire/Redis si PostgreSQL manque. DEMO et le diagnostic hors ligne ne connectent aucun des deux services.

PostgreSQL devient l'autorité des plafonds et coûts : réservation atomique de l'ensemble des plafonds sous verrou de compte, montants exacts, règlement idempotent, journal durable unique par origine/espace/requête. Le registre d'intention est écrit avant transport, avec endpoint/fonctionnalité et coût maximal. Les réservations non réglées restent comptées après arrêt ; `expires_at` n'est pas une autorisation de remboursement automatique. Une interruption entre règlement et écriture du journal conserve le coût réglé et l'intention ; le rapprochement administratif des entrées incomplètes reste à ajouter avant déploiement de collecteurs.

Le journal n'accepte qu'un coût correspondant à une réservation réglée du même espace et de la même origine, avec les métadonnées d'intention quand elles sont présentes. Une réservation déjà réglée ne peut changer de coût, et ses ancres sont immuables. Une erreur de PostgreSQL interrompt l'appel avant transport ; chaque reprise repasse par le même contrôle. Aucun coût réel ni facture X n'est attesté : la grille reste une estimation configurable.

Redis conserve les quotas, temporisations, coupe-circuits et capacités de la phase 1. Sa perte peut perdre ces observations transitoires, mais ne remet plus à zéro les budgets PostgreSQL. Les fonctions monétaires du RedisControlStore restent disponibles pour les anciens tests de contrat ; elles ne sont plus utilisées par la composition live. Les snapshots provider_status et collectes/checkpoints ont leur schéma prêt, mais seront alimentés par les collecteurs des phases suivantes. Aucune purge automatique ni partitionnement non mesuré n'est activé.

L'application doit utiliser un rôle sans superuser/BYPASSRLS et des permissions minimales. `withUserContext` applique utilisateur/origine avec SET LOCAL et nettoie par COMMIT/ROLLBACK avant restitution au pool. Il ne remplace pas une authentification : le futur serveur doit autoriser l'identité avant de l'appeler. Les tests RLS utilisent un rôle non privilégié. Aucun compte utilisateur/serveur hébergé n'est créé par cette phase.

## Préférences et compatibilité Windows

`apps/desktop/preferences-v2.cjs` prépare la conversion validée de V1 vers `preferences-v2.json`. L'original et une copie exacte `preferences-v1.before-v2.json` sont conservés ; écriture temporaire synchronisée puis publication exclusive sans écrasement, même lors de conversions concurrentes. Fichier malformé, surdimensionné, lien symbolique ou sauvegarde contradictoire : conversion refusée et fichiers préservés. Les nouveaux réglages sont obligatoirement DEMO et collecte désactivée. Aucun secret ni note privée serveur n'est ajouté aux préférences.

Ce module sera **activé avec l'interface V2**, pas sur les chargements V1 actuels : cela évite de figer une ancienne copie V2 alors que l'utilisateur continue de modifier ses réglages V1. Le retour au logiciel V1 relit son fichier intact. La publication exclusive exige un système de fichiers prenant en charge les liens physiques (NTFS habituel sous Windows) ; un échec suspend la migration sans écrasement. L'essai Windows CI valide les fichiers et tests, pas une mise à niveau déjà installée sur le PC de l'utilisateur.

## Sauvegarde et restauration

Utiliser les outils de la même version PostgreSQL que la base, les variables libpq sécurisées et un répertoire privé. Arrêter les collecteurs et tester la restauration dans une **autre base vide** avant intervention. Les sauvegardes peuvent contenir notes privées et données historiques : accès restreint et chiffrement au stockage selon le déploiement.

```bash
pg_dump -Fc -f /chemin/prive/memeradar-avant-v2.dump
# Après création d'une base de restauration distincte et sélection via PGDATABASE :
pg_restore --no-owner --exit-on-error -d "$PGDATABASE" /chemin/prive/memeradar-avant-v2.dump
```

Le banc teste réellement pg_dump/pg_restore complets dans un autre PostgreSQL, puis relit versions/checksums, données V1, journal et budgets exacts. Cela valide le format et le parcours local, pas la rétention, le chiffrement ni le plan de reprise d'un hébergeur à choisir. Ne pas supprimer des lignes V2 pour faire passer un rollback : garder la sauvegarde et préparer une migration corrective.

## Vérifications exécutées

| Commande / vérification | Résultat cloud |
| --- | --- |
| `npm run build`, `npm run format:check` | Réussis |
| `npm test -- --coverage` | 112 tests réussis ; couverture du périmètre métier/transport/préférences : 96,44 % lignes, 92,68 % branches |
| `npm run test:redis` | 119 tests réussis, dont les 112 ci-dessus et 7 tests Redis réels |
| `npm run test:db:v2` | 20 tests PostgreSQL/Redis réussis ; couverture migrations/comptabilité/contexte : 94,01 % lignes, 87,23 % branches ; seuils 80 % |
| `npm run test:db` | 51 contrôles V1 avant/après rollback, reprise, erreur atomique et migrateurs concurrents |
| Contrôles V1 sur V2 | Les mêmes 51 assertions métier passent, avec nombre attendu de tables/triggers ajusté de 33 à 55, fichier V1 conservé |
| Playwright navigateur | 3 parcours existants réussis |
| Test shell Electron sous Xvfb | Isolation, préférences, presse-papiers, liens internes et réseau bloqué réussis |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnérabilité de production signalée |

Les tests distincts TypeScript sont **139** : 112 unitaires/contrats + 7 Redis + 20 PostgreSQL. Ne pas additionner une deuxième fois les 112 tests exécutés dans la suite Redis. Toutes les données de test sont inventées, aucune API X contactée. Les bases/conteneurs sont jetables, exposés seulement sur loopback pour les tests combinés, supprimés à la sortie. L'authentification trust est réservée à ces fixtures éphémères, jamais à un déploiement.

Cas vérifiés : V1 peuplée → V2 sans perte de token/quantité/règle/alerte ; base vide ; répétition/concurrence ; rollback compatible et refus atomique sur données V2/nouvelles alertes ; checksums modifiés, version inconnue et échec injecté sans tables résiduelles ; séparation des origines, IDs immuables, pseudonymes, réponses orphelines ; RLS et nettoyage du contexte ; contraintes OHLC ; 40 réservations simultanées limitées à 20 ; montants au-delà de 2^53 ; atomicité des limites par fonctionnalité ; journal idempotent ; refus avant X si base indisponible ; composition privée sans probe ; sauvegarde/restauration ; migration des préférences concurrente et conservation V1.

## Fichiers complets et suite

Les fichiers complets sont dans le dépôt. Les ajouts principaux se trouvent dans [packages/db](../packages/db), [migrations 0002–0005](../packages/db/migrations), [préférences V2](../apps/desktop/preferences-v2.cjs), [tests PostgreSQL](../tests/integration/v2-database.test.ts) et [tests préférences](../tests/unit/preferences-v2.test.ts). Le manifeste détaillé figure ci-dessous. Aucun fichier supprimé ; 0001 et l'interface V1 sont inchangés.

La phase 3 implémentera les collecteurs X, la déduplication applicative, la recherche et les filtres. Le schéma ne constitue pas ces fonctions ni un nouveau paquet Windows. Conformément au document V2, section 2 — « termine par un récapitulatif et attends ma validation » — cette phase suivante attend la validation du présent résultat.


## Manifeste détaillé des fichiers

### Créations

| Fichier complet | Rôle ou raison |
| --- | --- |
| [apps/desktop/preferences-v2.cjs](../apps/desktop/preferences-v2.cjs) | Conversion préparée, backup et publication exclusive, activation différée. |
| [docs/V2_PHASE2.md](../docs/V2_PHASE2.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [packages/db/client.ts](../packages/db/client.ts) | Drizzle et contexte utilisateur transactionnel. |
| [packages/db/migrations.ts](../packages/db/migrations.ts) | Lanceur versionné, empreintes, verrou et transactions. |
| [packages/db/migrations/0002_x_identity_collection.down.sql](../packages/db/migrations/0002_x_identity_collection.down.sql) | Retour conservateur de la migration, avec verrou et refus de perte. |
| [packages/db/migrations/0002_x_identity_collection.up.sql](../packages/db/migrations/0002_x_identity_collection.up.sql) | Migration additive ; contenu détaillé dans le tableau des quatre versions. |
| [packages/db/migrations/0003_people_conversations.down.sql](../packages/db/migrations/0003_people_conversations.down.sql) | Retour conservateur de la migration, avec verrou et refus de perte. |
| [packages/db/migrations/0003_people_conversations.up.sql](../packages/db/migrations/0003_people_conversations.up.sql) | Migration additive ; contenu détaillé dans le tableau des quatre versions. |
| [packages/db/migrations/0004_social_chart_evidence.down.sql](../packages/db/migrations/0004_social_chart_evidence.down.sql) | Retour conservateur de la migration, avec verrou et refus de perte. |
| [packages/db/migrations/0004_social_chart_evidence.up.sql](../packages/db/migrations/0004_social_chart_evidence.up.sql) | Migration additive ; contenu détaillé dans le tableau des quatre versions. |
| [packages/db/migrations/0005_provider_controls_alerts.down.sql](../packages/db/migrations/0005_provider_controls_alerts.down.sql) | Retour conservateur de la migration, avec verrou et refus de perte. |
| [packages/db/migrations/0005_provider_controls_alerts.up.sql](../packages/db/migrations/0005_provider_controls_alerts.up.sql) | Migration additive ; contenu détaillé dans le tableau des quatre versions. |
| [packages/db/migrations/manifest.json](../packages/db/migrations/manifest.json) | Empreintes immuables up/down des cinq versions. |
| [packages/db/schema-tools.ts](../packages/db/schema-tools.ts) | Introspection en lecture seule et génération du mapping. |
| [packages/db/schema.snapshot.json](../packages/db/schema.snapshot.json) | Forme SQL introspectée et vérifiée. |
| [packages/db/schema.ts](../packages/db/schema.ts) | Mapping ORM complet des colonnes, sans générateur DDL. |
| [packages/db/x-control-store.ts](../packages/db/x-control-store.ts) | Budgets et journal durables ; coordination Redis déléguée. |
| [scripts/db-migrate.ts](../scripts/db-migrate.ts) | Commande opérateur expurgée. |
| [scripts/db-schema.ts](../scripts/db-schema.ts) | Contrôle et régénération sur base de test. |
| [scripts/test-v2-database.mjs](../scripts/test-v2-database.mjs) | PostgreSQL/Redis jetables et nettoyage. |
| [tests/integration/v2-database.test.ts](../tests/integration/v2-database.test.ts) | 20 parcours de migration, intégrité, données privées, coûts et restauration. |
| [tests/unit/preferences-v2.test.ts](../tests/unit/preferences-v2.test.ts) | Migration concurrente, invalidité et downgrade des préférences. |
| [vitest.db.config.ts](../vitest.db.config.ts) | Suite SQL et couverture du contrôle durable. |

### Modifications

| Fichier complet | Rôle ou raison |
| --- | --- |
| [.env.example](../.env.example) | Connexion PostgreSQL privée documentée, sans secret. |
| [.github/workflows/x-foundation.yml](../.github/workflows/x-foundation.yml) | Tests PostgreSQL V1/V2 ajoutés à la CI. |
| [README.md](../README.md) | Avancement et commandes actuelles. |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | Licences pg et Drizzle. |
| [apps/api/x-runtime.ts](../apps/api/x-runtime.ts) | Composition live exigeant PostgreSQL migré et Redis ; diagnostic sans connexion. |
| [docs/DATA_MODEL.md](../docs/DATA_MODEL.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [docs/DECISIONS.md](../docs/DECISIONS.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [docs/LIMITATIONS.md](../docs/LIMITATIONS.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [docs/PROVIDERS.md](../docs/PROVIDERS.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [docs/RUNBOOK.md](../docs/RUNBOOK.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [docs/SECURITY.md](../docs/SECURITY.md) | Documentation actualisée ; bilan, exploitation ou décision de cette phase. |
| [package-lock.json](../package-lock.json) | Dépendances verrouillées et intégrité. |
| [package.json](../package.json) | Versions pg/Drizzle exactes et scripts de migration/contrôle. |
| [packages/connectors/x/client.ts](../packages/connectors/x/client.ts) | Endpoint dans l’intention de réservation durable. |
| [packages/connectors/x/config.ts](../packages/connectors/x/config.ts) | DATABASE_URL privée enveloppée dans Secret. |
| [packages/connectors/x/control.ts](../packages/connectors/x/control.ts) | Métadonnées d’intention ajoutées au contrat de réservation. |
| [packages/db/rollback.sql](../packages/db/rollback.sql) | Destruction V1 refusée en présence de V2. |
| [tests/integration/x-redis.test.ts](../tests/integration/x-redis.test.ts) | Composition sans base durable désormais refusée. |
| [tsconfig.json](../tsconfig.json) | Modules et tests DB vérifiés strictement. |
| [vitest.config.ts](../vitest.config.ts) | Couverture des préférences V2 ajoutée. |

