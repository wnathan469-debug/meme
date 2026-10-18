# Sécurité — édition démo

Le shell Electron fonctionne avec contextIsolation et sandbox activés, nodeIntegration désactivé, CSP locale, refus des sorties HTTP(S), fenêtres et téléchargements. Le renderer ne reçoit que les méthodes de préférences validées, une copie au presse-papiers limitée aux adresses fictives et la version ; les IPC vérifient émetteur, frame principale et origine interne.

Les préférences sont validées par Zod aux deux frontières, limitées en taille et remplacées par écriture temporaire/renommage. Le stockage ne contient pas de secret. Les contenus fictifs sont rendus comme texte React, jamais injectés avec innerHTML. Aucun client blockchain, portefeuille, signature ou transaction n'est livré.

Le modèle de menace couvre des données locales invalides et une tentative de navigation externe ; il ne protège pas contre un administrateur du PC, une session Windows compromise ou un installateur modifié. Le blocage réseau applicatif ne remplace pas la politique réseau de la machine. Les sessions du navigateur/Chromium peuvent avoir des comportements système propres ; aucun mécanisme de télémétrie n'est ajouté par MemeRadar.

Le futur mode live exigera l'ensemble des protections de l'architecture serveur (authentification, CSRF, SSRF avec DNS/redirects contrôlés, secrets, quotas et audit). Elles ne sont pas déclarées implémentées par cette édition hors ligne.

Les dépendances sont verrouillées par package-lock.json. Voir VALIDATION.md pour le résultat de l'audit. Le paquet n'est pas signé : signature et essais Windows natifs nécessaires avant diffusion publique.
