# MemeRadar pour Windows — édition démo 0.1.0

## Installer

Cible : Windows 10/11, processeur x64. L'installateur prévu est `MemeRadar-0.1.0-Windows-x64.exe`. Aucune installation de Node.js, Docker, PostgreSQL ou Redis n'est nécessaire pour cette édition.

1. Télécharger l'installateur fourni avec cette livraison.
2. Ouvrir le fichier et choisir le dossier d'installation dans l'assistant.
3. Lancer MemeRadar depuis le menu Démarrer ou le raccourci du bureau.

L'application est une première édition de démonstration, sans certificat de signature d'éditeur. Windows peut signaler un éditeur inconnu. Ne désactivez pas vos protections ; faites vérifier le paquet si votre politique d'entreprise exige un logiciel signé. Un certificat et une validation sur une machine Windows restent nécessaires avant une diffusion publique.

## Ce qui fonctionne localement

- Six vues françaises : tableau de bord, événements, tokens, alertes, sources et paramètres.
- Trois scénarios intégrés, huit tokens factices, sources datées, risques simulés et chronologies.
- Scénario Tesla strictement fictif, avec quatre cas d'association et trois alertes pédagogiques dont une supprimée.
- Cinq indicateurs indépendants avec panneau d'explication et entrées manquantes.
- Rejeu de T+0 à T+120 minutes, pas de cinq minutes et lecture accélérée ×300.
- Recherche et filtres par chaîne/niveau d'association dans l'URL interne.
- Règle d'attention modifiable : seuil, réarmement, délai et activation ; historique recalculé de manière déterministe.
- Signalement de faux positifs, mots-clés suivis et recherche depuis la liste.
- Thème clair/sombre et fuseau Toronto/Paris/UTC.
- Enregistrement des préférences sur l'appareil, sans télémétrie, inscription ou clé API.

## Données locales

Les fixtures sont incluses dans l'application. Le fichier `%APPDATA%\MemeRadar\preferences-v1.json` contient uniquement les préférences, la liste de suivi, la règle et les identifiants d'alertes signalées. Un fichier invalide est conservé, avec un avertissement ; la réinitialisation explicite permet de le remplacer. La désinstallation conserve les préférences ; supprimer le dossier après fermeture permet de les effacer manuellement.

Aucun secret ne doit être ajouté à ce fichier. L'accès à l'édition de bureau repose sur la session Windows ; il n'existe pas de compte serveur dans cette version autonome. Un autre utilisateur ayant accès à votre profil Windows peut lire ce fichier.

## Garanties et limites

Le shell Electron charge uniquement les ressources intégrées sous `memeradar://app/` ; les requêtes externes, fenêtres sortantes, téléchargements et permissions non nécessaires sont bloqués. Les URLs fictives .invalid sont affichées sans lien navigable. Le navigateur intégré n'a pas accès à Node ; un preload isolé expose uniquement des opérations locales validées. Aucune mise à jour automatique.

Les valeurs de marché et contrôles de risque sont disponibles à T+60 min. Les contrôles et indicateurs de cette édition sont des règles pédagogiques documentées dans INDICATORS.md ; ils ne constituent pas les futures analyses live. Le catalogue de tokens préchargé reste consultable indépendamment de la position du rejeu ; le curseur rejoue les observations d'attention, de marché et les alertes, pas une découverte exhaustive en temps réel.

Les interrupteurs Sources filtrent des vues locales et signalent la couverture partielle ; aucune ingestion externe n'est démarrée. Le schéma PostgreSQL serveur livré en phase 3 reste indépendant de cette démonstration et n'est pas requis par l'installateur. Le mode réel, les connecteurs fournisseurs et workers serveur restent à développer.

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
