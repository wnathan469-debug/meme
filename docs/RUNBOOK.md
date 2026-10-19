# Exploitation de l'édition de bureau

## Démarrage et fonctionnement

Lancer MemeRadar par le menu Démarrer. La bannière MODE DÉMO doit rester visible. Aucun compte ou fournisseur n'est nécessaire. Vérifier tableau de bord → événement Tesla fictif → token imitateur → panneau « Pourquoi ce niveau ? » → historique d'alertes. Le pied de page et les fiches token rappellent les limites financières.

## Préférences et récupération

Fermer l'application avant intervention sur `%APPDATA%\MemeRadar`. Sauvegarder `preferences-v1.json` pour conserver thèmes, fuseau, mots-clés, règle et faux positifs. Un fichier invalide n'est pas automatiquement écrasé. Après sauvegarde, la commande Réinitialiser les préférences dans Paramètres restaure les valeurs par défaut. Aucune clé API ni donnée de portefeuille n'appartient à ce fichier.

## Pannes

- Fenêtre vide : fermer puis relancer ; si le problème persiste, conserver la version de l'installateur, le système Windows et les étapes de reproduction. Réinstaller depuis le paquet vérifié sans effacer les préférences en premier lieu.
- Métriques absentes : vérifier la position du rejeu (observations marché/risque à T+60 min), les sources exclues et le scénario « données insuffisantes ». Ne pas remplacer les absences par zéro.
- Alertes absentes : vérifier activation/seuils de la règle, position du rejeu et filtre des suppressions. Les heures silencieuses et canaux externes ne sont pas livrés.
- Préférences non enregistrées : vérifier l'accès en écriture au profil Windows ; ne pas déplacer des données vers un dossier partagé sans évaluer les accès.
- Installation bloquée par une politique d'entreprise : faire examiner/signer le paquet selon cette politique ; ne pas désactiver les protections.

## Distribution

Construire avec les dépendances verrouillées, lancer build, tests métier, tests navigateur et shell, puis générer le paquet Windows. Vérifier l'intégrité SHA-256, tester installation et désinstallation sur une machine Windows et signer avant diffusion publique. Les mises à jour sont manuelles ; il n'existe pas de téléchargement automatique au runtime.

Le schéma PostgreSQL serveur est séparé : sa procédure de migration/rollback et ses limites sont dans DATA_MODEL.md. Aucun service serveur n'est lancé par cette édition.


## Serveur V2 — migrations et reprise

La procédure [V2_PHASE2.md](V2_PHASE2.md) remplace les anciennes commandes de mise à niveau serveur. Utiliser db:migrate après sauvegarde restaurée sur une autre base, collecteurs arrêtés et version de workers cohérente. Un rollback V2 refuse toute perte ; ne pas supprimer les données pour contourner ce refus. PostgreSQL conserve désormais les budgets et le journal, Redis les coordinations temporaires. Sauvegarder les deux selon leurs garanties, ne pas rembourser automatiquement une réservation ambiguë. La base/les services ne sont toujours pas nécessaires à l'installation de la démo Windows.


## Worker X privé — phase 3

Migrer à 0006, configurer le rôle/propriétaire serveur et les bornes vérifiées, puis seulement activer X_COLLECTION_MODE. `npm run x:collect` seul reste un diagnostic sans connexion ; `--once` effectue un polling borné et `--run` la boucle configurée. SIGINT/SIGTERM ferment le worker. Ne pas supprimer les réservations ambiguës ni avancer manuellement un curseur après erreur. Les trous sont conservés dans les exécutions interrompues ; un rattrapage borné n'affirme pas l'exhaustivité. La vérification de disponibilité est explicite, pas encore planifiée. Procédure complète et limites : V2_PHASE3.md.

## Sources et API — phase 11

Sauvegarder et migrer jusqu’à **0012** avant de lancer le runtime actuel. Utiliser le service privé avec l’identité établie par l’hôte : `sources.initialize()` est explicite et idempotent, puis lecture/sauvegarde avec révision. Une lecture n’effectue aucune requête fournisseur. La configuration réseau de l’hôte reste le coupe-circuit prioritaire. Le test X nécessite un profil public cible choisi explicitement via `createSourcesRuntime` ; aucun profil n’est choisi par défaut. Préparer puis confirmer le devis seulement après examen du coût maximal. Un échec consomme le nonce : pas de rejeu automatique. Ne jamais diminuer artificiellement le journal ou rembourser une réservation ambiguë pour débloquer un plafond. Les fréquences modifiées n’annulent pas une requête en cours et ne forcent pas un checkpoint déjà planifié. Interface actuelle démo, raccordement serveur en phase 12 ; voir [phase 11](V2_PHASE11.md).

## Navigation V2 — phase 12

Ouvrir Veille X depuis le menu : recherche locale, filtres dans l’URL, états simulés explicitement. Effacer les filtres pour retrouver l’extrait. La synthèse du tableau de bord relit à l’ouverture les réglages locaux des sources/personnes ; une personne en pause n’apparaît pas dans les dernières publications actives. Un module de vue échoué propose « Recharger la vue » ; le menu et l’avertissement financier restent accessibles. Un clic sur une référence externe indique son blocage en mode DEMO. Pas de nouvelle migration ou de nouvelle procédure serveur ; le branchement REAL envisagé dans les anciens jalons n’est pas activé. Voir [phase 12](V2_PHASE12.md).

## Scénario partagé — phase 13

Utiliser le panneau « Parcours guidé Nébula Mobile ». Ajouter/valider/activer un profil fictif, puis Veille X → conversation → adresse → graphique → risques → alerte → Sources et API. L’horloge reste au même point après navigation/rechargement ; trois publications fictives à T+61–63 permettent d’essayer une alerte créée à T+60. Les boutons d’avancement des alertes et diagnostics pilotent cette horloge. « Recommencer » ne supprime pas les archives ; un traitement d’alerte est suspendu si le curseur précède leur dernière évaluation. Une session illisible dans `memeradar-demo-session-phase13-v1` est conservée et les commandes verrouillées ; sauvegarder le profil avant intervention, ne pas supprimer les autres préférences pour contourner un problème. Aucun service serveur nécessaire à la démonstration. Voir [phase 13](V2_PHASE13.md).


## Serveur local — étape 3 du passage aux données réelles

Sauvegarder puis migrer à 0013 avant les nouveaux programmes. Construire avec npm run api:build ; provisionner l’administrateur via variables sécurisées et api:admin:built, puis retirer ces secrets. Exécuter api:start avec un rôle SQL distinct sans superuser/BYPASSRLS et TLS configuré. POST /v1/collection/stop exige une session et un corps JSON vide ; l’arrêt est partagé et persistant. Aucune route de reprise ni politique financière n’est activée par défaut. Les réservations conservatrices ne sont pas une facture et ne doivent pas être effacées. Hébergement, proxy et restauration restent à valider. Guide complet : [étape 3](REAL_DATA_STEP3_SERVER.md).

Après restauration d’une sauvegarde, maintenir les collectes arrêtées et rapprocher les réservations conservées des opérations/factures intervenues depuis cette sauvegarde avant toute réactivation. Une ancienne sauvegarde ne prouve pas l’absence de dépenses ultérieures.
