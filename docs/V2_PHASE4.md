# V2 — phase 4 : personnes suivies, catégories et notes privées

Phase demandée après la phase 3. Le code ajoute la gestion privée des personnes et une page **Personnes suivies** de démonstration, accessible par la navigation ou `#page=people`. Le paquet Windows 0.1.0 déjà publié reste la référence téléchargeable ; cette phase ne constitue pas une nouvelle livraison Windows V2. Aucun appel réel à X, aucune dépense fournisseur, aucun déploiement ni migration d’une base utilisateur.

## Utilisation de la page démo

Créer une catégorie, saisir `@demo_analyste_julie` ou `@demo_fondateur_marc`, puis choisir **Vérifier le compte**. La carte de confirmation présente une identité entièrement fictive ; l’ajout exige un second clic. Un pseudo absent des fixtures peut être ajouté explicitement sans validation, en pause et sans identifiant stable inventé.

Les fiches permettent modification du nom, catégorie, mots-clés, note privée et priorité, pause/réactivation et suppression. L’identité n’est pas remplacée par une simple modification de formulaire. Les doublons proposent un lien vers la fiche existante. Les catégories se créent, se renomment et se suppriment avec réaffectation vers une catégorie existante ou « Sans catégorie ».

Les publications intégrées sont les trois fixtures déjà présentes au socle X, désormais partagées avec le navigateur. Une fiche montre uniquement celles de son identifiant fictif : filtre texte/type, métriques connues ou inconnues, activité journalière/horaire UTC et comptages littéraux des mots-clés. L’instantané du 15 janvier 2026 est explicitement daté, partiel et indépendant d’une collecte réseau. Aucun lien fictif n’ouvre X. Une mention observée ne devient jamais une preuve de soutien ou de légitimité.

Les données de cette page sont sauvegardées dans le stockage local du profil sous `memeradar-demo-people-v2`, séparément des préférences V1. Elles survivent au rechargement et au redémarrage Electron. Elles sont validées à la lecture et à l’écriture ; un contenu illisible interdit l’écrasement automatique. Effacer les données de ce profil supprime ces fiches. Ce stockage est local, non chiffré par l’application, et n’est pas synchronisé avec le futur serveur privé.

## Service privé et identité

`PeopleService` se compose avec un dépôt lié à un propriétaire authentifié par l’hôte et à une seule origine. Le service n’authentifie pas un utilisateur et n’expose aucun serveur HTTP. L’ID de propriétaire ne doit jamais provenir d’un champ de formulaire non authentifié.

- Normalisation locale : espaces autour du champ, `@`, URL HTTPS d’un profil sur les seuls hôtes X/Twitter autorisés, casse. Les chemins de publication, destinations trompeuses, credentials, ports non standards, noms réservés, espaces internes et syntaxes invalides sont refusés sans réseau. Les URL de profil avec paramètres usuels sont acceptées ; les paramètres ne sont pas transmis au fournisseur.
- Le fournisseur reçoit uniquement le pseudo. Nom personnalisé, catégorie, mots-clés et note privée ne sont pas envoyés à X, à un LLM ou au journal fournisseur.
- Si le lookup est disponible, la réponse donne un profil à confirmer, pas une fiche déjà ajoutée. Ticket propriétaire/processus, usage unique, expiration cinq minutes, capacité bornée ; perdu au redémarrage. Une API future devra router ou persister ces tickets avant exposition multi-processus.
- Sans accès, ajout explicitement non validé, en pause. Lookup sans résultat : `not_found`. Refus d’accès ou budget : indisponibilité, sans prétendre que le compte est suspendu. Protection inconnue ou vraie : aucune activation de collecte.
- L’identité validée utilise l’ID stable, numérique en REAL et préfixé DEMO dans les fixtures. Les changements de pseudo observés sont historisés. Une résolution du même ID sous un autre pseudo renvoie la fiche existante, sans écraser ses notes ou ses choix.
- `preparePending(limit)` prépare un lot borné de validations différées, s’arrête en cas d’indisponibilité et renvoie des cartes à confirmer. La création de ces cartes n’active jamais automatiquement un nouveau suivi. Aucun ordonnanceur payant de validation n’est activé par défaut ; son branchement appartient à l’hôte privé configuré.

## Persistance, accès et collecte

`PgPeopleRepository` réutilise les tables et politiques RLS déjà migrées en phase 2 : **aucune nouvelle migration, aucune modification des empreintes SQL existantes**. Les transactions paramétrées filtrent propriétaire et origine même sur une connexion de test administrateur. Un verrou transactionnel par propriétaire sérialise les confirmations concurrentes et les modifications de catégories. La production exige un rôle sans superuser/BYPASSRLS ; les essais couvrent aussi ce rôle.

