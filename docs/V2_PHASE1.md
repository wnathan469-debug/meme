# V2 — phase 1 : accès X privé et contrôles

L'audit phase 0 a été approuvé par l'utilisateur. Phase 1 implémentée le 18 octobre 2026 : contrat XProvider, client REST, fournisseur fictif, capacités observées, validation des réponses, transport sûr, quotas partagés, reprises et budgets exacts. Aucun appel réel à X, déploiement live ou changement d'interface Windows.

## Résultat vérifiable

- Le mode DEMO ne résout aucun DNS et n'appelle aucun fournisseur ; les nouvelles fixtures sont entièrement fictives.
- Sans clé, état « Accès X non configuré ». Sans tarif/plafond connu ou registre Redis, les appels payants sont refusés.
- Chaque tentative réserve son coût maximal, avec limites jour/mois et par fonctionnalité. Les appels concurrents partagent les mêmes contrôles ; erreurs après envoi comptées prudemment.
- Schémas Zod, IDs en chaînes, données absentes à `null`, détails d'erreurs fournisseur supprimés. Comptes protégés ou protection inconnue refusés pour les timelines.
- 401/403 mémorisent l'indisponibilité ; 429 respecte les délais annoncés. Reprises bornées avec gigue et coupe-circuit partagé.
- Diagnostic sans appel réseau, documentation de configuration et aucune clé intégrée dans le programme de bureau.

## Vérifications effectuées dans le cloud

| Vérification | Résultat |
| --- | --- |
| `npm run build` | Types stricts et compilation réussis |
| `npm run format:check` | Réussi |
| `npm run test:redis` | **115 tests réussis**, dont 7 tests d'intégration sur Redis 7.2 réel éphémère et 108 tests unitaires/de contrat |
| Couverture combinée, core + connecteurs X + shared | **96,11 % lignes, 91,79 % branches, 95,60 % fonctions, 94,83 % instructions** ; seuils globaux 80 % respectés |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | 3 parcours existants réussis |
| `DISPLAY=:102 npm run test:desktop` sous Xvfb | Réussi : isolation, IPC, préférences après redémarrage, presse-papiers, lien interne et réseau main/renderer bloqué |
| `npm run x:diagnose` | DEMO, 3 publications fictives, 0 appel réseau |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnérabilité de production signalée |

Le test du transport TLS utilise une socket simulée ; les tests SSRF injectent DNS et réponses. Les tests Redis vérifient réellement les scripts Lua, les accès concurrents de deux clients, les nombres au-delà de 2^53, les remboursements idempotents, les quotas, le coupe-circuit et la composition serveur sans probe X. Ils ne prouvent ni l'accès fournisseur ni la durabilité d'une future infrastructure Redis. Les dépendances de développement conservent les avis modérés de la chaîne de construction déjà documentés dans l'audit ; le bilan « 0 » concerne les dépendances de production.

## Fichiers livrés en entier dans le dépôt

Chaque chemin ci-dessous ouvre sa version complète. Aucun fichier supprimé. Aucun changement aux migrations existantes, aux préférences V1, aux fichiers de l'interface ou à l'installateur public 0.1.0.

### Créations

