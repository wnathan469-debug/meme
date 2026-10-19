# Vérification du téléchargement — Windows 0.3.2, correction des boutons

Contrôle du 19 octobre 2026 : les deux fichiers publics ont été téléchargés entièrement avec HTTP 200. Leurs empreintes SHA-256 correspondent au manifeste publié ; les CRC du ZIP sont valides et l’installateur à l’intérieur est identique à l’EXE direct. En-tête Windows MZ présent.

Source publiée : `f355faf7b4ef3fb88ca7d9fc107e7f5822ac84c3`. [Validation et publication réussies](https://github.com/wnathan469-debug/meme/actions/runs/39297424842) : compilation, 337 tests unitaires/contrats, 21 parcours navigateur dont le contrôle de contraste sombre/clair, et installation/lancement/redémarrage/désinstallation de l’application native Windows. Validation Linux historique réussie également. Le contrôle d’interface emploie un pont local simulé sans appels fournisseur ; le parcours natif utilise le moteur SQLite et le coffre Windows.

Correction : couleurs explicites des boutons du mode local et du retour depuis la démo, y compris survol, sélection et état désactivé ; focus clavier vérifié. Contraste texte/fond d’au moins 4,5:1 sur les boutons contrôlés dans les deux thèmes. Aucun changement de schéma SQLite ou de fonctionnement de la collecte. La collecte X réelle reste non vérifiée.

| Fichier | Octets | SHA-256 |
|---|---:|---|
| [MemeRadar-0.3.2-Windows-x64.exe](https://github.com/wnathan469-debug/meme/releases/download/v0.3.2/MemeRadar-0.3.2-Windows-x64.exe) | 114461389 | `a8f8ddc38c462528ddf18a213f7e13f7d491a3977c69ccc287a374f9787bff0e` |
| [MemeRadar-0.3.2-Windows-x64-installer.zip](https://github.com/wnathan469-debug/meme/releases/download/v0.3.2/MemeRadar-0.3.2-Windows-x64-installer.zip) | 114473660 | `8798859d1b2e6f87212542f2892d0370ffbf71e4af8de01350c24733cb4c8080` |

Pour mettre à jour : arrêter la collecte, fermer complètement MemeRadar, sauvegarder le dossier complet `%APPDATA%\MemeRadar`, extraire le ZIP et lancer le nouvel installateur avec le même compte Windows et le même dossier d’installation. Aucun outil de développement nécessaire. Ne pas désinstaller ni supprimer les données pour cette correction. Installateur non signé ; ne pas désactiver les protections Windows. La mise à niveau sur le PC particulier de l’utilisateur reste à confirmer.

## Historique 0.3.1

# Vérification du téléchargement — Windows autonome 0.3.1

Contrôle du 19 octobre 2026 : fichiers téléchargés entièrement depuis leurs liens publics, HTTP 200, SHA-256 comparés au manifeste. ZIP contrôlé par CRC et contenu EXE comparé au téléchargement direct.

Publication construite et testée depuis `cc98528babdba1856f7f45edf55df71337fc3a98` : [CI réussie](https://github.com/wnathan469-debug/meme/actions/runs/39271272337). Le pipeline ultérieur de documentation conserve les fichiers immuables de cette publication.

| Fichier | Octets | SHA-256 |
|---|---:|---|
| [MemeRadar-0.3.1-Windows-x64.exe](https://github.com/wnathan469-debug/meme/releases/download/v0.3.1/MemeRadar-0.3.1-Windows-x64.exe) | 114460700 | `ba5c454dc74d4dc219246a301616f4a29d89f5891e2789ddb55be53fd6770208` |
| [MemeRadar-0.3.1-Windows-x64-installer.zip](https://github.com/wnathan469-debug/meme/releases/download/v0.3.1/MemeRadar-0.3.1-Windows-x64-installer.zip) | 114471288 | `e1ac7dec26c001839a4bbe5aba87be768aa2fe79293027a3e451ac9a4d5af731` |

[Page de publication et téléchargements](https://github.com/wnathan469-debug/meme/releases/tag/v0.3.1) · [Guide du mode local et limites](LOCAL_WINDOWS.md).

Aucun outil de développement à installer. La collecte X exige un accès fournisseur, des tarifs vérifiés et une autorisation explicite dans l’application. Aucun appel réel validé avec un compte X pendant cette recette. Les autres modules restent non raccordés au mode local. Installateur non signé.

## Historique des vérifications précédentes

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
