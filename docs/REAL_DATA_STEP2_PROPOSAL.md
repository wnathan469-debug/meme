# Données réelles — étape 2 : fournisseurs, budget et pilote à valider

L’utilisateur a approuvé l’inventaire de l’étape 1 et demandé de commencer les travaux. Cette approbation permet de préparer cette étape 2. Elle n’autorise aucun achat, hébergement facturable ou appel API payant.

**Proposition prête à examiner ; choix des fournisseurs, budget et trois comptes pilotes en attente de validation.** Le développement du serveur de l’étape 3 n’est pas commencé. MemeRadar 0.2.0 reste une démonstration hors ligne.

Fichiers : ce rapport, config/real-pilot.proposal.json, et liens/statuts dans le README et l’audit de l’étape 1. Le JSON est une proposition non secrète, **non chargée par l’application ou le worker**. Il ne constitue pas un plafond actif.

## 1. Ce qui a réellement pu être vérifié

Le 19 octobre 2026 UTC, onze lectures de documentation officielle ont été tentées : prix et limites X, conditions X, prix CoinGecko, limites GeckoTerminal, documentation DEX Screener, deux pages GoPlus, prix Railway, Render et DigitalOcean.

Toutes ont été refusées par le proxy du cloud : **CONNECT 403 Forbidden**. Ce résultat ne signifie pas que ces sites sont indisponibles depuis votre navigateur. Aucun tarif, quota de compte, droit contractuel ou accès gratuit n’a donc été confirmé ici.

Les montants ci-dessous sont **nos enveloppes proposées**, pas des tarifs constatés. Les adresses officielles permettent de vérifier les conditions depuis Chrome. Tous les prix et quotas sont **à vérifier sur le site officiel à la date d’activation**. Les réponses réelles et leurs en-têtes feront autorité pour les droits et quotas observés ; un tarif ne sera jamais déduit d’un quota technique.

Les adaptateurs X, GeckoTerminal et GoPlus existent dans le dépôt, sous tests à données synthétiques. Aucun n’est raccordé à l’interface Windows. Les alternatives mentionnées ci-dessous nécessiteraient une adaptation ; elles ne sont pas présentées comme interchangeables sans développement.

## 2. Sources proposées et alternatives

| Besoin | Choix proposé et données | Accès, tarifs et quotas | Limites et alternative |
|---|---|---|---|
| Résoudre un compte X public | API X officielle : nom → ID immuable et état public | Accès lecture des utilisateurs à confirmer ; prix par lecture/requête et quota non vérifiés | Aucun compte protégé ; aucun scraping. Aucun fournisseur alternatif X sélectionné sans contrat officiel vérifié |
| Publications des personnes suivies | API X : timeline par ID, texte, auteur, publication, collecte et lien X | Droit timeline publique et coût à confirmer ; budget logiciel cible X partagé | Périmètre horaire, une page ; couverture partielle possible. Un accès développeur ne prouve pas tous les droits |
| Conversations et citations, plus tard | Recherche X par conversation_id ; citations sur une route séparée | Droit de recherche, profondeur historique, opérateurs et accès citations à vérifier ; coût compris dans une future enveloppe explicitement approuvée | Désactivés dans le pilote ; accès incomplet annoncé. Pas de récupération exhaustive promise |
| Prix, volumes, liquidité et pools, étape 8 | GeckoTerminal ; adaptateur privé existant, chaîne + adresse exacte | Gratuité éventuelle, usage permis, attribution, limites et couverture à vérifier ; aucune facturation autorisée pour le pilote | CoinGecko Onchain comme autre offre à examiner ; DEX Screener comme alternative pour certaines métriques, sans lui attribuer un historique OHLC non vérifié |
| Bougies et graphiques, étape 8 | GeckoTerminal, selon réseau/pool et granularités réellement disponibles | Historique, fenêtres, agrégation, quotas et conditions à vérifier | Trous et valeurs anciennes visibles ; une métrique absente reste absente. Autre adaptateur à prévoir si l’offre retenue diffère |
| Métadonnées et informations de contrats | GoPlus et explorateur officiel, selon réseau/champ ; décodeurs privés existants | Support de Base, clés, conditions commerciales et quotas à vérifier | Une preuve manquante demeure inconnue ; Etherscan/Basescan serait un autre accès à contractualiser et développer |
| Risques, permissions, concentration, signaux de vente bloquée, étape 9 | GoPlus en lecture et preuves datées ; comparaisons avec l’explorateur | Aucun forfait ou quota présumé ; couverture de chaque contrôle à vérifier | Les 17 contrôles ne sont pas tous garantis par un fournisseur ; lecture RPC supplémentaire à étudier si nécessaire, sans transaction ni portefeuille |
| Événements d’actualité, étape 7 | Flux RSS ou publications officielles des sources retenues | Droits de collecte, stockage et affichage à vérifier source par source | Sources à choisir ; aucun connecteur d’actualité réel livré. GDELT peut être étudié sans présumer ses droits ou sa couverture |

