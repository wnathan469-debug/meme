# Limites de la livraison actuelle

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
