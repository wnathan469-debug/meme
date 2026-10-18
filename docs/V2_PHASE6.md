# V2 — phase 6 : événements, attention et chronologie

La phase 6 enrichit les événements avec les publications X déjà collectées, une ligne de base avant le premier signal connu, des multiplicateurs et des interruptions visibles. La fiabilité de la source reste indépendante de la popularité. Les trois scénarios d’origine, leurs indicateurs et les préférences V1 sont conservés.

Aucun appel réel à X, aucune dépense, aucun déploiement ni migration d’une base utilisateur. L’installateur public 0.1.0 reste inchangé ; la nouvelle livraison Windows V2 attend la phase finale.

## Parcours dans la démo

Une carte **Nébula Mobile — chronologie enrichie** apparaît dans le tableau de bord et les événements. Les indicateurs agrégés des trois scénarios d’origine sont conservés et leur périmètre est précisé ; le nouveau scénario possède ses mesures distinctes. La route `#page=events&event=00000000-0000-4000-8000-000000000060` ouvre directement sa fiche.

Le scénario comporte **60 publications entièrement fictives**, dont les publications de la conversation partielle de phase 5, des préparatifs avant le signal, un compte officiel attesté dans la fiction et trois personnes suivies du scénario. Cette sélection dédiée ne remplace pas les trois fixtures de base du fournisseur X ; leur fusion complète avec les autres scénarios reste prévue en phase 13.

La fiche présente :

- Source de niveau A, communiqué original fictif et popularité observée séparée, sans assimiler le volume à la fiabilité.
- Ligne de base sur six tranches de cinq minutes, de T−30 à T0 ; première heure après le signal. Unité : publications uniques liées dans le périmètre, republications et types inconnus exclus.
- Graphique en barres et tableau : tranches inconnues hachurées, compte observé comme borne basse, multiplicateur indisponible dans les trous. Aucune interpolation. La tranche T+15 → T+20 est une interruption fictive ; T+45 → T+50 est partielle.
- Chronologie : premier signal connu, détection par l’application, première publication liée connue, première mention connue d’une personne suivie, création d’un token associé préenregistré et première mention exacte connue de celui-ci. Les dates de publication, d’observation et les dates de chaîne restent distinctes. Le lien est interprété, pas une causalité.
- Publications filtrables par texte et catégorie : officiel selon attestation manuelle, personne suivie dans le scénario, autre compte. Score, méthode, éléments et caractère interprété sont visibles. Aucun nom ou badge de vérification ne suffit à déclarer un compte officiel.
- Création de règles d’alerte par sujet, entreprise, personnalité, mot-clé ou hashtag, consultables dans **Alertes**. Le formulaire est également disponible dans les fiches des trois événements d’origine.

Les attestations de couverture de ce rejeu sont disponibles à **T+60**. Avant cela, des publications connues peuvent apparaître, mais aucun total comparable n’est prétendu. Le curseur temporel, les sources exclues et la timezone restent respectés. Une source X exclue produit une attention inconnue, pas zéro ; elle ne dégrade pas automatiquement la fiabilité du communiqué.

Les liens fictifs sont inactifs. Depuis la conversation, le filtre d’événement Nébula Mobile et les liens de ses publications mènent à la nouvelle fiche ; les associations sont calculées par texte, sans déduire un lien de token à partir d’un nom. Le token illustré est une association plausible explicitement préenregistrée dans les fixtures, avec dates et adresse fictives ; aucun contrat officiel ni preuve on-chain réelle n’est annoncé. Les autres tokens/graphiques du scénario complet attendent les phases suivantes.

## Service privé et rapprochement

`createXWorker` expose `events`, un `PgEventRepository` lié à un propriétaire et une origine. Il n’a aucun fournisseur réseau et n’envoie aucun terme privé, note ou contenu à X ou à un LLM. L’hôte doit authentifier le propriétaire avant de composer ce service ; aucun serveur HTTP public n’est livré.

```ts
const watch = await worker.events.configure(eventId, {
  terms: [{ kind: "phrase", text: "Nébula Mobile" }],
  ruleIds: [ownedCollectionRuleId],
});
await worker.events.rebuild(eventId);
const snapshot = await worker.events.read(eventId);
await worker.events.createAlert(eventId, {
  subjectType: "company", subject: "Nébula Mobile",
});
```

Les événements doivent déjà exister dans le registre d’actualités. Cette phase ne crée ni nouveau collecteur de presse ni moteur général de regroupement des nouvelles. `rebuild` rapproche uniquement les publications disponibles, reliées aux règles du propriétaire choisies, puis remplace transactionnellement ses liens calculés par cette version de méthode. Il est à appeler par l’hôte après une collecte ou lors d’une actualisation ; aucun job payant ni analyse en arrière-plan n’est activé.

`event-text-v1` normalise casse et ponctuation Unicode, recherche des expressions entières et des hashtags littéraux, et déduplique les éléments de correspondance. Les republications et types inconnus ne gonflent pas les mentions. Scores heuristiques : expression seule 0,55 ; hashtag seul 0,45 ; deux éléments 0,70 ; au moins trois 0,85. Ces scores ne sont **ni des probabilités ni une confirmation** d’un lien avec un token. Un texte ambigu peut rester un faux rapprochement. Aucun NER/LLM ou analyse sémantique n’est prétendu.

