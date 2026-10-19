# Limites — version Windows 0.2.0

La livraison actuelle inclut les phases V2 1–14 pour une **démonstration hors ligne**. La matrice à jour est [FEATURE_MATRIX.md](FEATURE_MATRIX.md), et le guide d’installation [DESKTOP.md](DESKTOP.md). Le backend HTTP authentifié et le raccordement REAL restent non livrés ; aucune API réelle n’a été validée.

Les sections suivantes sont des constats historiques, complétés à chaque phase ; les mentions d’absence de paquet V2 et de vues à venir décrivent leur jalon, pas la version 0.2.0.

## Historique des limites

Cette livraison ajoute une application de bureau de démonstration après les phases 1 à 3. Elle n'annonce pas l'achèvement des quinze phases du cahier des charges.

## Fonctionnel

- Démo locale seulement ; aucune actualité réelle, découverte de token réel ou requête blockchain.
- Pas de connecteurs RSS/actualité/social, RPC, DEX ou prestataire de risque exécutables dans cette édition.
- Pas de backend REST, worker BullMQ, compte administrateur serveur, webhook ou notification SMTP. L'authentification du futur serveur reste distincte de la session Windows locale.
- La règle modifiable porte uniquement sur les mentions absolues fictives ; les alertes pédagogiques Tesla sont distinctes et statiques. Pas encore de constructeur booléen général, regroupement multi-règles, heures silencieuses ou règles live de liquidité/portefeuilles.
- Suivi par mots-clés simples, sans expression ET/OU/SAUF ni traduction automatique.
- Marché synthétique sans validation multi-fournisseur ; pas de simulation on-chain. Les permissions/concentrations sont des fixtures, pas des résultats de lecture de chaîne.
- Les indices d'usurpation sont représentés par les fixtures ; les futurs contrôles d'homoglyphes et de contrats officiels live ne sont pas encore implémentés.
- Seulement Base/Solana représentées dans l'interface démo ; PostgreSQL prévoit les cinq chaînes. Pas de prise en charge live implicite des autres chaînes.
- Les alertes sont recalculées par rejeu ; les préférences et faux positifs sont persistés, pas un journal d'événements live.

## Technique et distribution

- Le schéma PostgreSQL est testé indépendamment, sans connexion de cette édition de bureau à cette base.
- Aucun service de mise à jour automatique ni signature d'éditeur. La publication et la signature nécessiteront une procédure distincte.
- Cible Windows x64 ; exécution et installation natives Windows à vérifier sur la machine de destination. Les résultats cloud sont détaillés dans VALIDATION.md.
- Accessibilité : structure sémantique, clavier, modales et texte des niveaux prévus ; pas de certification WCAG complète ni audit par lecteur d'écran.
- Couverture mesurée sur les fonctions du domaine démo, pas sur tous les futurs modules du cahier des charges.

## Avant usage réel/public/commercial

Faire valider les CGU, quotas, stockage et redistribution de chaque API ; les droits d'auteur des extraits ; la protection des renseignements personnels (Loi 25, LPRPDE, RGPD selon les utilisateurs) ; la réglementation AMF et autres règles applicables ; la responsabilité liée à l'analyse. Prévoir revue de sécurité, validation juridique, comparaison manuelle avec explorateurs officiels, surveillance, sauvegarde et procédure de signalement d'erreurs.

Aucune affirmation de gain, d'exhaustivité ou de sécurité d'un token n'est fournie. Une absence de signal ne signifie pas absence de risque.


## Socle V2 — phase 1

Client REST X et adaptateur DEMO implémentés séparément, sans branchement à Electron, serveur hébergé ou tâche de collecte. Aucun droit X, tarif, appel réel ou fonctionnement de bout en bout live validé. Les modifications n'ajoutent aucune donnée réelle à l'installateur 0.1.0. Stream/rejeu étendu, personnes, conversations, graphiques et nouvelles vues restent dans les phases suivantes. Depuis la phase 2, migrations V2 et journal durable PostgreSQL sont livrés ; la conformité et les collecteurs restent à compléter avant activation. Voir [PROVIDERS.md](PROVIDERS.md) et [V2_PHASE1.md](V2_PHASE1.md).


## Persistance V2 — phase 2

Migrations 0002–0005, schéma ORM de requêtes, budgets/journal PostgreSQL et conversion de préférences sont implémentés et testés. Ils ne constituent pas un backend hébergé, des collecteurs, une nouvelle interface ou un paquet V2 publié. Le runtime privé exige maintenant PostgreSQL et Redis. Les checkpoints/status ont leur schéma mais attendent les collecteurs ; rétention, rapprochement des appels interrompus, rôles/identités déployés et administration des plafonds restent à finaliser avant activation réelle. Les FK/check/index/RLS sont maintenus en SQL, sans duplication DDL dans Drizzle. La conversion des préférences est prête et sera activée avec l'interface V2. Voir [V2_PHASE2.md](V2_PHASE2.md).


