# V2 — phase 8 : analyse du token et graphique financier

La phase 8 ajoute une page d’analyse identifiée par **chaîne et adresse**, des bougies OHLC, le volume, le choix du pool, des observations de liquidité/capitalisation et des transactions datées. Les événements, cartes, règles, préférences et dialogues V1 restent conservés.

Le parcours livré dans l’application est **une démonstration hors ligne** : aucun prix, échange ou pool réel n’est annoncé. Aucun appel fournisseur réel n’a été effectué, aucune dépense, aucune transaction crypto, aucun déploiement et aucune migration d’une base utilisateur. L’installateur public 0.1.0 reste inchangé ; la livraison publique V2 attend la phase finale.

## Utilisation dans l’application

**Ouvrir le graphique** est disponible sur les lignes de tokens V1, leurs fiches, les cartes d’association des événements, les cartes de preuves sociales V2, les mentions exactes de l’événement enrichi et les mentions de tokens de la conversation. La neuvième entrée **Analyse token** explique comment choisir une identité lorsqu’aucun token n’est sélectionné.

La route interne est `/tokens/{chaîne}/{adresse}`, portée par le fragment pour le shell Electron et le serveur statique. Exemple fictif :

```text
#/tokens/base/0xDEMO000000000000000000000000000000000042?interval=5m&range=1h
```

Ce fragment correspond au chemin identitaire, sans changer les anciennes routes `#page=tokens&token=…`. Chaîne/adresse invalide : erreur explicite, aucun fournisseur appelé. Adresse valide mais absente du registre : aucune donnée connue ; jamais de substitution par le symbole. Paramètres d’intervalle, plage, pool et simulation sont conservés dans le lien et après rechargement.

La page présente :

- Nom, symbole, chaîne, adresse complète avec copie vérifiée par IPC dans Electron, niveau d’association et drapeaux disponibles, avertissement financier.
- Bougies ouverture/haut/bas/clôture et histogramme du volume en USD. Survol : valeurs exactes et aperçu des marqueurs. Clic : aperçu du marqueur, puis lien explicite pour ouvrir l’élément. Une liste et un tableau accessibles fournissent les mêmes données sans dépendre du canvas.
- Intervalles 1 min, 5 min, 15 min, 1 h, 4 h et 1 jour ; plages 1 h, 6 h, 24 h, 7 jours et depuis la création. Une granularité trop longue ou une période sans données affiche cette absence, sans inventer de bougies.
- Choix du pool ; sélection initiale par liquidité connue la plus élevée, puis adresse pour départager. Une liquidité inconnue reste différente de zéro. Le prix dépend du pool ; le pool secondaire du scénario illustre un prix distinct.
- Dernière clôture connue, variation et volume de la plage. Une plage avec trous ne produit pas de variation ou de volume total prétendument complet ; la somme des volumes récupérés est affichée séparément.
- Observations datées de liquidité, sans ligne interpolée ; historique de capitalisation estimée et méthode.
- Liste d’achats/ventes avec heure, montant USD, quantité de tokens, adresse abrégée si connue. Les compteurs indiquent les transactions **récupérées**, pas l’ensemble des échanges.
- Marqueurs : événement associé, mention exacte, création de pool, alerte historique préenregistrée et changements calculés. Les marqueurs sociaux sont retirés si la source X est exclue. La simulation ne démarre pas le moteur d’alertes de phase 10.
- Sources, dates de récupération, timezone préférée et états partiel, sans pool, fournisseur indisponible, données anciennes et sources incohérentes.

Le jeu de marché est dédié à cette phase et explicitement distinct des instantanés V1. Les séries sont entièrement fictives. Elles ne remplacent pas les prix/liquidités historiques des cartes V1. Pour Nébula Étincelle, la création est à T+8 ; les tranches T+15–20 et la minute T+45 sont absentes. Un volume de minute manque aussi. L’agrégation exige tous les enfants : une tranche de cinq minutes incomplète reste inconnue. Les tokens sans métadonnées/pool du scénario n’obtiennent pas de courbe inventée.

Le curseur temporel limite les publications, transactions et bougies aux connaissances de l’instant simulé. Les périodes futures/en cours restent absentes. Les créations futures ne sont pas affichées. Exclure la source de marché supprime les données correspondantes. Les URL fictives sont inactives et aucun navigateur externe n’est ouvert automatiquement.

Les contrôles de risque existants sont repris avec leurs sources/limites. Leur extension détaillée est la **phase 9**, pas une certification de sécurité livrée ici.

## Bibliothèque, rendu et précision

