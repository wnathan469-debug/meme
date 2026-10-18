# Résultats de validation — édition 0.1.0

Les résultats ci-dessous concernent l'environnement cloud Linux et les fichiers de cette livraison.

| Vérification | Résultat |
|---|---|
| TypeScript strict et build Vite | Réussis |
| Tests unitaires métier et sécurité statique | 30 tests réussis |
| Couverture packages/core/domain.ts | Lignes/instructions/fonctions 100 %, branches 97,82 % ; pas une couverture des futurs modules live |
| Playwright Chromium | 3 parcours réussis : Tesla/imitateur/explications/alertes/filtres, persistance/règle/rejeu, petit écran/données manquantes/sources |
| Shell Electron sous Linux avec affichage virtuel | Réussi : démarrage, deep link, IPC invalides rejetés, préférences après redémarrage, copie d'adresse, absence de Node côté renderer, options d'isolation et refus réseau main/renderer |
| Formatage Prettier | Réussi |
| PostgreSQL 16 | 51 assertions d'intégrité avant et après rollback ; répétabilité, garde destructive, atomicité sur erreur et migrateurs concurrents réussis |
| Audit npm, dépendances de production | 0 vulnérabilité signalée lors du contrôle |
| Audit npm, chaîne complète de développement | 8 signalements modérés transitifs dans la chaîne electron-builder / @electron/get / global-agent / roarr / sprintf-js ; 0 élevé/critique. Non inclus dans les dépendances runtime du paquet. Pas de correction forcée ou de rétrogradation automatique |

Le banc shell passe `--no-sandbox` uniquement au processus de test Linux en conteneur ; il vérifie les options du renderer et ses restrictions, sans prétendre vérifier le sandbox système Windows. Le paquet Windows ne désactive pas son sandbox. Les tests navigateur n'ont observé aucune requête externe du renderer. Les tests shell provoquent deux requêtes vers example.org et vérifient leur rejet par la politique applicative avant accès externe.

Construction NSIS Windows x64 réussie, assistant en français, métadonnées/icône appliquées, paquet non signé. Le contenu ASAR a été comparé aux fichiers actuels du shell, de validation et du renderer ; aucun paquet de test/construction n’est inclus dans les dépendances du paquet. L’archive NSIS passe la vérification 7-Zip ; empreinte SHA-256 fournie dans release/SHA256SUMS.txt. Le désinstalleur intermédiaire a été extrait par le lecteur natif inclus dans electron-builder, sans exécuter de code Windows sur cet hôte. Une validation native de l'assistant, du démarrage et de la désinstallation sur Windows 10/11 reste requise sur la machine de destination. Aucun test sur une machine Windows réelle n'est annoncé.

Les tests n'ont interrogé aucune API d'actualité, réseau social ou blockchain. Les observations restent fictives. Ni la disponibilité des fournisseurs, ni les performances live, ni la conformité juridique ne sont validées.
