# Modèle physique PostgreSQL — référence V1 et évolution V2

**État actuel :** V2 ajoute les migrations 0002–0005, un lanceur à checksums, 22 tables et un ORM de requêtes. Voir [V2_PHASE2.md](V2_PHASE2.md) pour les commandes actuelles (`npm run db:migrate`), les sauvegardes et retours conservateurs. `migrate.sql` ci-dessous est le bootstrap V1 historique, pas la mise à niveau V2.

Le détail qui suit décrit la **référence V1** conservée. Statut V1 : migration et tests exécutés sur PostgreSQL 16. L'application et ses dépôts ne sont pas encore implémentés. Cette base vise le serveur décrit en phase 2 ; une distribution de bureau autonome nécessite une décision supplémentaire sur son stockage embarqué.

## Fichiers et exécution

- `packages/db/migrations/0001_initial.up.sql` : schéma complet commenté, types, 33 tables, index et triggers, dans une transaction.
- `packages/db/migrations/0001_initial.down.sql` : destruction explicite du schéma MemeRadar uniquement ; extension pg_trgm conservée.
- `packages/db/migrate.sql` : point d'entrée psql, verrou de session et registre de versions pour ne pas réappliquer la migration.
- `packages/db/rollback.sql` : retour arrière refusé sans confirmation explicite.
- `tests/integration/database.sql` : 51 assertions, toutes les données de test sont annulées par ROLLBACK.
- `packages/db/scripts/test-database.sh` : banc complet dans un conteneur PostgreSQL 16 jetable, sans réseau et sans port publié.

Depuis la racine du dépôt, avec Docker disponible :

```bash
bash packages/db/scripts/test-database.sh
```

Pour une base de développement existante, fournir la connexion via la configuration habituelle de libpq (PGHOST, PGPORT, PGDATABASE, PGUSER et mécanisme de mot de passe sécurisé), puis :

```bash
psql -X -v ON_ERROR_STOP=1 -f packages/db/migrate.sql
psql -X -v ON_ERROR_STOP=1 -f tests/integration/database.sql
```

Le rôle de migration doit pouvoir créer schéma et extension pg_trgm ; ne pas donner ces permissions au rôle applicatif futur. Ne jamais transmettre un mot de passe réel dans une commande enregistrée ou dans le dépôt.

Retour arrière **destructif**, uniquement sur une base jetable ou après sauvegarde vérifiée :

```bash
psql -X -v ON_ERROR_STOP=1 -v confirm_destroy_memeradar=true -f packages/db/rollback.sql
```

La migration SQL brute n'est pas idempotente ; utiliser `migrate.sql`. Les migrations déjà appliquées sont immuables : toute évolution ultérieure devra recevoir un nouveau numéro. Le registre conserve les versions, pas encore les checksums. Les tables applicatives sont dans le schéma `memeradar` ; qualifier les requêtes ou configurer un search_path contrôlé. Les fonctions de trigger fixent leur propre search_path.

## Inventaire des 33 tables

| Groupe | Tables et responsabilité |
|---|---|
| Accès | users, sessions : administrateur, hash Argon2id, empreintes de session et CSRF, expiration |
| Veille | sources, source_cursors, raw_items, entities, raw_item_entities, events, event_items : sources, reprise, extraits et regroupement |
| Suivi | attention_snapshots, watchlists, watchlist_items : séries et expressions de suivi |
| Blockchain | chains, tokens, official_contract_evidence, pools, token_event_links : identité et preuves d'association |
| Observations | market_observations, holder_snapshots, risk_findings, wallet_movements : marché et contrôles datés |
| Analyse | indicator_results, evidence_records, analysis_evidence : cinq indicateurs et liens de provenance |
| Alertes | alert_rules, alert_subject_states, alerts, notification_deliveries : règles, hystérésis/cooldown et livraisons |
| Exploitation | provider_calls, audit_log, app_settings, outbox_messages, processed_jobs : diagnostics, configuration et idempotence |

Le registre `schema_migrations` est une table technique supplémentaire, sans origine car il décrit le schéma, pas des données métier. Les comptes et paramètres nécessaires à chaque mode sont distincts.

## Invariants garantis en base

