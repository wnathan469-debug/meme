# V2 — phase 12 : interface et navigation

Les neuf pages du plan sont accessibles : **Tableau de bord, Veille X, Conversations, Personnes suivies, Événements, Tokens détectés, Alertes, Sources et API, Paramètres**. La fiche d’analyse devient un détail de Tokens détectés ; les anciens liens `#page=analysis`, les fiches événement/token et les routes chaîne/adresse restent compatibles.

L’édition conserve son fonctionnement **local en démonstration hors ligne**. Les données, comptes, publications, adresses, états et budgets sont fictifs. Aucun appel fournisseur réel, secret, transaction ou nouveau canal IPC. La release Windows publique 0.1.0 demeure inchangée ; le nouvel installateur public V2 relève de la phase 14.

## Navigation et composants

La définition des pages et la construction des liens sont extraites dans `navigation.ts`, le menu dans `Navigation.tsx`, les paramètres de filtres dans `useUrlFilters.ts`, les liens de publications dans `PublicationLink.tsx`, la récupération des erreurs dans `PageBoundary.tsx` et les nouveaux parcours dans `WatchPage.tsx`. Les contrôles de routage et filtrage sont testables sans navigateur.

Les liens du menu gardent les filtres globaux de mot-clé/chaîne/association et le contexte de veille ; les identifiants d’une ancienne fiche et les notes privées ne sont pas propagés. Les filtres propres à une page restent dans son URL et sont retrouvés par précédent/suivant ou rechargement. Les formulaires modifient leur état immédiatement, puis l’URL, pour conserver un comportement correct des cases au clavier.

Une page inconnue, un paramètre répété ou un lien trop long donne un message et un retour au tableau de bord. Les routes token continuent de valider chaîne et adresse. Une erreur React de vue est isolée : menu, bandeau et avertissement financier restent disponibles ; « Recharger la vue » permet de réessayer le chargement du module. Aucun message d’exception brut n’est rendu dans le produit.

Accès direct au contenu par un lien clavier, titre de document et focus du titre à chaque changement de page, page active annoncée dans le menu. La saisie d’un filtre ne déplace pas le focus. Le menu affiche ses neuf libellés sur petit écran ; les tableaux gardent leur défilement local, les sélecteurs restent dans leur conteneur et le pied de page est ajusté à la nouvelle disposition. Les thèmes clair/sombre et les réglages V1 sont conservés. Niveaux et états sont toujours textuels, sans dépendre uniquement de la couleur. Ces vérifications ciblées ne constituent pas une certification WCAG 2.1 AA complète ou un audit par lecteur d’écran.

## Veille X et filtres

La page consulte l’extrait de publications déjà intégré au scénario Nébula : pas de nouveau jeu fictif concurrent ni de recherche réseau. La sélection respecte les heures de publication et de récupération disponibles au curseur, déduplique par ID et trie par date décroissante. Les republications sont identifiées ; des métriques absentes restent inconnues.

Filtres URL : mot-clé, période de 15/60 minutes simulées ou totalité, personne par ID stable, catégorie de personnes, hashtag exact, événement associé, blockchain d’une adresse reconnue et qualité (dates/métriques connues). Une personne encore sans ID validé ne produit pas de fausse correspondance. Les notes privées ne sont ni recherchées dans ces publications, ni ajoutées aux liens. Les adresses reconnues ouvrent une fiche identifiée par chaîne/adresse ; un symbole seul n’engendre pas de graphique.

Les filtres des personnes, des réponses de conversation (texte, ordre, adresse, personne suivie, token et événement), des publications d’événement et des méthodes de preuve sociale sont également reflétés dans leurs URL. Leurs données locales et les préférences restent dans les formats et clés existants.

La page Tokens conserve mot-clé/chaîne/niveau d’association et ajoute des filtres sur les **états des contrôles** et leur disponibilité. Aucun score global de risque nouveau n’est inventé : au moins un signal, contrôle manquant/échoué ou aucun signal parmi les contrôles applicables disponibles. Un contrôle ancien, échoué ou absent empêche la conclusion « aucun signal ». Une absence de signal n’est jamais une garantie de sécurité.

Chaque filtre conserve sa portée : personne/période/hashtag concernent les publications de Veille X, les états des contrôles concernent les tokens, les filtres de conversation concernent les réponses récupérées. Les textes de la page l’indiquent ; un paramètre conservé comme contexte ne prétend pas filtrer une ressource qui ne possède pas ce champ. Les notes et brouillons privés ne deviennent pas une recherche globale.

## États et tableau de bord

