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