- Toute ligne applicative porte un UUID, une origine non nulle et indexée, un marqueur OBSERVED/CALCULATED/INTERPRETED, created_at et updated_at. L'origine est immuable ; updated_at est rafraîchi au changement.
- Chaque clé étrangère comprend data_origin. Une ligne DEMO ne peut référencer une ligne REAL, y compris via une table de liaison ou une preuve.
- Les quantités brutes utilisent NUMERIC entier sans borne de précision déclarée ; les montants utilisent NUMERIC exact, jamais FLOAT. NaN et infinis sont rejetés ; les pourcentages/fractions sont bornés.
- Un token est unique par origine, chaîne et identité d'adresse. La clé générée address_identity replie la casse EVM et conserve la casse Solana ; l'adresse affichée reste distincte de cette clé.
- Le mode REAL refuse les motifs factices ; le mode DEMO exige les formats factices documentés. Les colonnes URL de démonstration imposent `https://demo.memeradar.invalid/...` ; les autres URLs SQL imposent seulement HTTP(S), sans prétendre bloquer SSRF.
- Les snapshots d'attention et indicateurs ont exactement un sujet. Des index NULLS NOT DISTINCT empêchent les doublons malgré les colonnes sujet nullables.
- Les associations CONFIRMED nécessitent une preuve référant au même token, à sa chaîne et son adresse exactes, et à une publication de source A cohérente. Les ancres officielles référencées ne peuvent être déclassées ou modifiées sans retrait explicite des dépendances.
- Les valeurs marché absentes nécessitent un motif ; les indicateurs INSUFFICIENT_DATA nécessitent des entrées manquantes explicites. Un montant nul n'est pas une valeur zéro.
- Une alerte supprimée exige une raison. Empreintes, états règle/sujet, clés d'outbox, de livraison et de consommation sont uniques dans leur origine.
- En DEMO, les livraisons n'acceptent que le canal interne. Les garanties réseau appartiennent aussi au transport et au déploiement, pas seulement au schéma.

## Provenance et vérité des preuves

`entities.verified_contracts` est normalisé dans `official_contract_evidence`, plutôt qu'un JSON sans contraintes. Une preuve contient entité, token, chaîne, adresse exacte, source, publication, date et URL. Le trigger vérifie le niveau A et la cohérence de la publication ; une clé étrangère protège son rattachement à l'identité du token.

`evidence_records` conserve la source et les dates d'une observation, avec référence brute facultative, empreinte et état de purge. Lorsque la publication est liée, sa source doit correspondre. `analysis_evidence` relie par clés étrangères une preuve à exactement un résultat (association, indicateur, risque, marché, détenteurs, mouvement ou alerte). Les JSON d'explication restent complémentaires ; ils ne remplacent pas ces liens.

La base ne peut pas prouver qu'un site est réellement officiel ni que le texte contient l'adresse : `exact_address_published` est une assertion issue d'une extraction vérifiée ou d'une revue. Le moteur de phase 7 vérifiera également que l'entité officielle correspond au sujet de l'événement. Un administrateur SQL privilégié peut contourner les règles ; l'application ne doit pas utiliser ce rôle.

## Répartition base / application

La base assure formes simples, relations, unicités et domaines. L'application doit encore assurer : checksum EIP-55, validation Solana après décodage, compatibilité adresse/famille de chaîne, authenticité des sources officielles, JSON Zod détaillés (conditions ET/OU, preuves, facteurs, quiet_hours), timezone IANA, expurgation des secrets, distinction sémantique des marqueurs de connaissance et filtres de lecture par mode. Un préfixe Argon2id en SQL ne remplace pas la validation cryptographique du hash.

Les rôles d'exécution, permissions et dépôts seront livrés au socle ; aucune politique RLS n'est annoncée ici. Les bases séparées par mode et les dépôts filtrés restent requis. `outbox_messages.subject_id` et les cibles d'audit sont des identifiants de routage/historique, pas des liens métier : le consommateur vérifie existence et origine avant action. Les payloads et logs ne doivent contenir ni secret ni réponse brute sensible.

## Index et cycle de vie

Index : origine sur chaque table, clés étrangères, dates de publication/observation, historique des risques, détenteurs, mouvements et alertes ; GIN pg_trgm sur les titres ; empreinte SHA-256 et simhash pour candidats de déduplication ; index partiels sur tâches/livraisons en attente et extraits non purgés. L'index simhash traite l'égalité, pas la distance de Hamming. Le tuning et le partitionnement attendent la volumétrie mesurée.

Rétention proposée : extraits 30 jours, diagnostics fournisseur expurgés 14 jours. Purger le corps et la référence de payload en renseignant purged_at ; conserver l'ancre (source, URL, dates et hash) tant que des analyses la référencent. La suppression physique d'une source/preuve référencée est restreinte pour empêcher une perte silencieuse de traçabilité. Les sessions expirées et tâches traitées pourront être purgées selon une politique distincte ; ne pas supprimer les clés d'idempotence avant la fin de la fenêtre de rejeu.

Les jobs de purge, sauvegardes, migrations futures et permissions seront raccordés dans les phases de code/exploitation. Aucune purge automatique n'est encore exécutée.

## Validation effectuée

PostgreSQL 16, image Docker épinglée par digest dans le script : migration sur base vide, seconde application sans doublon, 51 assertions d'intégrité, refus du rollback non confirmé, rollback confirmé puis réinstallation et mêmes 51 assertions, erreur injectée avant COMMIT sans schéma résiduel, et deux migrateurs concurrents avec une seule version appliquée. Le banc détruit ses conteneurs à la sortie et n'accède à aucun fournisseur.

Ces vérifications valident le schéma et le mécanisme de migration ; elles ne valident pas une application, des appels RPC, une authentification complète ou un installateur de bureau.


## Évolution V2 — phase 3

