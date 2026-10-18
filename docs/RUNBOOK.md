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
