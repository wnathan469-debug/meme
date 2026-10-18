# V2 — phase 11 : Sources et API

La page **Sources et API** rassemble X, GeckoTerminal et GoPlus : état, capacités X, dates, quotas, journal technique nettoyé, consommation, budgets et fréquences. La navigation, les sources V1 et leurs cases d’inclusion sont conservées. Cette interface reste **une démonstration locale hors ligne** : les états, prix, coûts et réponses affichés sont fictifs. Aucun secret à saisir, appel fournisseur réel ou dépense réelle.

Le serveur privé dispose désormais d’un service de gestion et de contrôles PostgreSQL partagés. Il n’expose pas encore de route HTTP authentifiée et n’est pas raccordé au renderer : ce raccordement appartient à la phase 12. La release Windows publique 0.1.0 reste inchangée ; la livraison finale V2 relève de la phase 14.

## Parcours livré

- États **connecté, dégradé, en erreur, désactivé, non configuré**. Une configuration présente ne vaut pas test réussi. Une observation trop ancienne est dégradée ; un succès HTTP récent ne certifie ni couverture complète ni fiabilité des données. Le mode de collecte et l’intervalle minimum de l’hôte sont affichés.
- Matrice des capacités X : disponible, limitée, indisponible ou non testée, avec date d’observation ; les comptes protégés et données supprimées restent soumis aux droits du fournisseur.
- Dernier succès/échec, historique récent, code, nom logique d’endpoint et heure locale/UTC. Aucun corps d’erreur, URL contenant une requête, identifiant suivi, en-tête ou jeton n’est conservé dans ce journal. Les messages sont des libellés locaux associés aux codes.
- Quota restant/limite/réinitialisation quand observés, erreur 429 et attente avant reprise ; une valeur inconnue ne devient pas zéro.
- Appels, publications et estimation des coûts par jour/mois UTC. Les tarifs X sont explicitement fournis et datés par l’hôte. Mention affichée : **« estimation, à vérifier dans le tableau de bord du fournisseur »**. Les coûts réglés et engagements incluant les réservations restent distincts. Les coûts des fournisseurs publics sont inconnus, sans faux total gratuit.
- Réglages : activation, plafonds quotidiens/mensuels X, pourcentage d’avertissement, fréquence de chaque règle et des groupes de priorité, durées de cache. Plafonds par fonctionnalité visibles ; leur configuration serveur passe par le service privé, sans éditeur de secrets dans la page.
- Liens de documentation et de conditions des fournisseurs. Ils ne valent pas validation juridique ou contractuelle ; les protections actuelles d’Electron continuent de bloquer les ouvertures externes. Leur ouverture contrôlée relève de l’intégration suivante.

La démo propose les scénarios normal, quota atteint, budget atteint, flux déconnecté, erreur et X non configuré, ainsi qu’une horloge de diagnostic indépendante. Un test démo nécessite préparation puis confirmation et ne modifie que les compteurs fictifs. Les réglages et fréquences sont persistés sous `memeradar-demo-sources-phase11-v1`, séparément des préférences V1. Un stockage illisible est conservé et les écritures désactivées. Il n’existe pas de surveillance automatique en arrière-plan dans cette page.

## Service privé et test explicite

`PgSourceRepository(pool, authenticatedOwnerId, origin)` expose initialisation idempotente, lecture, sauvegarde avec révision, préparation/consommation d’un devis et fréquences des règles privées. `SourcesService` contrôle aussi la configuration et les autorisations réseau de l’hôte. `createSourcesRuntime` compose les adaptateurs ; `createXWorker` l’expose sous `sources`. Construire le runtime ou lire la page ne déclenche aucun test réseau. L’hôte doit appeler explicitement `initialize()` pour créer les contrôles, sans écraser les réglages existants.

Préparer un test crée un nonce durable, valable **deux minutes**, sans appel fournisseur ni réservation monétaire. Une confirmation le consomme sous verrou **avant** l’unique tentative. Rejeu, expiration, mauvais propriétaire ou changement de réglages : refus. Si la requête échoue, il faut préparer un nouveau devis ; aucune boucle de test automatique. La réservation effective revérifie les plafonds au moment de l’appel, y compris si un autre worker a consommé le budget entre préparation et confirmation.