La migration additive 0006 ajoute l'état de reprise des collecteurs, baux clôturés par jeton, dates de coupure/état partiel et empreintes de texte/référence d'auteur non observé. Toujours 55 tables applicatives. Les migrations 0001–0005 restent immuables ; le lanceur et les tests couvrent maintenant la suite jusqu'à 0006 et le snapshot ORM correspondant. Voir V2_PHASE3.md pour la transaction d'ingestion, le devis de recherche et les limites du rattrapage.

## Évolution V2 — phase 5

La migration additive 0007 ajoute `conversation_views` et `conversation_authors`, soit 57 tables applicatives. Le compteur et la fenêtre sont propres à la vue du propriétaire ; le compteur partagé de la table historique `conversations` ne sert pas à annoncer sa couverture. Les auteurs ordinaires ont seulement une identité d’affichage dans cette conversation, sans fiche de profil globale créée automatiquement. Les FK incluent origine et propriétaire ; les deux tables ont une RLS forcée. SQL 0001–0006 immuable, manifeste étendu et ORM/snapshot régénérés puis comparés. Retour arrière refusé lorsque les nouvelles tables sont utilisées. Voir [V2_PHASE5.md](V2_PHASE5.md).

## Évolution V2 — phase 6

Migration additive 0008 : 60 tables applicatives. `event_watches`, `event_watch_rules` et `event_coverage_windows` définissent un périmètre privé révisé et des preuves par règle/date. `post_event_links` conserve les lignes publiques antérieures et ajoute propriétaire, configuration, révision et éléments privés pour les nouveaux liens. RLS forcée sur ces tables ainsi que les règles d’alerte ; les FK incluent origine/propriétaire et l’événement de la configuration. Les séries sont calculées dans le périmètre du propriétaire ; le snapshot d’attention partagé historique ne devient pas une couverture privée inventée. Versions 0001–0007 immuables, ORM régénéré depuis SQL, downgrade bloqué si les nouvelles données sont utilisées. Voir [V2_PHASE6.md](V2_PHASE6.md).


## Phase 7 — migration 0009

62 tables applicatives plus le registre. `post_token_mentions` reçoit propriétaire, version et preuve de source ; ses anciennes lignes globales sont conservées. `social_token_candidates` conserve l’extraction privée et les ambiguïtés ; `social_contract_attestations` lie une revue manuelle à la révision d’un événement, au token, à l’auteur et à la publication. Les FK préservent origine/propriétaire. Première apparition et nouvelles associations sont calculées dans les résultats privés, sans écraser les champs globaux historiques. SQL immuable 0001–0008 ; ORM/snapshot régénérés et contrôlés. Détails et bornes dans [phase 7](V2_PHASE7.md).


## Phase 8 — analyse et graphique

Migration 0010 : 66 tables applicatives plus le registre ; côté de prix/fournisseur sur pools, URL de bougie, fenêtres de cache/baux, observations de marché par pool, transactions et contrôle partagé des tentatives. FK token/pool/origine, exactitude décimale et rollback conservateur ; SQL 0001–0009 immuable, ORM/snapshot alignés. Voir [phase 8](V2_PHASE8.md).


## Évolution V2 — phase 9

Schéma inchangé : 66 tables applicatives, migrations 0001–0010 inchangées. risk_findings conserve les observations publiques normalisées sous evidence.phase9, avec source, URL, observation/récupération, couverture, échéance et limites ; checker_version sépare les sources par SHA-256. Acquisitions identiques idempotentes, conflit de contenu à même clé refusé. Lecture par token/chaîne/origine et instant, maximum 100 groupes de source/contrôle, dépassement explicite. Retour V1 conserve ces preuves. Voir [phase 9](V2_PHASE9.md).


## Évolution V2 — phase 10

Migration 0011 : 67 tables applicatives et onze versions ; alert_runtime_states lie règle, propriétaire et origine avec JSON borné et RLS forcée. alert_rules reçoit un type SQL additionnel transaction_activity et une clé propriétaire composite ; historique/livraisons/anciens états de sujet reçoivent des politiques de propriétaire, la politique existante des règles est conservée. alerts et notification_deliveries conservent les décisions et livraisons in-app idempotentes. Rollback refuse les données phase 10 ; anciens SQL immuables, ORM/snapshot régénérés. Voir [phase 10](V2_PHASE10.md).

## Évolution V2 — phase 11

Migration 0012 : **69 tables applicatives**, douze versions. `provider_controls` conserve réglages non secrets par origine/fournisseur/espace de compte, révision, circuit et nonce de test ; `provider_diagnostics` stocke un journal technique nettoyé, sans URL/query/secret/corps fournisseur. RLS des écritures de réglages et de lecture des journaux ; lecture technique de la politique pour les coordinateurs de confiance, sans exposition publique. Les plafonds X s’appuient sur les réservations/budgets existants, sous verrou commun ; ajout de limites par fonctionnalité avec reprise des engagements et remboursements ultérieurs. Rollback refuse les tables peuplées ; ORM/snapshot régénérés. Voir [phase 11](V2_PHASE11.md).