Ajout verrouillé : **lightweight-charts 5.2.1**, Apache-2.0, avec **fancy-canvas 2.1.0**, MIT. Bougies, histogrammes, défilement, zoom et marqueurs sont rendus localement ; aucun iframe, widget externe ou CDN. Le module graphique est chargé à la demande, séparé du bundle principal. Licences complètes/NOTICE inclus dans `licenses/`, mention dans `THIRD_PARTY_NOTICES.md`, attribution TradingView et lien requis visibles sur la page ; logo d’attribution activé. L’ouverture externe reste bloquée par les protections existantes du shell démo.

Les valeurs sources, le stockage, les comparaisons et les calculs utilisent des **chaînes décimales et BigInt**, avec jusqu’à 60 chiffres entiers et 36 décimales en entrée. La multiplication exacte conserve jusqu’à 72 décimales ; aucune conversion monétaire intermédiaire en `Number`. Les variations affichées sont arrondies à deux décimales, à mi-chemin à l’écart de zéro. Les décisions de seuil utilisent le **rapport non arrondi** : 19,995 % affiché 20,00 % ne déclenche pas un seuil réel de 20 %.

La projection en nombres JavaScript sert uniquement au dessin : valeur finie, au plus 15 chiffres significatifs, de 10⁻¹² à 10¹⁵ pour les valeurs non nulles. Hors bornes, le dessin est refusé et les chaînes originales restent consultables dans le tableau. L’axe est une projection, le survol/tableau conserve les valeurs originales ; le pas de dessin s’adapte à l’ordre de grandeur.

Les bougies sont validées (haut ≥ ouverture/clôture/bas, bas ≤ ouverture/clôture), alignées sur l’intervalle et dédupliquées. Une bougie n’est considérée clôturée que si sa récupération est postérieure à sa fin. Les repères sont rattachés à leur tranche, avec heure exacte dans l’aperçu/liste ; ceux sans bougie utilisent un repère distinct en haut du graphique, sans être déplacés sur une bougie voisine. Les tranches manquantes restent des espaces dans la série, sans interpolation et sans faux volume nul.

Affichage progressif : 100 tranches initiales, puis 200 supplémentaires, maximum 1 500. La mise à jour utilise l’API incrémentale quand le préfixe de la série est inchangé ; changement de pool/plage/intervalle réinitialise les données. Toute limite de plage est annoncée.

Les changements automatiques signalent une variation absolue d’au moins 20 % entre clôtures de tranches adjacentes disponibles, et entre observations de liquidité de même source. Aucun signal de prix ne traverse un trou. La date du changement de clôture est la fin de la tranche. Une variation de liquidité ne prouve ni retrait, ni ajout, ni manipulation ; aucune cause n’est inventée.

Une référence contradictoire affiche les deux valeurs avec leurs sources. Elles ne sont pas moyennées ; variation/volume complet sont indisponibles en cas d’incohérence. Les données courantes du cache sont choisies par récupération la plus récente puis fournisseur pour départager ; ce choix n’est pas une résolution de la contradiction.

La capitalisation fictive est **prix de clôture du pool × offre circulante fictive constante de 100 000 000 tokens**, datée à la clôture. La méthode et ses limites sont visibles. En REAL, si l’offre circulante/historique n’est pas disponible, la capitalisation reste inconnue. L’offre totale ou les quantités brutes du contrat ne sont pas utilisées pour inventer une offre circulante ; aucune FDV n’est présentée comme capitalisation vérifiée.

## Adaptateur de marché et service privé