## Collecte V2 — phase 3

Polling, flux filtré borné, déduplication et services de recherche/filtres sont implémentés et testés sur données fictives. Ils ne sont pas branchés à une nouvelle interface ni à un endpoint public authentifié. Aucun droit, facture ou fonctionnement réseau X réel validé. Le flux REAL exige une borne contractuelle de facturation ; sinon auto utilise le polling autorisé. Hub privé en mémoire, devis locaux au processus, rattrapage limité à la fenêtre API et aux pages configurées ; rétention/conformité non planifiées automatiquement. Les services de personnes et conversations suivront. Voir V2_PHASE3.md ; aucun nouveau paquet V2 publié.

## Personnes suivies V2 — phase 4

Le code dispose d’une première page DEMO locale et de services privés PostgreSQL. La page ne se connecte pas au serveur : sa confirmation d’identité est simulée et ses publications sont un instantané fictif daté. Les notes restent dans le profil local, sans chiffrement applicatif. Les services serveur ne sont pas encore exposés par une API authentifiée. Validation différée préparée en lots avec confirmation ; pas de validation payante activée en arrière-plan. Pas de collecte de compte protégé ou de protection inconnue. CSV optionnel non livré, alertes de personnes prévues phase 10 et branchement complet de l’interface prévu phase 12. L’installateur public 0.1.0 ne contient pas encore ces changements ; une V2 installable exige la phase finale de construction et de vérification. Voir [V2_PHASE4.md](V2_PHASE4.md).

## Conversations V2 — phase 5

La page Conversations est une démonstration locale datée : 35 réponses sur environ 120, soit 29,17 %, sans appel X. Le service privé sait charger/reprendre des pages autorisées après devis, mais aucune API HTTP authentifiée ni liaison complète renderer/serveur n’est livrée. Racine et citations ne comptent pas dans les réponses. Fenêtre, métriques ou auteurs absents restent inconnus ; aucune garantie d’exhaustivité, même à 100 % observé. L’affichage privé est borné à 1 000 publications, avec troncature et résumé d’échantillon signalés. Les citations peuvent nécessiter une relecture de pages, faute de curseur incrémental `since_id` sur cet endpoint. Filtres token/événement préparés pour les liens existants, sans association inventée dans les fixtures. Pas de mesure de l’âge des commentateurs ni de profilage hors conversation. La nouvelle version Windows installable reste prévue en phase finale ; le paquet public 0.1.0 reste inchangé. Voir [V2_PHASE5.md](V2_PHASE5.md).

## Événements V2 — phase 6

Liaisons par expressions/hashtags = interprétations heuristiques, pas confirmation ni preuve de causalité. Les comptes officiels sont explicitement attestés manuellement, sans vérification automatique du contenu de preuve. La popularité ne modifie pas la fiabilité. Sans couverture documentée de toutes les règles, ligne de base et multiplicateurs restent inconnus ; une requête terminée ne démontre pas l’exhaustivité. Interruption de collecte et couverture par date de publication sont deux axes distincts. Reconstruction/lecture privées limitées à 10 000 publications, avec refus explicite au-delà, et 100 interruptions visibles.

La fiche Nébula Mobile est un jeu dédié de 60 publications fictives ; agrégats et scénarios d’origine conservés séparément. Les règles d’alerte sont configurables mais en pause jusqu’à la phase 10. Les jalons de tokens lisent uniquement des preuves déjà enregistrées : aucune nouvelle association n’est produite par cette phase. Pas d’API HTTP authentifiée ni de branchement live du renderer ; installateur public 0.1.0 inchangé. Voir [V2_PHASE6.md](V2_PHASE6.md).


## Phase 7 — preuves sociales

Extraction hors ligne sur tokens déjà connus : aucune découverte/validation réseau de contrat ou de mint. EVM sans chaîne reste ambigu ; contexte de chaîne seulement explicite par règle ou URL de token autorisée. Les URL de pools DEX et raccourcisseurs ne sont pas résolus. Les cashtags/noms ne suffisent pas. La confirmation de l’association exige une revue manuelle de publication exacte, pas une déduction d’intention ; ce n’est jamais une légitimation. L’âge des comptes reste inconnu et l’homoglyphie n’est qu’un signal conservateur Latin/Cyrillique/Grec. Les données de démo restent fictives, trois nouvelles identités affichées séparément des cartes V1. Service privé à composer par un hôte authentifié ; reconstruction/purge à programmer, pas de serveur public ou de traitement automatique activé. Bornes et comportement des dépassements dans [phase 7](V2_PHASE7.md). Graphiques/route chaîne-adresse : phase 8 ; UI serveur complète et démo unifiée : phases 12–13 ; nouvel installateur public : phase finale.