| Fichier | Rôle |
| --- | --- |
| [packages/shared/errors.ts](../packages/shared/errors.ts) | Erreurs typées et messages expurgés |
| [packages/shared/runtime.ts](../packages/shared/runtime.ts) | Secrets, horloge et événements techniques |
| [packages/shared/http.ts](../packages/shared/http.ts) | HTTPS, DNS épinglé, redirections, limites |
| [packages/shared/retry.ts](../packages/shared/retry.ts) | Reprises contrôlées |
| [packages/connectors/x/contracts.ts](../packages/connectors/x/contracts.ts) | XProvider, schémas, normalisation et provenance |
| [packages/connectors/x/config.ts](../packages/connectors/x/config.ts) | Configuration validée côté serveur |
| [packages/connectors/x/control.ts](../packages/connectors/x/control.ts) | Contrôles, estimation et réservations |
| [packages/connectors/x/redis-control.ts](../packages/connectors/x/redis-control.ts) | Atomicité Redis et calcul décimal Lua |
| [packages/connectors/x/client.ts](../packages/connectors/x/client.ts) | Client REST réel sans collecteur automatique |
| [packages/connectors/x/demo.ts](../packages/connectors/x/demo.ts) | Adaptateur fictif et erreurs simulées |
| [apps/api/x-runtime.ts](../apps/api/x-runtime.ts) | Composition privée, sans serveur HTTP |
| [scripts/x-diagnose.ts](../scripts/x-diagnose.ts) | Diagnostic hors ligne |
| [scripts/test-x-redis.mjs](../scripts/test-x-redis.mjs) | Redis de test local isolé, nettoyé après exécution |
| [vitest.redis.config.ts](../vitest.redis.config.ts) | Suite combinée avec intégration |
| [.env.example](../.env.example) | Variables documentées sans secret |
| [config/x-pricing.example.json](../config/x-pricing.example.json) | Grille inconnue, refusée tant que non complétée |
| [.github/workflows/x-foundation.yml](../.github/workflows/x-foundation.yml) | Vérifications Linux sans secret X |
| [tests/unit/x-http.test.ts](../tests/unit/x-http.test.ts) | Refus réseau DEMO et restrictions SSRF |
| [tests/unit/x-wire.test.ts](../tests/unit/x-wire.test.ts) | Validation des réponses transport, socket simulée |
| [tests/unit/x-client.test.ts](../tests/unit/x-client.test.ts) | REST, erreurs, quotas et absence de faux live |
| [tests/unit/x-control.test.ts](../tests/unit/x-control.test.ts) | Budgets exacts, concurrence, fenêtres UTC |
| [tests/unit/x-config.test.ts](../tests/unit/x-config.test.ts) | Fichiers opérateur et unités monétaires |
| [tests/contract/x-provider.test.ts](../tests/contract/x-provider.test.ts) | Contrat commun, capacités et démarrage |
| [tests/integration/x-redis.test.ts](../tests/integration/x-redis.test.ts) | Contrôles partagés sur Redis réel |
| [tests/fixtures/x/test-tools.ts](../tests/fixtures/x/test-tools.ts) | Horloge et transport déterministes |
| [tests/fixtures/x/posts.json](../tests/fixtures/x/posts.json) | Réponse synthétique complète |
| [tests/fixtures/x/partial.json](../tests/fixtures/x/partial.json) | Réponse partielle et erreur non fiable |
| [tests/fixtures/x/users.json](../tests/fixtures/x/users.json) | Comptes synthétiques |
| [docs/PROVIDERS.md](PROVIDERS.md) | Sources officielles consultées, tarifs inconnus et limites |
| [docs/V2_PHASE1.md](V2_PHASE1.md) | Bilan et manifeste de livraison |

### Modifications

| Fichier complet | Modification et raison |
| --- | --- |
| [package.json](../package.json) | ioredis, ipaddr.js, Undici et tsx épinglés ; scripts diagnostic, intégration et formatage |
| [package-lock.json](../package-lock.json) | Versions transitives et intégrité correspondantes |
| [tsconfig.json](../tsconfig.json) | Vérification stricte des nouveaux modules, scripts et tests |
| [vitest.config.ts](../vitest.config.ts) | Contrats et couverture élargie du transport et des contrôles |
| [README.md](../README.md) | Avancement réel V2 et commandes de vérification |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | Licences des nouvelles bibliothèques de production |
| [docs/DECISIONS.md](DECISIONS.md) | Audit approuvé, décisions sur transport et budgets |
| [docs/LIMITATIONS.md](LIMITATIONS.md) | Fonctions livrées et étapes encore nécessaires |
| [docs/SECURITY.md](SECURITY.md) | Frontière serveur, protection réseau et secrets |

## Suite et limites

La phase 2 ajoutera les migrations V2 et le journal de consommation durable. Les collecteurs persistants/streaming et leur priorisation sont la phase 3. Les pages personnes, conversations et analyses, les alertes visibles, le nouveau mode démo et l'interface suivent ensuite. Voir la séquence exacte dans [SPECIFICATION_V2.md](SPECIFICATION_V2.md), section 2.

Les paramètres de fréquence/stream futurs sont commentés dans `.env.example` et ne sont pas lus à cette phase ; aucun fonctionnement fictif n'est annoncé. Les montants utilisent explicitement MICRO_USD plutôt que des limites sans unité. Le retour de `getPostsByIds` contient aussi quotas, provenance et erreurs partielles, pour ne pas perdre ces informations.

Le téléchargement Windows public reste la démo 0.1.0 existante. Aucun nouveau paquet V2 n'est annoncé. Aucun Node.js, Docker ou Redis à installer sur le PC pour utiliser cette démo.

Conformément à la demande du document, section 2 — « termine par un récapitulatif et attends ma validation » — la phase 2 attend la validation de ce résultat concret.