La veille propose explicitement les états **chargement, vide, erreur, X non configuré, quota épuisé, données anciennes et couverture partielle**. Ces simulations sont libellées comme telles et conservées dans l’URL. Chargement/erreur/non-configuré/quota n’affichent pas de fausse liste fraîche ; retour à l’instantané local explicite, sans boucle de retry. Source sociale exclue : liste et résumé indisponibles. Un filtre sans résultat ne prouve pas une absence d’activité sur X.

La synthèse du tableau de bord lit à l’ouverture les réglages locaux des sources et des personnes : état X, budget engagé et dernières publications des personnes **actives** par ID stable. Les montants et pourcentages réutilisent les calculs exacts de phase 11. Un stockage illisible est préservé et indiqué comme inconnu.

Les hausses de mentions proviennent des tranches documentées de l’événement existant, avec ligne de base non nulle et comparaison exacte à au moins deux fois la base. Les tranches incomplètes ne deviennent pas une hausse ou une baisse. Période, multiplicateur et lien vers la couverture sont visibles. Les agrégats V1 restent distincts des mesures de Nébula ; l’unification temporelle du scénario reste en phase 13.

« Ouvrir le graphique » conserve le même composant de lien. « Ouvrir sur X » affiche un contrôle désactivé pour une publication fictive ; aucun lien X réel n’est inventé. Les références externes de documentation restent visibles, mais un clic ordinaire affiche leur désactivation dans la démo, sans nouvelle fenêtre ni requête. Electron conserve en plus son blocage de tous les accès externes ; aucun élargissement de permissions ou appel `shell.openExternal`.

## Périmètre serveur et limites

Certaines notes des phases précédentes envisageaient un raccordement serveur en phase 12. Le périmètre **Navigation/UI** du plan approuvé est livré ici ; **ce raccordement n’est pas réalisé**. Les repositories et services privés précédents restent des composants pour un hôte de confiance. Il n’existe toujours pas de serveur HTTP d’administration authentifié, de session serveur reliée à Electron, de planificateur déployé ou d’activation REAL utilisable depuis cette interface.

Une activation réelle requiert un travail distinct d’intégration et d’exploitation, avec authentification, politique de rétention et suppression, configuration sécurisée, droits/tarifs fournisseurs vérifiés et tests dédiés. Elle ne sera pas annoncée comme automatiquement acquise par les phases 13–14 de démo et livraison. Aucun de ces prérequis n’est nécessaire pour installer la démo Windows finale sans outils de développement.

Pas de migration SQL ou de nouveau format de préférences. Le schéma demeure à 69 tables applicatives et douze versions. Aucun changement d’authentification, droit réseau, processus de publication ou dépendance npm.

## Fichiers et vérification

Créés : `apps/web/src/{navigation,useUrlFilters,watch-model,control-filters}.ts`, `apps/web/src/{Navigation,PageBoundary,PublicationLink,WatchPage}.tsx`, `tests/unit/navigation.test.ts`, ce document.

Modifiés : `main.tsx`, styles, vues personnes/conversations/événement/preuves sociales, cibles de couverture, parcours navigateur/Electron, README et documentation de sécurité/décisions/limites/exploitation. Aucun fichier supprimé ; aucune donnée locale utilisateur modifiée pendant ces essais.

Validation locale :

- **298 tests unitaires/contrats**, dont dix nouveaux sur les neuf pages, anciens liens, contexte partagé, limites de l’URL, acquisition/déduplication, filtres exacts, ID stable, qualité inconnue et hausses documentées. Couverture globale lignes **95,99 %**, branches **91,70 %**, quatre seuils de 80 % conservés.
- **17 parcours Chromium**, dont quatre nouveaux : navigation/filtres/précédent/rechargement, clavier et écran 390 px, personnes actives, états simulés, lien invalide, échec réel du chargement d’un module et récupération, référence externe bloquée sans nouvelle fenêtre ou requête. Le parcours d’erreur bloque volontairement un module local ; l’erreur de chargement attendue figure dans la console du banc.
- Parcours **Electron sous Xvfb** : neuf liens, filtre de veille conservé dans l’URL après rechargement, quota simulé sans liste, anciens tests de préférences, notes, graphiques, sources et protections réseau/IPC.
- Compilation/typecheck, format et `git diff --check` réussis ; audit des dépendances de production : zéro vulnérabilité signalée.

Les essais intermédiaires ont permis de corriger la mise à jour immédiate des cases contrôlées par l’URL et la largeur d’un sélecteur sur petit écran. Aucun scénario supprimé, seuil réduit, timeout augmenté ou retry ajouté. Pas de nouvelle migration ni modification des services PostgreSQL/Redis ; leurs vérifications de non-régression sont conservées en CI.

Validation GitHub Linux/Windows : en cours, liens consignés après réussite.

Il reste **deux phases : 13 — démo étendue et cohérente ; 14 — validation et livraison finales**. Aucune de ces phases n’est commencée ici.