Pour X REAL, l’hôte fournit explicitement `probeUsername`, un profil public à tester, en plus des prérequis serveur déjà vérifiés. Il n’est ni choisi silencieusement ni accepté comme URL arbitraire. Le test est au plus **une requête de profil, un utilisateur et zéro publication**, `maxRetries: 0`, avec plafond de coût `prix requête + prix utilisateur`. La composition standard du worker ne fournit pas de profil cible : ce test reste indisponible jusqu’à configuration explicite. Les capacités restent lisibles sans appel réseau.

Les tests publics consultent uniquement les métadonnées anonymes `/api/v2/networks` de GeckoTerminal ou `/api/v1/supported_chains` de GoPlus, sur hôte HTTPS fixe, sans redirection, avec limites de temps et taille. Devis monétaire local zéro pour cette tentative sans clé ; cela ne constitue pas un tarif garanti pour d’autres usages. Les quotas, politiques contractuelles et coûts éventuels doivent être vérifiés par l’opérateur. Le test contrôle la structure attendue avant d’enregistrer un succès. Les diagnostics des autres appels décrivent d’abord l’état du transport ; la validation métier reste assurée par leurs adaptateurs.

## Budgets et coordination

Les montants utilisent des **chaînes entières de micro-USD et BigInt** ; aucune conversion monétaire flottante. Le pourcentage d’avertissement ne permet jamais de dépasser le plafond. Un plafond nul interdit les appels dont le coût maximal serait positif.

Sauvegarde des plafonds et réservations X prennent le même verrou de compte, dans le même ordre. Une réduction sous les dépenses et engagements existants est refusée. Les changements sont relus par les workers avant chaque réservation, même s’ils conservent une ancienne configuration en mémoire. L’activation locale ne contourne pas l’interdiction réseau de l’hôte.

Ajouter un plafond par fonctionnalité reprend l’historique déjà imputé au budget global du même jour/mois, y compris les réservations en cours. Les réservations historiques sans fonctionnalité connue sont imputées conservativement au nouveau plafond. Leurs liens budgétaires sont ajoutés, permettant à un règlement ultérieur de rembourser aussi la nouvelle limite. Un plafond de fonctionnalité existant ne peut pas être retiré pour contourner le contrôle ; les nouvelles réservations sans fonctionnalité sont refusées lorsqu’un tel plafond est actif. Les réservations ambiguës restent engagées jusqu’au rapprochement, sans remboursement automatique.

X conserve ses contrôles Redis de cadence, quota, circuit, tentatives et délais. Les fournisseurs publics ajoutent une attente exponentielle avec gigue, respectent Retry-After/réinitialisation et partagent un coupe-circuit PostgreSQL. Après trois erreurs, une seule tentative de reprise peut prendre le bail de 30 secondes après l’attente ; un succès antérieur arrivé pendant une attente encore active ne la supprime pas. La borne existante de vingt tentatives/minute est conservée. Un timeout après envoi peut rester facturé ; aucune garantie de facture fournisseur n’est déduite de l’estimation.

Les fréquences éditées concernent les règles du propriétaire seulement, sans réactiver une règle en pause. Les modèles de priorité s’appliquent aux nouvelles règles et aux groupes explicitement modifiés. Les planchers de collecte de l’hôte restent prioritaires ; un checkpoint déjà planifié n’est pas artificiellement avancé et un appel en cours n’est pas annulé.

Caches configurables : devis de recherche X 60–3 600 s (ce champ ne désigne pas un cache de contenu de publications), profils X 0–300 s avec vérification des comptes protégés conservée, fenêtres de marché 0–86 400 s et résultats GoPlus 0–300 s. Un retour en cache conserve ses dates d’observation et sa qualité ; il ne devient pas une nouvelle collecte.

## Migration et accès

Migration additive **0012_provider_management** : **69 tables applicatives**, plus le registre ; douze versions. `provider_controls` stocke la politique non secrète, révision, attente/circuit et nonce de test ; `provider_diagnostics` conserve les observations techniques bornées et idempotentes. Versions 0001–0011 immuables, manifeste et ORM/snapshot mis à jour depuis PostgreSQL. Aucune base utilisateur n’a été migrée.

Les métadonnées de contrôle sont lisibles par les coordinateurs de confiance sans session utilisateur pour appliquer les plafonds. Elles ne doivent pas être exposées comme endpoint public : toutes les méthodes d’administration vérifient propriétaire et origine. Les écritures des réglages et la lecture du journal ont une RLS forcée ; les producteurs techniques n’insèrent que le schéma de diagnostic nettoyé. Un rôle applicatif sans superuser/BYPASSRLS est requis. Les secrets restent dans la configuration sécurisée existante, jamais dans ces tables ou DTO.

