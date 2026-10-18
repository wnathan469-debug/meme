# Fournisseur X — socle V2, phases 1 à 3

## Périmètre et vérification

Le client REST est implémenté et testé sur réponses synthétiques. Il n'est pas encore branché à l'interface Electron. Aucune collecte, connexion X ou dépense réelle n'a été effectuée ; aucun abonnement, accès ou tarif n'est présumé. Le flux et les collecteurs de la phase 3 sont implémentés sur contrats simulés, sans droit X ni borne de facturation présumés. Voir [V2_PHASE3.md](V2_PHASE3.md) ; aucune connexion REAL au flux sans enveloppe contractuelle vérifiée.

Vérification des chemins le 18 octobre 2026 : paquet officiel **@xdevplatform/xdk 0.6.6**, code généré `dist/index.cjs`, dont le dépôt déclaré est [xdevplatform/xdk-typescript](https://github.com/xdevplatform/xdk-typescript). Le SDK a été consulté comme référence, pas ajouté aux dépendances. Autre source : [exemples officiels X](https://github.com/xdevplatform/Twitter-API-v2-sample-code/tree/99992dd773dd77f23cb4236edbb66a1210e248d0), `api-index.json`. Certains commentaires d'exemples utilisent « posts » alors que les routes générées utilisent encore `tweets` : le client suit les routes machine vérifiées.

La documentation `docs.x.com/llms.txt` était inaccessible depuis ce cloud (CONNECT 403). Les tarifs et droits du compte n'ont donc pas été validés. Avant activation, l'opérateur doit vérifier les conditions actuelles dans le portail X et renseigner sa grille ; aucune limite d'offre ni fenêtre de sept jours n'est codée en dur.

| Fonction | Chemin relatif à `https://api.x.com/2` |
| --- | --- |
| Recherche récente | `/tweets/search/recent` |
| Recherche historique | `/tweets/search/all` |
| Publications par IDs | `/tweets` |
| Compte par nom | `/users/by/username/{username}` |
| Comptes par IDs | `/users` |
| Publications publiques d'un compte | `/users/{id}/tweets` |
| Conversation | recherche récente avec `conversation_id:` |
| Citations | `/tweets/{id}/quote_tweets` |

`X_ENDPOINTS_CONFIG_PATH` peut fournir un JSON complet de remplacement avec les huit clés de `defaultEndpoints`. Pas de repli automatique vers une route devinée. Les noms, IDs et jetons de pagination sont encodés. Recherche : `next_token` ; timelines et citations : `pagination_token`. Les citations ne prennent pas `since_id`. Les exemples officiels Java historiques utilisent `tweet.fields`, tandis que certaines méthodes récentes du SDK génèrent `post.fields`. Le défaut reste `tweet.fields`, avec sélection explicite `X_POST_FIELDS_PARAMETER=post.fields` si le contrat vérifié le demande ; aucun essai automatique d'alias payant. Cette divergence n'est pas résolue par un appel réel dans ce cloud. Le champ choisi, `user.fields` et l'expansion `author_id` demandent uniquement les données publiques utilisées. Les messages privés, comptes protégés et métriques non publiques ne sont pas collectés. La timeline exige un compte explicitement public ; une protection inconnue bloque la collecte.

## Architecture et configuration

- `packages/shared/` : transport HTTPS, contrôle DNS/redirections, erreurs, horloge, masquage des secrets, journal technique et reprises bornées.
- `packages/connectors/x/` : contrats, normalisation, adaptateurs réel et démo, configuration, budgets et registres Redis/mémoire.
- `apps/api/x-runtime.ts` : composition privée, sans serveur HTTP ni tâche de fond. `MemoryControlStore` est réservé aux tests ; la composition live exige Redis et PostgreSQL migré à 0006.
- `.env.example` : chaque variable effectivement lue, unité et valeur par défaut. Ces variables appartiennent au serveur. Aucun préfixe `VITE_`, jeton dans le renderer, clé intégrée à l'installateur ou Docker imposé au PC.

`npm run x:diagnose` affiche la configuration et les capacités, sans connexion Redis ni X. Par défaut, il utilise le fournisseur DEMO. Le fichier `.env` n'est pas automatiquement chargé ; le futur déploiement injectera les variables côté serveur.

Les capacités déclarées ne prouvent pas les droits : elles restent `untested` jusqu'à une réponse valide. Une déclaration `false` interdit l'appel. Les 401/403 mémorisent `unavailable` sans nouvelle tentative. Les métriques observées sont disponibles, partielles ou indisponibles selon les champs reçus, jamais remplacées par zéro. La récupération d'une conversation demeure limitée ; aucune promesse d'exhaustivité. Les observations sont relues dans le registre à chaque demande ; il n'existe pas encore de tâche périodique de revalidation. Un changement d'abonnement exige une réinitialisation administrative de ces observations, sans effacer les budgets ; cette commande sera ajoutée avec l'exploitation serveur.

## Budgets et débit

Le prix est une **estimation configurable** : coût par requête + par publication + par utilisateur, exprimé en chaînes d'entiers de micro-USD, avec `currency: USD` et `verifiedAt` ISO. Un dollar = `1000000` micro-USD. Le modèle exige une borne supérieure conservatrice couvrant le contrat de facturation réel, y compris erreurs et nouvelles tentatives ; il ne prétend pas reproduire une facture X ni gérer une offre tarifaire inconnue. Le fichier exemple contient `null`, volontairement refusé tant qu'il n'est pas complété.

Avant chaque tentative réseau, une réservation atomique couvre le maximum de publications et d'utilisateurs autorisé par la requête. Les plafonds jour/mois UTC globaux et par fonctionnalité sont vérifiés ensemble. Depuis la phase 2, les calculs monétaires utilisent BigInt côté TypeScript et NUMERIC exact dans PostgreSQL, sans conversion en nombre flottant. Les contrôles Lua monétaires de la phase 1 restent testés mais ne servent plus au runtime réel. Chaque nouvelle tentative réserve à nouveau. Tarifs/plafonds inconnus, PostgreSQL/Redis indisponibles ou budget atteint : appel refusé. Au seuil configuré, un événement technique `budget_warning` est émis ; l'alerte visible et les priorités de collecte arrivent dans les phases suivantes.

Une réponse valide réduit la réservation au coût calculé. Un échec certain avant envoi est remboursé ; un timeout, statut d'erreur ou résultat non conforme après envoi reste facturé à la borne réservée. Les réservations abandonnées ne sont pas automatiquement remboursées, car le fournisseur peut avoir facturé l'appel. Le règlement est idempotent. Un changement de plafond dans une période déjà ouverte est refusé, afin d'éviter des plafonds contradictoires entre workers ; l'édition administrative sécurisée relève de la phase 11.

Les budgets et réservations sont durables dans PostgreSQL ; quotas, délais et coupe-circuits sont partagés par espace de facturation Redis. Tous les workers et fonctionnalités d'un même compte doivent utiliser le même `X_CONTROL_NAMESPACE`. Recherche récente et conversations partagent la même route et le même compteur. Les quotas viennent exclusivement des en-têtes : une absence reste inconnue ; zéro reste épuisé. Les réponses concurrentes ne peuvent pas augmenter le restant de la même fenêtre. Une 429 respecte le plus grand délai de `retry-after` et de la réinitialisation annoncée. Sans en-tête exploitable, une attente locale de 60 secondes est appliquée ; ce n'est pas une affirmation sur le quota X. Si l'attente excède le maximum automatique configuré, l'appel rend une erreur et conserve le délai partagé. Reprises avec gigue bornées, aucune reprise 401/403, coupe-circuit et une seule sonde après ouverture.

PostgreSQL est désormais l'autorité durable pour `provider_budgets`, les réservations et `x_usage_ledger`. Les écritures sont transactionnelles, uniques par origine/espace/requête, et les réservations non réglées ne sont pas remboursées automatiquement. Le runtime refuse l'activation sans base migrée à 0006. Le journal Redis provisoire de la phase 1 n'est plus utilisé par la composition live ; le journal SQL n'est pas tronqué à 10 000 entrées, seule sa lecture actuelle est bornée. Une perte Redis peut perdre les quotas/capacités transitoires mais ne réinitialise pas les budgets. PostgreSQL et Redis doivent rester privés avec persistance et sauvegardes adaptées. Détails de migration, séparation des rôles, limites et tests de restauration : [V2_PHASE2.md](V2_PHASE2.md). Les collecteurs privés sont livrés mais ne démarrent pas automatiquement ; collecte désactivée par défaut.

## Transport et données non fiables

Le mode DEMO refuse les appels avant résolution DNS. Le transport réel autorise uniquement HTTPS vers l'hôte X configuré ; refuse IP littérales, destinations privées/réservées, réponses DNS mixtes et redirections vers une autre origine. Chaque résolution est vérifiée puis épinglée au socket pour empêcher un changement DNS. Délais, redirections et octets sont bornés, TLS reste vérifié, encodages compressés refusés. Les réponses passent par Zod et les erreurs brutes ne sont pas propagées.

Les textes X restent des chaînes non fiables, sans exécution ni rendu HTML. Les IDs sont des chaînes ; champs absents et métriques absentes restent `null`. Les détails d'erreurs fournisseur sont supprimés. Les traces contiennent seulement type d'événement, nom logique de route, code, statut, tentative et identifiant de requête ; aucun en-tête, requête de recherche, texte, jeton ou URL Redis. Les liens éventuellement présents dans les données ne sont pas suivis par ce client.

Les fixtures `tests/fixtures/x/` sont entièrement fabriquées : noms et adresses `.invalid`, IDs numériques de 21 chiffres uniquement pour tester le contrat réseau, jamais utilisés pour joindre X. Les fixtures de l'adaptateur DEMO utilisent exclusivement des IDs `DEMO_*`. Les fautes simulées sont des erreurs typées explicites ; elles ne sont pas présentées comme du réel.

La conformité de stockage, la suppression/indisponibilité périodique et l'attribution dans la nouvelle interface restent à implémenter avant collecte live (collecteurs et interface des phases suivantes). Ce socle ne collecte ni ne redistribue de contenu réel.


## Collecte et recherche — phase 3

Worker privé, polling/flux bornés, recherche gratuite locale et devis préalable aux recherches API, pagination/fencing/idempotence et vérification d'indisponibilité sont détaillés dans [V2_PHASE3.md](V2_PHASE3.md). Les quotas d'offre et tarifs restent à vérifier dans le compte X. La limite logicielle de flux ne suffit pas à garantir la facture : sans borne contractuelle vérifiée, le flux REAL n'est pas proposé par le runtime. La démo demeure isolée et n'affiche pas « en direct ». Les nouvelles vues et l'exposition authentifiée ne sont pas livrées dans l'installateur actuel.
