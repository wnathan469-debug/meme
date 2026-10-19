# MemeRadar pour Windows — édition autonome 0.3.0

## Installer

Cible : Windows 10/11, processeur x64. L'installateur prévu est `MemeRadar-0.3.0-Windows-x64.exe`. Aucune installation de Node.js, Docker, PostgreSQL ou Redis n'est nécessaire pour cette édition.

1. [Télécharger le ZIP de l’installateur depuis GitHub](https://github.com/wnathan469-debug/meme/releases/download/v0.3.0/MemeRadar-0.3.0-Windows-x64-installer.zip).
2. Dans l’Explorateur Windows : clic droit sur le ZIP → **Extraire tout**.
3. Ouvrir `MemeRadar-0.3.0-Windows-x64.exe` dans le dossier extrait et suivre l’assistant.
4. Lancer MemeRadar depuis le menu Démarrer ou le raccourci du bureau.

[Page de publication de secours](https://github.com/wnathan469-debug/meme/releases/tag/v0.3.0) : ouvrir la section **Assets** et sélectionner le fichier se terminant par `-installer.zip`. Les liens `/workspace/...` désignent le disque cloud et ne sont pas des téléchargements publics.

L’application fournit un mode local X configurable et une démonstration séparée. Elle n’a pas de certificat de signature d’éditeur. Windows peut signaler un éditeur inconnu. Ne désactivez pas vos protections ; faites vérifier le paquet si votre politique d'entreprise exige un logiciel signé. La signature d’éditeur n’est pas disponible ; les tests automatisés de Windows Server CI ne remplacent pas une vérification sur votre PC Windows 10/11.

## Mode autonome local X

Le [guide local 0.3.0](LOCAL_WINDOWS.md) décrit SQLite, la clé protégée par Windows, les tarifs à vérifier et l’autorisation de collecte. Le PC doit rester allumé et l’application ouverte. Aucun serveur cloud n’est requis. Le mode démarre vide et arrêté ; aucun accès fournisseur n’est fourni. Les autres modules réels restent non raccordés.

## Mode démonstration hérité

- Neuf pages françaises : tableau de bord, veille, personnes, conversations, événements, tokens, alertes, sources et paramètres.
- Scénario Nébula : 63 publications fictives, quatre tokens, trois profils suivables et une conversation partielle (35 réponses observées sur 120 annoncées). Les huit tokens historiques restent des exemples distincts.
- Horloge commune conservée après navigation/redémarrage, de T+0 à trois jours, avec rejeu ×300. Les prix fictifs ne couvrent que T+8 à T+120 ; les périodes absentes restent vides.
- Analyse par chaîne/adresse, bougies, pools et marqueurs ; 17 contrôles de risque avec preuves, états inconnus et contradictions.
- Alertes locales persistantes ; mots-clés et personnes utilisent les publications du scénario. Les autres types restent des cas pédagogiques préenregistrés.
- Sources et API simulées : quota, budget, déconnexion, données partielles et reprise. Aucun coût réel, appel fournisseur ou saisie de secret.
- Thème, fuseau, notes privées et filtres. Voir la [matrice fonctionnelle](FEATURE_MATRIX.md).

## Mise à niveau depuis une version précédente

Fermer MemeRadar puis exécuter le nouvel installateur, dans le même compte Windows et le même dossier. Le nom d’application et les formats existants sont conservés ; les nouvelles vues ajoutent leurs stockages locaux sans effacer les anciens réglages. Avant mise à niveau, sauvegarder tout le dossier `%APPDATA%\MemeRadar` après fermeture. Cette conservation est testée au redémarrage ; une mise à niveau complète 0.1.0 → 0.2.0 n’est pas encore testée sur votre PC. Aucune mise à jour automatique.

## Données locales

Les fixtures sont incluses dans l'application. Le dossier `%APPDATA%\MemeRadar` contient `preferences-v1.json` et les stockages Chromium des personnes, notes, alertes, sources et session démo. Sauvegarder le dossier complet, pas seulement le fichier de préférences. Un fichier invalide est conservé, avec un avertissement ; la réinitialisation explicite permet de le remplacer. La désinstallation conserve les préférences ; supprimer le dossier après fermeture permet de les effacer manuellement.

Aucun secret ne doit être ajouté à ce fichier. L'accès à l'édition de bureau repose sur la session Windows ; il n'existe pas de compte serveur dans cette version autonome. Un autre utilisateur ayant accès à votre profil Windows peut lire ce fichier.

## Garanties et limites

Le shell Electron charge uniquement les ressources intégrées sous `memeradar://app/` ; les requêtes externes, fenêtres sortantes, téléchargements et permissions non nécessaires sont bloqués. Les URLs fictives .invalid sont affichées sans lien navigable. Le navigateur intégré n'a pas accès à Node ; un preload isolé expose uniquement des opérations locales validées. Aucune mise à jour automatique.

Les valeurs de marché et risques sont fictifs ; une mention n’est pas un soutien officiel. Les bases privées PostgreSQL/Redis et adaptateurs testés séparément ne sont pas raccordés à cette application. Aucun mode REAL, serveur HTTP authentifié, collecte live ou livraison externe d’alertes n’est disponible. Aucun portefeuille ni transaction.

## Développer et reconstruire

Node 24 et npm, puis depuis la racine :

```bash
npm ci
npm run build
npm test -- --coverage
npm run test:e2e
npm start
npm run dist:win
```

`npm run dist:win` produit un installateur NSIS dans `release/`. Sur Linux, `scripts/build-windows.cjs` réutilise le lecteur natif de désinstalleur NSIS livré par electron-builder, normalement employé sur macOS, pour éviter l’exécution IA-32 indisponible sur certains hôtes cloud. Cet adaptateur est limité au désinstalleur intermédiaire non signé et à la version verrouillée du builder ; il échoue sur toute autre demande d’outil Windows. Il ne modifie pas les dépendances et ne désactive aucune vérification de téléchargement. `npm run dist:zip` produit une archive portable alternative. Les téléchargements de construction sont distincts du fonctionnement hors ligne de l'application. Pour les tests navigateur, installer Chromium avec Playwright (`npx playwright install chromium`) puis préciser CHROMIUM_PATH si nécessaire ; le banc cloud utilise `/usr/bin/chromium`.

Le test PostgreSQL utilise Docker : `npm run test:db`. Les tests Electron nécessitent un affichage (virtuel sur Linux). Le banc Electron cloud passe `--no-sandbox` uniquement au processus de test Linux pour fonctionner dans son conteneur ; le paquet Windows ne reçoit pas cette option. Les paquets Windows générés sur Linux doivent encore être essayés sur une machine Windows ; un test du renderer et du shell sous Linux ne valide pas l'assistant Windows.
