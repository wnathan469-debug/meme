# Matrice fonctionnelle — 0.3.1 autonome sur PC

La version actuelle ajoute le moteur local X sans hébergement. Aucun accès fournisseur n’est fourni et aucun appel réel n’a encore été vérifié sur un compte X. Voir [le guide local](LOCAL_WINDOWS.md).

| Fonction du mode local | Livraison actuelle | Condition d’utilisation |
|---|---|---|
| Stockage, profils, publications et budgets | SQLite intégré, données conservées sur le PC | Application ouverte ; compte Windows protégé |
| Clé X | Chiffrement safeStorage Windows, jamais renvoyée à l’interface | Protection système disponible ; saisie locale uniquement |
| Profils publics et veille X | Trois profils, une page de dix publications par profil et par heure | Accès officiel, droits/tarifs vérifiés et autorisation explicite |
| Plafonds, arrêt et redémarrage | Réservations avant appel, compteurs durables, collecte arrêtée au lancement | Limites propres à cette installation, hors abonnements et autres clients |
| Conversations, événements, marché, risques, alertes et notifications | Non raccordés au mode local | Futurs travaux ; aucune substitution par des données fictives |
| Démonstration historique | Disponible séparément, neuf pages et données fictives | Aucun accès API requis |
| Installation Windows x64 | EXE et ZIP, runtime inclus, aucun outil de développement à installer | Windows 10/11 x64 ; paquet non signé |

## Historique de la démonstration 0.2.0

La matrice ci-dessous décrit l’ancienne version et son architecture cloud envisagée. Ses conditions « serveur obligatoire » ne s’appliquent pas au moteur local choisi depuis par l’utilisateur.

# Matrice fonctionnelle — 0.2.0

Le paquet Windows est autonome et entièrement **DEMO hors ligne**. « Implémenté en privé » signifie code serveur testé sur fixtures/bases jetables ; cela ne signifie pas service hébergé ni raccordement à l’interface.

| Fonction | Dans l’application Windows | Code privé / accès réel requis | Condition d’activation réelle |
|---|---|---|---|
| Neuf pages, navigation, préférences et notes | Livré, données locales fictives | Aucun accès requis | Déjà utilisable hors ligne |
| Veille et personnes suivies | Publications fictives, ID stables, pause | Client/collecteur X privé testé ; droits X requis | Serveur authentifié, identité, accès contractuel et budgets vérifiés |
| Conversations et couverture | Démo partielle 35/120, 29,17 % | Chargement privé avec devis testé ; accès X requis | Raccordement serveur et confirmation du coût |
| Événements et preuves sociales | Explications et provenances fictives | Services privés testés | Collecte réelle, couverture et revue officielle |
| Tokens, pools et bougies | Marché synthétique, trous conservés | Adaptateur/cache privé testé sur fixtures | Prestataires autorisés, correspondance chaîne/adresse vérifiée |
| Dix-sept contrôles de risque | Preuves fictives ; inconnu/échec/contradiction visibles | Adaptateurs de lecture testés sans réseau | Droits, fraîcheur et comparaisons avec explorateurs |
| Alertes locales | Mots-clés/personnes sur le scénario ; autres types préenregistrés | Moteur privé testé | Serveur, données réelles, exécution et journal raccordés |
| Quotas, budgets, 429 et déconnexions | Simulations explicites, aucun débit réel | Plafonds durables PostgreSQL/Redis testés | Prix/permissions confirmés et réservations conservées |
| Temps réel X | Non disponible ; jamais annoncé en direct | Flux privé borné, testé sur fixtures | Droit stream et borne contractuelle de facturation |
| Mode REAL depuis l’interface | Non disponible | Pas de serveur HTTP authentifié livré | Développement et validation de bout en bout requis |
| Webhook, SMTP, notifications externes | Non disponibles | Pas de livraison externe exécutée | Implémentation, consentement et tests dédiés |
| Connexion portefeuille / transaction | Non proposée | Aucune | Hors périmètre |
| Installation Windows x64 | Installateur et ZIP, sans outil de développement | Electron embarqué | Windows 10/11 x64 ; paquet non signé |
| Mise à jour automatique | Non disponible | Aucune | Nouvelle installation manuelle |

Avant toute activation réelle : revoir droits/CGU, prix, plafonds, secrets côté serveur, contrôle de connexion explicite, sauvegarde/restauration, sécurité et exigences juridiques. Une absence de risque observé ne garantit rien. Voir PROVIDERS.md, SECURITY.md, RUNBOOK.md et LIMITATIONS.md.