### Sources officielles à consulter

- X : [documentation](https://docs.x.com/), [portail développeur](https://developer.x.com/), [conditions développeur](https://developer.x.com/en/developer-terms/agreement-and-policy).
- GeckoTerminal : [documentation](https://docs.geckoterminal.com/), [limites à vérifier](https://docs.geckoterminal.com/api-limits).
- CoinGecko : [offres API](https://www.coingecko.com/en/api/pricing).
- DEX Screener : [référence API](https://docs.dexscreener.com/api/reference).
- GoPlus : [documentation officielle](https://docs.gopluslabs.io/).
- Etherscan : [documentation](https://docs.etherscan.io/) ; [Basescan](https://basescan.org/).
- Les liens vers Etherscan/Basescan sont des références proposées, non consultées dans cette étape. Les URL précises des rubriques peuvent évoluer.

Il faut notamment vérifier le droit d’afficher les extraits dans votre application, leur rétention, les suppressions et la redistribution éventuelle. Aucun droit commercial ou de redistribution n’est déduit de l’existence d’une API publique.

## 3. Accès X : fonctions à autoriser explicitement

Je ne peux pas nommer un forfait X actuel comme suffisant ni lui attribuer un prix : ces informations n’ont pas pu être vérifiées. La correspondance fonctionnelle nécessaire est cependant identifiée dans le code existant :

| Fonction MemeRadar | Capacité / route du client privé | Décision pour le pilote |
|---|---|---|
| Vérifier le compte avant ajout | username : /users/by/username/{username} | Nécessaire, sous confirmation et budget |
| Recontrôler son caractère public | users : /users | Nécessaire avant timeline si profil périmé |
| Lire les publications suivies | timeline : /users/{id}/tweets | Nécessaire, priorité low |
| Recherche générale de veille | recent : /tweets/search/recent | Désactivée ; la veille pilote relit les données déjà collectées |
| Conversation | conversation : recherche récente avec conversation_id | Désactivée |
| Citations | quotes : /tweets/{id}/quote_tweets | Désactivées |
| Recherche ancienne | archive : /tweets/search/all | Désactivée |
| Flux continu | stream : /tweets/search/stream | Désactivé |

Le portail doit confirmer les trois premières capacités, leurs coûts et leurs limites pour le compte choisi. Un abonnement utilisateur X ne prouve pas l’accès API. Les alias tweet.fields/post.fields doivent correspondre au contrat retenu ; aucun essai automatique d’alias ou changement d’offre payant.

**Estimation de coût à vérifier :** aucune facture chiffrée fiable n’est calculable sans les prix. Nous proposons d’autoriser au maximum **20 USD/mois et 1 USD/jour d’appels X**, après configuration et validation des protections. Si l’accès minimal ou une souscription dépasse cette enveloppe, le pilote X restera désactivé jusqu’à une nouvelle décision. Aucun tarif fictif ne sera inscrit dans x-pricing.example.json.

Le modèle actuel peut réserver une borne en micro-USD par requête, publication et utilisateur. La grille retenue doit majorer les coûts des routes autorisées, erreurs comprises. Si le contrat n’est pas représentable de façon conservatrice, le modèle de réservation devra être adapté avant activation. Abonnements, crédits prépayés ou minimums d’engagement doivent être comptés séparément pour éviter de promettre une facture plafonnée par le seul collecteur.

## 4. Pilote réduit proposé

- **Trois comptes X publics**, choisis explicitement par l’utilisateur. Liste actuellement vide ; aucun compte ajouté automatiquement.
- Un relevé **toutes les 60 minutes**, priorité low existante : pas de mention « en direct ».
- Une page et dix publications au maximum par compte/cycle. Zéro nouvelle tentative immédiate ; reprise au prochain créneau autorisé après un échec, en respectant les délais du fournisseur et les réservations ambiguës.
- Premier essai de **24 heures**, après l’hébergement et un accord explicite sur les appels payants.
- Aucun flux continu, recherche historique, conversation, citation, rattrapage étendu, notification externe ou transaction crypto dans ce premier essai.
- Marché/risques désactivés pour ce premier essai X. **Base** est la première chaîne proposée pour les étapes 8–9 ; Solana ou une deuxième chaîne nécessiteraient une décision ultérieure.

### Volume et coût : ne pas oublier les profils

Le client existant recontrôle le profil public avant une timeline si son cache est périmé. Son TTL de base est de cinq minutes : avec un relevé horaire, il faut prévoir cette lecture supplémentaire.

Trois comptes × 24 créneaux donnent **72 lectures de timeline/jour**, plus jusqu’à **72 lectures de profil** dans ce scénario, soit environ **144 requêtes/jour**, hors ajout initial et diagnostic confirmé. Projection à 30 jours : 4 320 requêtes de suivi, hors ces opérations ponctuelles. Ce sont des estimations de charge de notre pilote, pas des quotas X ni une garantie de facturation.

La limite locale cible est de **150 requêtes X par jour UTC, toutes opérations confondues**, à implémenter et tester à l’étape 3. Elle ne doit pas contourner le contrôle monétaire. Dix publications par timeline donnent au plus 720 emplacements de publications retournées par jour dans le programme nominal ; le nombre de nouvelles publications uniques peut être beaucoup plus faible.

La facturation peut inclure les ressources demandées et les lectures répétées même après déduplication. Les limites jour/mois arrêtent les appels avant épuisement du programme si leur coût l’exige. Une page n’offre pas une couverture exhaustive d’un compte très actif ; les interruptions et données partielles doivent être signalées.

## 5. Budget proposé — décision utilisateur en attente

| Poste | Enveloppe mensuelle proposée, USD | Limite quotidienne / avertissement | État |
|---|---:|---|---|
| Hébergement : API + PostgreSQL + Redis + sauvegardes | 35 | Alertes de consommation à configurer chez l’hébergeur | Estimation de dimensionnement, devis non vérifié |
| Appels API X du pilote | 20 | 1 USD/jour ; avertissements à 0,80 USD/jour et 16 USD/mois | Plafonds logiciels cibles, non actifs |
| API marché GeckoTerminal | 0 | Aucun appel facturable autorisé | Désactivée ; éventuel accès sans frais à confirmer |
| API risques GoPlus | 0 | Aucun appel facturable autorisé | Désactivée ; éventuel accès sans frais à confirmer |
| Autres fournisseurs / notifications externes | 0 | Aucun achat ou appel facturable autorisé | Désactivés |
| Réserve non attribuée | 5 | Aucune utilisation automatique | Nouvelle autorisation nécessaire |
| **Enveloppe totale proposée** | **60 USD/mois** | Hors taxes, change et frais éventuels | **Non approuvée ; aucune dépense engagée** |

Les montants sont en USD pour correspondre aux unités du registre existant. Ils ne constituent pas un tarif fournisseur ni une garantie sur la facture totale. Si vous souhaitez un plafond tout compris dans une autre devise, l’enveloppe devra être ajustée avant achat avec taxes, change, engagements et frais connus.

**Distinction importante :** le futur arrêt général empêchera de nouveaux appels payants. Il n’annulera ni une requête déjà envoyée, ni un abonnement, ni les frais de volumes, sauvegardes ou stockage de l’hébergeur. Une alerte de facturation n’est pas nécessairement un arrêt automatique. Il faudra choisir des offres compatibles avec l’enveloppe et vérifier leurs moyens de plafonnement ; une offre incompatible exige une nouvelle validation.

Les budgets sont décrits en chaînes d’entiers de micro-USD dans config/real-pilot.proposal.json : 1 USD = 1 000 000 micro-USD, avertissement à 80 %. Aucun tarif inconnu n’est remplacé par zéro. Les limites seront partagées et durables ; paramètres absents, prix inconnus, rôle non autorisé, plafond atteint ou arrêt général doivent refuser tout nouvel appel payant. Ces garanties restent à développer et tester au prochain jalon.

## 6. Hébergement : trois options à comparer avant achat

Les fourchettes sont **des estimations de planification MemeRadar**, pas les tarifs actuels des prestataires. Elles supposent un petit service API, une base, Redis et des sauvegardes, avec coûts de stockage/réseau à vérifier.

| Option | Estimation mensuelle USD à vérifier | Difficulté pour l’utilisateur | Avantages / limites |
|---|---:|---|---|
| **Railway — recommandation conditionnelle** | 25–45 | Faible à moyenne après préparation du projet | Services regroupés et variables serveur dans un tableau de bord ; facturation à l’usage et exploitation des bases/sauvegardes à vérifier, pas de restauration automatique présumée |
| Render | 30–70 | Faible à moyenne | Services séparés et offres de données ; disponibilité continue, PostgreSQL, service Redis compatible, sauvegardes et coûts de chaque composant à confirmer |
| VPS DigitalOcean avec Docker | 25–50, hors temps d’administration | Élevée | Ressources prévisibles selon l’offre ; mises à jour, sécurité, sauvegardes et incidents à administrer, point de panne unique sur un seul VPS |

Je recommande **Railway sous réserve d’un devis compatible**, pour limiter les opérations techniques à effectuer sur votre PC. L’enveloppe hébergement proposée est 35 USD ; si le dimensionnement avec sauvegardes dépasse ce montant, nous réduirons le périmètre ou demanderons une nouvelle décision avant création. Aucun plan gratuit en veille ne sera présenté comme une collecte continue garantie.

Vérifier : [Railway](https://railway.com/pricing), [Render](https://render.com/pricing), [DigitalOcean](https://www.digitalocean.com/pricing/droplets). Héberger les services et les sauvegardes dans des régions appropriées, base/Redis privés, TLS et contrôle de restauration obligatoire à l’étape 4. Aucun compte d’hébergement n’a été créé et aucun service n’a été déployé.

## 7. Actions utilisateur, dans l’ordre

### Maintenant : choisir, sans payer

1. Lire les tableaux ci-dessus et proposer un autre budget si 60 USD/mois est trop élevé.
2. Confirmer ou modifier le pilote : trois comptes publics, un relevé horaire et Base pour le marché ultérieur.
3. Donner les trois noms @ ou liens de profils publics à suivre. Ce sont des informations publiques, pas des identifiants de connexion.
4. Valider les fournisseurs proposés et la préférence d’hébergement, ou demander une alternative.

### Comptes à prévoir, après choix

| Compte | À quoi il servira | Quand le créer / résultat à constater |
|---|---|---|
| Compte développeur X officiel | Application API avec lecture des profils et timelines publics | Vérifier depuis le portail les accès et coûts proposés ; ne pas acheter d’accès avant validation |
| Railway, ou hébergeur finalement choisi | Projet serveur et services privés | Étape 4 ; on doit voir le projet et ses services dans le tableau de bord, après préparation du déploiement |
| CoinGecko/GeckoTerminal, si l’offre l’exige | Accès marché pour l’étape 8 | Vérifier si une inscription et une clé sont nécessaires ; aucune gratuité présumée |
| GoPlus, si l’offre l’exige | Accès risques pour l’étape 9 | Vérifier réseau, droits, quotas et éventuelle clé |

Les rubriques et libellés des portails peuvent changer ; leur présence exacte n’a pas pu être vérifiée ici. Si un écran propose un achat, demander uniquement les conditions non secrètes : prix, devise, cadence de facturation, droits, quotas et lien public. Ne jamais envoyer de clé, jeton, mot de passe ou capture contenant un secret dans la conversation.

Les clés seront renseignées directement dans les variables sécurisées du serveur à l’étape 4, avec une procédure spécifique à l’hébergeur retenu. Rien à installer sur votre PC à cette étape. La validation du budget autorisera la conception du serveur, **pas le démarrage d’une collecte payante**.

## 8. Preuves et limites de cette livraison

- L’inventaire approuvé reste consultable dans REAL_DATA_STEP1_AUDIT.md.
- Onze requêtes de documentation ont retourné un refus du proxy CONNECT 403 ; aucun appel d’API fournisseur effectué.
- Le fichier JSON contient des montants exacts, les indicateurs d’approbation à false sauf inventaire, les tarifs à null et tous les collecteurs désactivés.
- Contrôles de cohérence : 35 + 20 + 5 = 60 USD ; limites quotidiennes inférieures aux mensuelles ; seuils 80 % = 0,80 USD/jour et 16 USD/mois pour X ; 72 timelines + 72 profils = 144 lectures nominales/jour, sous la cible locale de 150.
- Ces contrôles valident la proposition, pas l’exécution d’un plafond financier en production. Le fichier n’est référencé par aucun code d’exécution.
- Aucune modification du code de l’application, des dépendances, des migrations ou de l’installateur ; les tests métier de l’étape 1 ne sont pas annoncés comme relancés ici.
- Aucun coût API, achat, inscription payante ou hébergement engagé. Aucun enregistrement réel collecté.

## 9. Statut global et validation attendue

| Fonction ou composant | Statut |
|---|---|
| Tableau de bord, veille et personnes suivies | Simulé (démo) |
| Conversations, événements et preuves sociales | Simulé (démo) |
| Tokens, prix, pools et graphiques | Simulé (démo) |
| Risques, alertes et historique | Simulé (démo) |
| Sources, quotas et consommation affichés | Simulé (démo) |
| Clients X/GeckoTerminal/GoPlus et collecteurs privés | Code écrit, non raccordé |
| Moteur d’alertes, budgets X et dépôts privés | Code écrit, non raccordé |
| Installation, navigation et préférences locales 0.2.0 | Réel et vérifié |
| API HTTP et authentification | Non commencé |
| Arrêt général et nouveaux plafonds du pilote | Non commencé |
| Hébergement, sauvegardes, surveillance et notifications externes | Non commencé |
| Collecte réelle du pilote et nouvel installateur connecté | Non commencé |

**À valider : fournisseurs, enveloppe de 60 USD/mois, plafonds API X, trois comptes publics et périmètre horaire.** Les droits/prix officiels demeurent à confirmer avant achat ou activation. Après votre validation des choix, l’étape 3 pourra développer et tester le serveur sans appel fournisseur ni dépense payante.