## Phase 8 — analyse et graphique

Interface de marché en DEMO, jeu dédié distinct des valeurs V1 ; pas de prix réel annoncé. Contrats GeckoTerminal validés sur fixtures : documentation publique/API bloquée par le réseau de cet environnement, aucun essai live ni activation implicite. Diagnostic opérateur requis avant REAL. Une page de pools, 300 bougies/requête et transactions récentes restent partiels ; rendu local progressif plafonné à 1 500 tranches. Capitalisation inconnue en REAL sans offre circulante vérifiée. Causes des variations de liquidité non déduites ; aucune interpolation. Raccordement serveur et livraison publique V2 à venir. Voir [phase 8](V2_PHASE8.md).


## Phase 9 — risques

Interface entièrement fictive, sans analyse live annoncée. GoPlus testé sur fixtures et SDK officiel consulté ; couverture/droits/quota et fraîcheur réels à diagnostiquer avant activation. Décodeurs Solana/métadonnées et relevés de détenteurs/mouvements/LP exigent des lectures déjà acquises et liées au token par un hôte de confiance. Aucun scanner historique ni simulation de vente locale. Proxy présent ≠ modifiabilité prouvée, métadonnées Metaplex ≠ tous les programmes, rôle de portefeuille non vérifié ≠ exclusion légitime. Pas de certification, pas de note globale ; données absentes, anciennes ou contradictoires explicites. Raccordement authentifié et nouvel installateur public restent à venir. Voir [phase 9](V2_PHASE9.md).


## Phase 10 — alertes

Centre utilisateur en DEMO locale : évaluation manuelle, horloge propre, trois jours et stockage borné. Pas de surveillance en arrière-plan, courriel, webhook, bot ou notification système. Service privé durable disponible pour un hôte authentifié, pas encore raccordé automatiquement aux collecteurs ; il exige comparabilité, qualité, couverture et provenance des observations. Heures silencieuses/plafond suppriment avec raison ; un résumé en attente conserve son échéance après modification. Rétention/archivage à organiser avant saturation. Voir [phase 10](V2_PHASE10.md).

## Sources et API V2 — phase 11

La page et ses scénarios sont une démonstration persistante hors ligne ; aucune disponibilité, facture ou capacité réelle n’en est déduite. Le service privé, les politiques durables et les tests explicites existent, sans route HTTP authentifiée ni raccordement du renderer avant la phase 12. Les réglages ne contournent pas la configuration réseau de l’hôte. Le profil public cible du test X doit être choisi explicitement par l’opérateur. Les diagnostics publics hors test décrivent le transport, sans certifier toutes les validations métier. Rétention et rapprochement des réservations ambiguës restent opérationnels. Les liens externes restent bloqués par Electron ; leur ouverture contrôlée appartient à l’intégration suivante. Les anciens paquets Windows publics ne contiennent pas ces changements ; livraison finale prévue en phase 14. Voir [phase 11](V2_PHASE11.md).

## Interface et navigation V2 — phase 12

Neuf pages et filtres URL, nouvelle veille locale, synthèse des personnes actives et budgets fictifs. Chaque filtre a une portée documentée ; aucun profilage ou score global de risque supplémentaire. États de chargement/erreur/quota/ancien/partiel simulés explicitement. Vérifications clavier, focus, thèmes et petit écran ciblées, sans certification WCAG complète. Contrairement aux projections de certaines notes précédentes, le raccordement au serveur authentifié n’est pas livré par cette phase Navigation/UI : aucun fonctionnement REAL utilisable depuis Electron. L’activation réelle exige un lot distinct d’intégration/exploitation ; la démo finale reste installable sans outils de développement. L’unification des scénarios est prévue en phase 13 et le nouvel installateur public en phase 14. Voir [phase 12](V2_PHASE12.md).

## Démo unifiée V2 — phase 13

Le scénario Nébula partage 63 publications, quatre tokens et une horloge persistante ; les scénarios V1 restent distincts. Les profils doivent être ajoutés explicitement. Simulation de quota/budget/déconnexion sans réseau ; aucune disponibilité réelle ou dépense ne peut en être déduite. Les alertes de publication sont liées au catalogue, tandis que les autres cas techniques et les compteurs restent pédagogiques. Le jeu de marché s’arrête à T+120, les données ne sont pas prolongées artificiellement sur les trois jours d’horloge. Retour arrière en lecture sans effacement d’archives ; rejoindre leur dernière évaluation avant de traiter de nouvelles alertes. Aucun raccordement au serveur REAL et aucun remplacement de la release Windows publique 0.1.0 ; livraison démo finale prévue en phase 14. Voir [phase 13](V2_PHASE13.md).