`GeckoTerminalProvider` est un adaptateur de lecture seule pour l’API publique GeckoTerminal v2. Références : [API](https://api.geckoterminal.com/docs/index.html), [guide public](https://apiguide.geckoterminal.com/), [OHLCV CoinGecko](https://docs.coingecko.com/reference/pool-ohlcv-contract-address). **Les pages du fournisseur sont bloquées par la politique réseau de cet environnement (HTTP CONNECT 403)** : les contrats sont validés sur fixtures, pas par un essai live. L’adaptateur doit faire l’objet d’un diagnostic réel de droits, disponibilité, conditions et limites avant activation opérationnelle. Aucun contournement réseau, aucune vérification TLS désactivée.

Endpoints bornés :

| Fonction | Requête |
|---|---|
| Pools d’un token | `/api/v2/networks/{réseau}/tokens/{adresse}/pools?page=1` |
| OHLCV d’un pool | `/api/v2/networks/{réseau}/pools/{pool}/ohlcv/{minute|hour|day}` avec agrégat, USD, côté du token, limite 300, borne supérieure exclusive |
| Transactions récentes | `/api/v2/networks/{réseau}/pools/{pool}/trades` |

Réseaux : ethereum → eth, base, bsc, arbitrum, solana. L’adresse du token est confrontée aux relations base/quote du pool, pas à son nom. Le côté de prix est conservé ; les achats/ventes sont dérivés des adresses exactes entrante/sortante. Aucun prix réciproque ou side n’est deviné d’après le symbole. Le rafraîchissement exige un pool vérifié par le même fournisseur, découvert avant l’historique.

Une page de pools n’est pas un inventaire exhaustif ; résultats partiels explicitement annoncés. Historique limité à 300 bougies par requête, sans remplissage d’intervalles vides. La récupération d’une fenêtre plus ancienne requiert un autre appel explicite avec une borne antérieure ; le bouton de la démo charge les tranches locales, sans simuler une pagination réseau. Les transactions récentes ne sont pas un index historique complet.

Les lexèmes numériques JSON monétaires sont conservés avant `JSON.parse`, puis normalisés exactement, y compris la notation scientifique bornée. Réponses malformées, prix négatifs, adresses/pools incohérents et types inattendus sont refusés. Pas de corps d’erreur fournisseur exposé. Transport HTTPS avec DNS public épinglé, domaine exact `api.geckoterminal.com`, aucune redirection, délai 10 s et corps maximal 2 Mo. Aucun secret n’est nécessaire à cet adaptateur public et aucune clé n’est incluse dans le renderer.

Le service **ne démarre aucun appel à sa construction**. L’hôte privé peut composer :

```ts
const service = createChartRuntime(pool, authenticatedOwnerId, "REAL", false);
const cached = await service.read(request);
// Activation opérateur explicite après diagnostic : enabled=true.
const enabled = createChartRuntime(pool, authenticatedOwnerId, "REAL", true);
await enabled.discover({ chain: "base", address }, true);
await enabled.refresh(request, true, true); // confirmation hôte, transactions incluses.
```

`createXWorker(config, ownerId, marketEnabled=false)` expose aussi `charts`. En DEMO, il compose le fournisseur local ; en REAL, l’accès réseau de marché est désactivé par défaut. Aucun serveur HTTP public, authentification de production ou branchement serveur de l’interface n’est annoncé ; l’hôte doit authentifier le propriétaire, jamais accepter librement un owner ID depuis le client. Le raccordement complet reste prévu en phase 12.

Un contrôle PostgreSQL partagé autorise au maximum **20 tentatives par minute calendaire** pour ce fournisseur/origine. Une tentative est réservée avant réseau. Un 429 enregistre un blocage partagé jusqu’à 3 600 s, avec repli 60 s ; aucun retry automatique. Ce plafond local ne garantit ni les quotas réels du fournisseur ni les limites par IP. Deux origines restent séparées. L’adaptateur n’utilise aucun abonnement payant et n’est pas un registre de coûts X.

## Cache, persistance et confidentialité

Migration additive **0010_token_charts** : **66 tables applicatives**, plus le registre. Versions 0001–0009 immuables. Ajouts :

- Côté base/quote et fournisseur vérificateur sur les pools ; URL source sur les bougies.
- `chart_cache_windows` : identité token/pool/intervalle/fenêtre/fournisseur, récupération, état, erreur bornée, état des transactions et bail de rafraîchissement.
- `pool_market_samples` : liquidité/capitalisation par token et pool, valeur exacte ou raison d’absence.
- `pool_trades` : transactions observées, montants exacts ou inconnus, adresse éventuelle, provenance et date.
- `market_request_controls` : plafond partagé et blocage fournisseur.

Durées de validité du cache : 1 min → 30 s ; 5 min → 60 s ; 15 min → 180 s ; 1 h → 300 s ; 4 h → 900 s ; 1 jour → 3 600 s. Les états vides sont mis en cache aussi. Un échec conserve les bonnes bougies antérieures et affiche le code d’erreur ; une panne des transactions ne détruit pas un bon lot de prix. Le statut de récupération des transactions est séparé, sans faux compteur exhaustif.

Un bail de 60 s, acquis atomiquement, empêche les rafraîchissements simultanés d’une même fenêtre. Après expiration/reprise, un ancien worker ne peut plus écrire ni effacer l’erreur du nouveau. Les upserts sont idempotents et une récupération ancienne ne remplace pas une observation plus récente. Tous les éléments d’un lot sont contrôlés avant la mutation, qui est transactionnelle.

Les données de marché publiques peuvent être partagées entre utilisateurs de la même origine. Les marqueurs privés sont toujours lus avec contexte propriétaire : mentions accessibles à ses règles, liens d’événement de révision actuelle et texte revalidé, alertes de ses règles uniquement. Les mentions supprimées/indisponibles cessent de contribuer. Les libellés indiquent les personnes actuellement suivies ou les comptes officiellement attestés manuellement ; aucune histoire d’abonnement ou preuve de soutien n’est inventée. Aucune note privée/catégorie de personne n’est copiée, aucun profilage de portefeuille/commentateur ajouté.

La normalisation des adresses de phase 7 reste obligatoire ; liens externes de token et portefeuille construits par fonctions uniques à liste de domaines autorisés, jamais par symbole. En démo ils restent indisponibles. Métadonnées échappées par React, caractères de contrôle et bidirectionnels neutralisés pour les nouveaux libellés ; pas de HTML fournisseur ni image distante.

Bornes de lecture : 100 pools connus, 1 500 tranches, 3 000 lignes de bougies ou d’observations (pour comparer des sources), 300 transactions, 100 éléments par famille de marqueurs. Les dépassements des grandes séries sont refusés ; troncature des listes/transactions annoncée dans les métadonnées. Une transaction hors de la plage n’est pas comptée dans sa lecture. Les métriques manquantes ne deviennent jamais zéro.

Les nouvelles tables utilisent le même cloisonnement d’origine/FK et les triggers d’origine immuable que le modèle existant. RLS des marqueurs privés est conservée ; les requêtes filtrent aussi le propriétaire en connexion administrateur de test. Le rollback refuse la présence de données/configurations de marché, sans perte utilisateur. ORM/snapshot générés depuis une base jetable et comparés aux migrations SQL.

## Vérifications

- Construction TypeScript/Vite, formatage et `git diff --check` réussis. Module graphique chargé séparément.
- **196 tests unitaires/contrats** réussis : décimales exactes, arrondis/seuils non arrondis, OHLC, périodes vides/en cours/non clôturées, pools, identité/URL, marqueurs, cache/service, JSON monétaire sans perte et contrats fournisseur simulés. Aucun appel live.
- **80 tests PostgreSQL V2** réussis, dont neuf nouveaux : cache multi-pool, concurrence/bail/reprise, panne avec cache conservé, sources contradictoires, montants exacts, marqueurs privés, rôle sans bypass, plafond partagé et rollback.
- **Sept contrôles Redis** réussis ; les tests unitaires partagés ne sont pas comptés deux fois. Total TypeScript distinct : **283**.
- **Huit parcours Chromium** réussis : nouveaux liens de graphique, route identitaire/refus des adresses invalides, canvas, pools, URL persistante, rechargement, plages/progression, sources incohérentes/anciennes/indisponibles, marqueurs et largeur 390 px sans requête externe. Parcours V1 et phases 4–7 conservés.
- Electron Linux : chargement du chunk graphique via protocole sécurisé, canvas, pool, copie d’adresse par IPC, erreur de route, sandbox, blocage réseau et préférences/notes/règles persistantes réussis.
- Référence SQL V1 : 51 contrôles avant/après rollback, réapplication, échec atomique et concurrence réussis.
- Audit des dépendances de production : zéro vulnérabilité. Diagnostics sans appel fournisseur.

Seuils globaux de couverture maintenus à 80 % sur les quatre mesures et dépassés. CI sur le commit `6dcd8e4c56a31735cacb8beaaf0f1fd7903ba19e` :

- [Linux — contrôles complets réussis](https://github.com/wnathan469-debug/meme/actions/runs/39158169876).
- [Windows — tests, compilation NSIS et vérification du ZIP réussis](https://github.com/wnathan469-debug/meme/actions/runs/39158169961). L’archive de cette construction est conservée comme artefact pendant 14 jours. La publication préserve les fichiers immuables de la version publique 0.1.0.

 Un build et un ZIP vérifié ne prouvent pas une installation sur le PC de l’utilisateur.

## Sources et suite

Nouveaux : `packages/charts/{decimal,model,provider,service,demo-data}.ts` ; `packages/connectors/market/gecko.ts` ; dépôt `packages/db/chart-repository.ts` ; migration `0010_token_charts.up/down.sql` ; composition `apps/api/chart-runtime.ts` ; `TokenAnalysis.tsx` et `TokenLink.tsx` ; licences ; tests unitaires, contrats et PostgreSQL du marché.

Adaptés : worker/runtime X ; navigation/vues de tokens, événements, preuves et conversations ; styles ; manifeste/ORM/snapshot ; références de migrations ; parcours navigateur/Electron ; configurations de build/test/formatage, dépendances verrouillées et notices ; documentation.

Prochaine phase après validation : **phase 9 — analyse des risques**, statuts, éléments observés et limites. Les alertes actives, paramètres de fournisseurs, interface serveur complète, démo unifiée et livraison publique V2 restent les jalons ultérieurs du plan.
