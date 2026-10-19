# Phase 14 V2 — validation et distribution Windows 0.2.0

Cette phase prépare la distribution de la démonstration des phases 1–13. Elle ne transforme pas les services privés en application REAL : le serveur HTTP authentifié et son raccordement restent à développer.

## Livraison

Version npm/lock, interface et pont Electron alignés sur 0.2.0. Installateur NSIS x64 français, ZIP contenant ce même EXE, guide et empreinte. Nouvelle publication v0.2.0 ; v0.1.0 conservée sans remplacement.

Le pipeline Windows vérifie les tests unitaires et les vingt parcours navigateur, construit le paquet, l’installe silencieusement dans un dossier temporaire, lance le test Electron complet sur **l’exécutable installé**, puis le désinstalle. L’échec d’un contrôle bloque la publication, y compris les validations Linux PostgreSQL/Redis du workflow réutilisé. Ce contrôle ne remplace pas les interactions avec l’assistant ou SmartScreen sur Windows 10/11. Le profil de test est isolé ; aucune préférence personnelle n’est modifiée. Le test Linux conserve son option de conteneur ; Windows n’utilise pas `--no-sandbox`.

Le ZIP est extrait et son EXE comparé par SHA-256 avant publication. Le téléchargement HTTPS public doit ensuite être relu intégralement, le ZIP vérifié et son EXE comparé au téléchargement direct et au manifeste publié. Résultats et empreintes : DOWNLOAD_VERIFICATION.md.

## Utilisation et exploitation

Pour le PC : suivre DESKTOP.md, aucun outil requis. Pour le développement : `npm ci`, `npm run build`, `npm start`. `npm run dev` ouvre le renderer de développement. `npm run test:db`, `npm run test:db:v2` et `npm run test:redis` utilisent Docker ; les exécuter séquentiellement avec les autres tests de couverture.

Migrations privées : procédure V2_PHASE2.md, sauvegarde et manifest jusqu’à 0012, arrêt des collecteurs avant restauration. `npm run x:diagnose` et `npm run x:collect` sans argument restent hors ligne ; ce ne sont pas des commandes pour activer REAL dans l’application. Ne pas fournir de secrets à Electron ou VITE_*. `.env.example` documente uniquement le futur serveur, sans chargement automatique.

Pour une mise à niveau de la démo : fermer, sauvegarder `%APPDATA%\MemeRadar` complet, installer dans le même compte/dossier. Les formats sont conservés ; le passage complet depuis l’ancien binaire n’est pas annoncé comme testé. La désinstallation conserve le profil.

La matrice FEATURE_MATRIX.md distingue démonstration, code privé testé, accès X et fonctions indisponibles. SECURITY.md, PROVIDERS.md et RUNBOOK.md conservent les conditions avant activation réelle : permissions/prix vérifiés, quotas/plafonds, tests de connexion explicites, rotation des secrets côté serveur, sauvegardes et revue juridique.

## Validation

Validation finale réussie : compilation/typecheck, format et audit de production (zéro vulnérabilité signalée), **316 tests unitaires/contrats + 104 PostgreSQL + sept Redis**, soit **427 tests TypeScript distincts** ; 51 contrôles SQL V1 et protections de migration ; **20 parcours navigateur**, dont navigation à 1024 × 600 ; test Electron Linux à 1024 × 768. Couvertures : unités lignes 96,10 %, branches 91,86 % ; PostgreSQL lignes 93,14 %, branches 84,82 % ; seuils de 80 % inchangés. Diagnostic/collecte par défaut : zéro appel fournisseur.

[CI finale réussie](https://github.com/wnathan469-debug/meme/actions/runs/39184827033) sur `e10cf26` : validations Linux, vingt parcours navigateur Windows, NSIS, installation native silencieuse, test complet de l’EXE installé puis désinstallation ; création/extraction du ZIP et publication. Le contrôle natif a révélé un menu inaccessible sur fenêtre peu haute : ajout du défilement vertical à la barre latérale et vérification de l’accès aux paramètres puis retour au tableau de bord à 1024 × 600. La correction a été reconstruite et revalidée ; aucun test désactivé ni délai d’assertion augmenté.

Version publique **v0.2.0** disponible, ZIP et EXE téléchargés intégralement sans authentification, HTTP 200, Content-Length et Content-Disposition vérifiés, CRC du ZIP et SHA-256 des deux EXE/manifeste concordants. Tailles/empreintes et limites du contrôle navigateur cloud : [DOWNLOAD_VERIFICATION.md](DOWNLOAD_VERIFICATION.md). Les liens du guide et du README pointent vers cette nouvelle publication ; 0.1.0 reste intacte.

Pas de test manuel de l’assistant sur un PC Windows 10/11, de signature d’éditeur, de test complet de mise à niveau de l’ancien binaire, de backend HTTP authentifié, de collecte réelle ou de dépenses fournisseur. La phase 14 livre la démonstration Windows validée, pas l’activation REAL du cahier des charges.