La réaffectation puis suppression d’une catégorie forme une transaction ; une catégorie étrangère est refusée. Supprimer une personne efface sa fiche/note courante et met en pause sa règle interne. Les observations publiques déjà enregistrées et leur provenance restent conservées ; les sauvegardes du stockage ont une rétention distincte et peuvent contenir une ancienne note.

Chaque personne validée possède une règle interne `kind=people`, exclue des recherches par mots-clés et du flux de veille. `PeopleCollector` interroge la timeline par ID stable, utilise le budget `people`, les baux/checkpoints transactionnels et la pagination bornée existants. Il ignore les personnes non validées, protégées, de protection inconnue ou en pause. Pause/suppression revérifiées avant chaque page ; une requête déjà envoyée ne peut être rappelée. Un refus interrompt le cycle, sans consommer le budget des priorités inférieures. Envoi, reprise et erreurs restent soumis aux gardes du client X.

Intervalles applicatifs par défaut, sans prétendre décrire les quotas X : critique 60 s, haute 300 s, normale 900 s, basse 3 600 s. L’estimation fournit une borne par cycle et par jour en micro-USD exacts, incluant pages/reprises et vérification publique du profil. Tarifs absents : estimation inconnue, jamais zéro implicite. La validation initiale est distincte de cette estimation ; les plafonds réels restent ceux du registre durable.

Commandes réservées à l’opérateur serveur, après configuration privée et autorisation du budget :

```bash
npm run x:collect -- --people --once
npm run x:collect -- --people --run
```

Sans argument, `--people` seul, ou avec collecte désactivée : diagnostic sans appel fournisseur. Les commandes existantes sans `--people` gardent la veille par mots-clés. Arrêt par SIGINT/SIGTERM ; aucune commande de développement n’est nécessaire à l’utilisateur de l’installateur Windows.

La composition privée expose `people`, `peopleCollector` et `peopleDetails(id)`. Le détail fournit au plus 1 000 publications disponibles visibles par le propriétaire, activité UTC, interactions brutes par publication, mots-clés comptés, mentions de tokens avec méthode, liens d’événements et 100 dernières exécutions/gaps. Les liens agrégés sont limités à 100 groupes. Limites et troncature sont explicites ; couverture partielle et publications manquées inconnues, sans extrapolation à toute l’activité du compte. Les filtres et curseurs de publications restent disponibles via la recherche locale avec `personId`. Les alertes de personnes restent indisponibles jusqu’à la phase 10 ; les associations automatiques événements/tokens appartiennent aux phases 6–7. L’interface serveur complète sera reliée en phase 12. L’import/export CSV est optionnel et non livré.

## Vérifications locales

- Construction TypeScript/Vite et formatage : réussis.
- 147 tests unitaires/contrats : réussis, couverture globale supérieure à 80 % sur lignes, fonctions, branches et instructions.
- PostgreSQL V2 : 42 tests réussis, dont huit nouveaux parcours personnes ; couverture globale supérieure à 80 % sur les quatre mesures. Migrations, restauration et référence V1 conservées.
- Référence SQL V1 : 51 contrôles avant/après rollback, échec atomique et concurrence réussis.
- Navigateur Chromium : quatre parcours réussis, dont confirmation, notes échappées, filtres des publications, pause, catégories, persistance et suppression sans requête externe.
- Shell Electron Linux : sandbox, IPC, préférences V1, note de personne après redémarrage, deep links, presse-papiers et refus réseau réussis. Cela ne remplace pas un essai d’installation sur un PC Windows.

Redis : les sept contrôles d’intégration passent dans la suite de 153 tests exécutée avant l’ajout du dernier test de capacité concurrente, lui-même validé dans les 147 tests unitaires finaux. Audit de production : zéro vulnérabilité. Diagnostics et commande `--people` seule : zéro appel fournisseur. Les résultats de CI distante sont consignés après leur exécution. Aucun résultat de fixture n’est présenté comme une vérification d’accès réel à X.

## Fichiers livrés

Sources nouvelles : `packages/people/model.ts`, `service.ts`, `collector.ts` ; `packages/db/people-repository.ts` ; `packages/connectors/x/demo-data.ts` ; `apps/web/src/People.tsx` ; tests `tests/unit/people.test.ts`, `tests/integration/people.test.ts` ; cette documentation.

Sources adaptées : `apps/web/src/main.tsx`, `style.css` ; `apps/worker/x-worker.ts` ; `packages/connectors/x/demo.ts` ; `packages/db/x-collection-repository.ts` ; `scripts/x-collect.ts` ; `tests/e2e/web.spec.ts`, `desktop.mjs` ; `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.db.config.ts` ; README, SECURITY, DECISIONS et LIMITATIONS. Aucune dépendance ajoutée, aucun fichier de données utilisateur supprimé.

La phase suivante est la **phase 5 — conversations**. Elle attend votre validation, conformément au cahier des charges V2.
