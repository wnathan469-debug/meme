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