Les comptes officiels reposent sur des identifiants stables et des attestations manuelles explicitement renseignées avec URL et date de revue, pas sur un pseudo ou un badge. Le service valide leur forme et refuse une revue future ; il ne vérifie pas automatiquement le contenu de la preuve. Le libellé doit rester « officiel selon attestation manuelle ». Les suivis sont lus par ID du propriétaire. Les autres auteurs restent autres ou inconnus.

Les noms déjà fournis dans une conversation peuvent être réutilisés uniquement dans cette même conversation et pour son propriétaire, sans créer de profil global de commentateur. Aucune catégorie ou note privée d’une personne n’est copiée dans les cartes ou les preuves.

## Ligne de base, couverture et interruptions

Les séries sont calculées par **date de publication**, parmi les données connues à l’instant demandé. Une publication sans date ne reçoit pas une date inventée ; son absence de date est signalée dans le détail privé. Les doublons sont comptés une fois. La période actuelle ou future n’est jamais un total établi.

Une tranche n’est comparable que si **chaque règle** du périmètre dispose d’intervalles observés couvrant toute la tranche, sans segment partiel ou interruption. Les intervalles contigus sont fusionnés ; un trou même court empêche le calcul. Sans preuve de couverture, la valeur est inconnue et le nombre effectivement récupéré reste une borne basse.

La ligne de base exige toutes ses tranches comparables. Base manquante : multiplicateur inconnu ; base nulle : multiplicateur indéfini, jamais infini. Les multiplicateurs utilisent des entiers exacts pour le ratio et l’arrondi. La moyenne de base affichée est une mesure descriptive de publications par tranche, pas une somme financière. Une baisse n’est interprétable que dans des périodes comparables ; aucun soutien ou succès commercial n’en est déduit.

`recordCoverage` enregistre des preuves bornées par règle, révision et dates, avec statut, méthode et raison. Les méthodes actuelles sont **operator_verified** et **demo_fixture**, cette dernière interdite en REAL. Les périodes futures sont refusées. La date d’enregistrement est conservée : une preuve ajoutée plus tard n’établit pas rétroactivement ce que l’application savait lors d’un ancien instant de lecture.

Ce service ne transforme pas automatiquement une requête terminée en preuve d’exhaustivité. En REAL, une fenêtre de publication ne doit être déclarée observée par l’opérateur que si les pages, limites et lacunes du périmètre sont effectivement vérifiées. En l’absence de cette procédure, la série reste inconnue. Même une fenêtre observée ne représente pas tout X.

Les exécutions échouées, interrompues ou partielles des collecteurs apparaissent séparément avec leur mode, dates et code d’erreur. Elles sont datées par **heure de collecte**, ce qui n’est pas une preuve de couverture par heure de publication. Le rattrapage historique ne doit pas confondre ces deux axes.

La configuration porte une révision et une copie de la requête de chaque règle. Modifier la configuration invalide les anciennes fenêtres et liaisons pour la nouvelle révision. Une requête de collecte changée sans reconfiguration rend la base incomparable ; de nouvelles attestations sont refusées jusqu’à révision du périmètre. Les lecteurs de conversations, personnes et recherche masquent les anciennes révisions de liens.

## Chronologie et règles d’alerte

Les jalons utilisent uniquement des dates enregistrées. La première publication liée est une première observation connue dans ce périmètre, pas une preuve que rien n’existait auparavant. Les personnes suivies sont celles de la configuration actuelle ; aucun historique d’abonnement n’est inventé. Les timestamps avec offsets sont comparés par leur instant réel.

Les créations de tokens proviennent exclusivement de dates de chaîne déjà stockées pour des associations préexistantes. Les premières mentions de tokens utilisent les preuves exactes déjà enregistrées (`exact_address` ou URL de page de token résolue), accessibles au propriétaire. Un nom ou cashtag seul ne fournit pas ce jalon. Ce service ne crée aucune association token/événement et n’augmente aucun niveau en « confirmé ». Extraction et nouvelles preuves : phase 7 ; données de graphique : phase 8.

Les règles d’événement sont réellement enregistrables, avec leur sujet, événement et canal interne, mais **désactivées** jusqu’au moteur de phase 10. Aucune notification ne part. La démo sauvegarde ses règles sous `memeradar-demo-event-alerts-v2`, dans le profil local, sans modifier la règle d’attention V1 ; données locales non chiffrées, pas de synchronisation serveur. Une lecture incompatible interdit l’écrasement à l’enregistrement. La base privée utilise `alert_rules` et son état de sujet, isolés par propriétaire et origine.

## Migration 0008 et accès

Migration additive `0008_event_attention` : **60 tables applicatives**, plus le registre. Les versions 0001–0007 restent immuables. Ajouts :

- `event_watches` : critères, attestations manuelles et paramètres de période propres au propriétaire.
- `event_watch_rules` : règles de même propriétaire/origine, révision et requête de référence.
- `event_coverage_windows` : intervalles et preuves de couverture liés à ces règles.