L’historique détaillé renvoie au plus 50 diagnostics récents, avec marqueur explicite de troncature ; les derniers succès/échecs et sommes de consommation proviennent de requêtes complètes, sans calcul à partir de cet extrait. La liste de règles refuse un dépassement de 200. Rétention/archivage restent à organiser par l’hôte. Le rollback refuse de détruire des réglages ou diagnostics existants.

## Fichiers et validation

Créés : `packages/sources/{model,service,transport,demo-data}.ts`, `packages/db/{source-repository,provider-budget-policy}.ts`, migration `0012_provider_management.{up,down}.sql`, `apps/api/sources-runtime.ts`, `apps/web/src/SourcesV2.tsx`, tests unitaires/PostgreSQL et ce document.

Modifiés : transports X/flux et contrôles durables, services de recherche et repositories des règles/personnes/marché/risques, composition API/worker, navigation/CSS, manifeste SQL et ORM/snapshot, cibles TypeScript/format/couverture, attentes de migration, parcours navigateur/Electron, README et documents modèle/décisions/sécurité/fournisseurs/exploitation/limites. Aucun fichier supprimé, aucune dépendance ajoutée.

Validation locale :

- `npm test -- --coverage` : **288 tests unitaires/contrats**, dont 25 nouveaux ; couverture globale lignes 95,89 %, branches 91,59 %.
- `npm run test:db:v2` : **104 tests PostgreSQL**, dont dix nouveaux ; concurrence, plafonds engagés, reprise de dépenses par fonctionnalité et remboursement, révision, nonce expiré/rejoué, diagnostic borné, RLS non-superuser/NOBYPASSRLS, fréquences et rollback. Couverture globale lignes 93,14 %, branches 84,74 %, quatre seuils à 80 % conservés. ORM comparé au snapshot généré.
- `npm run test:redis` : **295 tests**, soit les 288 précédents et sept contrôles Redis supplémentaires. Au total **399 tests TypeScript distincts** avec PostgreSQL.
- `npm run test:db` : **51 contrôles SQL V1**, migration/rollback, répétabilité et concurrence.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --trace retain-on-failure` : **13 parcours réussis**, dont deux nouveaux sur les sources ; confirmation unique, plafond trop bas refusé, quota, désactivation, persistance, stockage corrompu préservé et écran 390 px. Aucun appel externe détecté dans le nouveau parcours.
- `npm run test:desktop` sous Xvfb : test démo confirmé une fois, désactivation conservée après rechargement et protections Electron existantes vérifiées.
- Build/typecheck, format et `git diff --check` réussis ; diagnostics X/collecte sans appel réseau ; audit des dépendances de production : zéro vulnérabilité signalée.

Les passages intermédiaires ont permis de corriger le sélecteur de navigation après renommage « Sources et API », de contrôler le format des réponses avant le succès d’une sonde et de refuser une réservation sans fonctionnalité quand un plafond ciblé existe. Une collision entre répertoires temporaires de couverture PostgreSQL/Redis a été résolue en exécutant ces cibles successivement. Aucun test supprimé, seuil réduit, timeout augmenté ou retry ajouté.

Validations GitHub réussies sur le commit **b7812998cc6ae7ce79db682197e8a85410bd13a4** :

- [Linux — contrats, migrations, PostgreSQL, Redis, diagnostics et audit](https://github.com/wnathan469-debug/meme/actions/runs/39178039400).
- [Windows — tests, compilation native, installateur NSIS et ZIP vérifié après extraction](https://github.com/wnathan469-debug/meme/actions/runs/39178039371).

Les deux workflows sont terminés avec succès. L’artefact Windows est conservé par GitHub Actions pendant 14 jours. Le processus de publication a vérifié les empreintes puis conservé les fichiers immuables de la release publique 0.1.0, déjà existante : ces anciens téléchargements ne contiennent pas la phase 11. Aucun test fournisseur réel, tarif contractuel, compte protégé réel ou installation sur le PC utilisateur n’est annoncé comme validé. La génération d’un artefact Windows CI ne remplace pas un essai d’installation native sur ce PC.

Il reste **trois phases : 12 (interface/navigation), 13 (démo unifiée), 14 (validation et livraison finales)**.
