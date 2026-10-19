# Vérification du téléchargement MemeRadar 0.2.0

[Télécharger le ZIP Windows](https://github.com/wnathan469-debug/meme/releases/download/v0.2.0/MemeRadar-0.2.0-Windows-x64-installer.zip) · [EXE direct](https://github.com/wnathan469-debug/meme/releases/download/v0.2.0/MemeRadar-0.2.0-Windows-x64.exe) · [Page de publication](https://github.com/wnathan469-debug/meme/releases/tag/v0.2.0) · [Empreintes publiées](https://github.com/wnathan469-debug/meme/releases/download/v0.2.0/SHA256SUMS.txt)

## Contrôles effectués

Les trois fichiers publics ont été téléchargés **intégralement sans authentification**, par HTTPS, avec la validation TLS normale du système. HTTP 200 pour chaque fichier ; tailles reçues comparées à Content-Length. Pour le ZIP et l’EXE, le serveur renvoie `Content-Disposition: attachment`, qui déclenche un téléchargement dans un navigateur. Aucun lien ChatGPT ou `/workspace` n’est nécessaire.

Le ZIP téléchargé passe son contrôle CRC complet. Son EXE a exactement le même SHA-256 que l’EXE téléchargé séparément et les deux manifestes d’empreintes. L’EXE possède un en-tête Windows PE valide et dépasse 50 Mo ; son installation et son lancement ont été testés avant publication dans la CI Windows. Ces contrôles vérifient la complétude et la cohérence des fichiers ; le paquet reste non signé.

| Fichier publié | Taille exacte | SHA-256 |
|---|---:|---|
| MemeRadar-0.2.0-Windows-x64-installer.zip | 114451086 octets | `a2c135da69041190787d7cf2b61aa813e297e002ca796a7127380936a16cb315` |
| MemeRadar-0.2.0-Windows-x64.exe | 114441049 octets | `1a12b4c741750a714ade4be900c9e445bf4048d1fb4a9f1c52e690857a07aad8` |

Le ZIP contient : `FEATURE_MATRIX.md`, `Guide-MemeRadar.md`, `LIRE-MOI.txt`, `MemeRadar-0.2.0-Windows-x64.exe`, `SHA256SUMS.txt`. Il inclut le même installateur que le lien direct.

Le clic de téléchargement dans Chrome sur votre PC n’a pas été exécuté ici. Le navigateur Chromium du cloud refuse le certificat du proxy de cet environnement ; la revue automatique a refusé son ajout permanent au profil, car cela élargirait la confiance HTTPS. Aucun certificat ni contrôle TLS n’a été désactivé. La vérification des fichiers repose sur le téléchargement HTTPS anonyme validé décrit ci-dessus.

## Installation sur votre PC

Dans Chrome, télécharger le ZIP, puis clic droit → **Extraire tout** dans l’Explorateur Windows. Fermer l’ancienne application, ouvrir `MemeRadar-0.2.0-Windows-x64.exe` et suivre l’assistant. Lancer MemeRadar depuis le menu Démarrer. Aucun Node.js, Docker, outil de développement, compte ou clé API requis. Cible Windows 10/11 x64. Le paquet non signé peut déclencher un avertissement d’éditeur inconnu ; le guide détaille cette limite.

Vérification facultative, avec PowerShell déjà inclus dans Windows : `Get-FileHash .\MemeRadar-0.2.0-Windows-x64-installer.zip -Algorithm SHA256`, puis comparer à la ligne ci-dessus.

## Traçabilité et limites

[Validation, construction et publication réussies](https://github.com/wnathan469-debug/meme/actions/runs/39184827033), code applicatif `e10cf26`. Le workflow impose : tests métier/SQL/PostgreSQL/Redis sous Linux ; compilation, tests unitaires et vingt parcours navigateur Windows ; installation silencieuse réelle ; test Electron sur **l’exécutable installé** avec profil isolé, redémarrage, IPC/réseau bloqués ; désinstallation, puis extraction et empreinte du ZIP.

Le runner Windows Server ne remplace pas un essai manuel de l’assistant ou de SmartScreen sur Windows 10/11. La mise à niveau complète depuis le binaire 0.1.0 n’a pas été exécutée ; sauvegarder `%APPDATA%\MemeRadar` complet avant mise à niveau. Aucune mise à jour automatique. Démonstration entièrement fictive, pas de connexion REAL.

La [publication historique 0.1.0](https://github.com/wnathan469-debug/meme/releases/tag/v0.1.0) reste inchangée ; son manifeste public a été relu et correspond aux empreintes historiques. Les fichiers de 0.2.0 ont leur propre publication, sans remplacement des anciens fichiers.