`post_event_links` reçoit une portée propriétaire, révision, éléments de correspondance et une FK vers la même configuration/événement. Les anciennes liaisons publiques restent intactes. Les nouvelles liaisons ne révèlent pas les termes privés d’un utilisateur à un autre qui aurait collecté la même publication publique. Les dépôts de recherche, personnes et conversations appliquent explicitement ce filtrage, y compris sur les connexions administrateur de test.

RLS forcée sur les trois nouvelles tables, les liens et les règles d’alerte. L’accès exige un contexte utilisateur/origine ; le rôle applicatif doit être sans superuser/BYPASSRLS. Le propriétaire doit venir de l’authentification de l’hôte, pas d’un corps de requête. Requêtes paramétrées, textes échappés, pas d’accès réseau nouveau.

La reconstruction est plafonnée à 10 000 publications ; au-delà, elle refuse la mise à jour, sans remplacer silencieusement les résultats par un échantillon. La lecture privée porte sur le même plafond ; les interruptions visibles sont limitées aux 100 dernières. Le choix d’une pagination et d’un indexage plus large attend les mesures de volumétrie, sans prétendre traiter des volumes illimités.

Le retour arrière refuse la présence de configurations, fenêtres, liens privés ou règles d’événement de cette phase. Il ne supprime pas de données utilisateur. ORM et snapshot régénérés depuis une base jetable puis comparés au SQL migré.

## Vérifications

- Construction TypeScript/Vite et formatage : réussis.
- **161 tests unitaires/contrats**, dont sept nouveaux tests d’événements : réussis. Correspondances littérales, scores interprétés, base, ratios, périodes inconnues/nulles, fenêtres contiguës, doublons, horodatages avec offsets et exclusions de sources.
- **63 tests PostgreSQL V2**, dont neuf nouveaux tests d’événements : réussis. Idempotence, suivi de révision, requêtes changées, preuves futures refusées, liens exacts existants, identité minimale de conversation, règles privées et accès sans bypass RLS. Les 51 contrôles SQL V1 restent valides sur le schéma étendu et les migrations/rollbacks sont conservateurs.
- **Sept contrôles Redis** réussis ; tests unitaires partagés non comptés deux fois.
- **Six parcours navigateur Chromium** réussis : scénario d’événement, base/trou, catégories de comptes, règle persistante, filtre de conversation, source exclue, clavier et largeur 390 px sans requête externe ; parcours V1/personnes/conversations conservés.
- Shell Electron Linux : sandbox/IPC et blocage réseau, préférences V1 et notes persistantes, conversations et événement enrichi, création de règle locale : réussis. Un build natif ne remplace pas un essai d’installation sur le PC Windows de l’utilisateur.
- Référence SQL V1 : 51 contrôles avant/après rollback, échec atomique et concurrence réussis.
- Audit des dépendances de production : zéro vulnérabilité. Diagnostics sans appel fournisseur.

Seuils globaux de couverture inchangés à 80 % sur les quatre mesures, dépassés pour les cibles unitaires et PostgreSQL. Le modèle pur est mesuré dans la cible unitaire ; les dépôts sont mesurés sur PostgreSQL réel jetable. **231 tests TypeScript distincts** (161 unitaires/contrats, 63 PostgreSQL et sept Redis), auxquels s’ajoutent les parcours navigateur/Electron et les contrôles SQL.

CI sur le commit `c7eb8e59c7db710b8630e2f8d410e6be69f0e1f5` :

- [Linux — contrôles complets réussis](https://github.com/wnathan469-debug/meme/actions/runs/39141061052).
- [Windows — tests, compilation NSIS et vérification du ZIP réussis](https://github.com/wnathan469-debug/meme/actions/runs/39141061045). L’archive construite est conservée comme artefact de ce workflow pendant 14 jours ; la publication préserve les fichiers immuables de la version publique 0.1.0.

Ces validations ne constituent pas un essai d’installation sur le PC de l’utilisateur et ne publient pas une nouvelle version V2.

## Sources livrées et suite

Nouveaux : `packages/events/model.ts`, `demo-data.ts` ; `packages/db/event-repository.ts` ; migration `0008_event_attention.up.sql` / `.down.sql` ; `apps/web/src/EventInsights.tsx` ; `tests/unit/events.test.ts`, `tests/integration/events.test.ts` ; ce document.

Adaptés : composition API/worker ; modèle démo des conversations ; dépôts de conversations/personnes/recherche ; manifeste, ORM et snapshot ; pages événements/conversations/alertes et styles ; tests de migrations et parcours web/Electron ; configurations TypeScript/Vitest et formatage ; README, DATA_MODEL, SECURITY, LIMITATIONS, DECISIONS. Aucune dépendance ajoutée, aucun fichier utilisateur supprimé.

Prochaine étape après validation : **phase 7 — preuves sociales et liens avec les tokens**. Le branchement complet de l’interface au serveur, la démo unifiée et le nouvel installateur restent les jalons ultérieurs du plan approuvé.
