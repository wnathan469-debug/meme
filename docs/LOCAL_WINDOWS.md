# MemeRadar 0.3.2 — fonctionnement autonome sur Windows

Le choix utilisateur remplace l’hébergement cloud par un moteur intégré à l’application. **Aucun serveur à louer, aucun Node.js, Docker, PostgreSQL ou Redis à installer sur le PC.** Le moteur utilise SQLite inclus dans Electron. Les anciens travaux cloud restent disponibles dans le dépôt mais ne sont ni démarrés ni requis. Aucun abonnement Railway n’a été souscrit.

## Installer et démarrer

Télécharger le ZIP Windows 0.3.2 depuis [la publication GitHub](https://github.com/wnathan469-debug/meme/releases/tag/v0.3.2), l’extraire puis ouvrir l’installateur `.exe`. L’application est non signée ; les règles de sécurité Windows restent applicables. Ne pas désactiver les protections pour l’installer. Pour remplacer une ancienne version : fermer MemeRadar, sauvegarder son dossier de données, puis utiliser le même compte Windows et le même dossier d’installation. L’upgrade sur votre PC particulier n’est pas présumé testé.

L’écran initial est **« MemeRadar — sur mon PC »**, vide et collecte arrêtée. L’ancienne démonstration se trouve derrière **« Ouvrir la démonstration »** ; **« Utiliser sur mon PC »** revient au moteur local. Le mode choisi est conservé. Il n’existe aucun remplissage automatique des vues locales avec le scénario Nébula.

## Accès X à configurer, sans secret dans la conversation

1. Obtenir un accès officiel X permettant la lecture des profils et timelines publics. Aucun accès, quota, abonnement ou prix X n’est fourni avec MemeRadar. L’inscription éventuelle et les frais X restent indépendants de l’installateur et nécessitent votre décision.
2. Dans **Sources et accès**, saisir le jeton Bearer uniquement dans le champ mot de passe de l’application. **Enregistrer la clé** ne fait aucun appel réseau. Le champ est vidé et la valeur n’est jamais renvoyée par l’interface locale.
3. Cliquer **Configurer les profils et budgets** : un à trois noms publics sans `@` ou séparés par une virgule. Le nom n’est pas une preuve de l’identité de son propriétaire.
4. Vérifier dans votre compte X les droits et les bornes maximales par requête, publication et profil retourné. Renseigner chaque montant en USD, avec un point décimal et au plus six décimales. Un tarif inconnu reste vide ; zéro doit être un tarif explicitement vérifié. Les coûts dépendent du compte et ne sont pas devinés. Si la facturation ne peut pas être bornée par ce modèle, ne pas démarrer la collecte.
5. Choisir vos plafonds quotidien et mensuel et votre maximum de requêtes par jour (au plus 150). Les valeurs proposées 1 USD/jour et 20 USD/mois ne sont pas activées tant que vous n’avez pas enregistré et autorisé la collecte. Confirmer droits, conservation et tarifs vérifiés. Cette vérification expire après sept jours ; une nouvelle vérification utilisateur est nécessaire, sans renouvellement implicite.
6. Cocher l’autorisation d’appels aux tarifs et plafonds enregistrés, puis **Démarrer la collecte**. Aucun test de connexion payant caché à la sauvegarde d’une clé ou à l’ouverture d’un écran.

Les tarifs doivent notamment couvrir la totalité des ressources retournées, y compris les profils inclus avec les publications. Le coût maximal est réservé **avant** chaque appel. Les plafonds ne contrôlent ni un abonnement fixe X ni des appels faits par une autre application, un autre PC ou un autre utilisateur du même compte fournisseur. Configurer aussi les limites proposées par X lorsqu’elles existent. Aucun plafond de facture global n’est garanti.

## Fonctionnement actuel

- Résolution d’un profil public, puis une page d’au plus dix publications ; trois profils maximum, un cycle au plus par heure. Les lectures manuelles de l’écran ne déclenchent pas d’appel X.
- Appels uniquement depuis le processus principal Node, vers `https://api.x.com/2` avec le transport existant : TLS, DNS public vérifié et fixé, redirections/URL arbitraires refusées, délai borné. Le renderer demeure isolé et ne peut pas accéder directement au réseau ou aux fichiers.
- Zéro répétition automatique d’un appel en échec, aucun accès de secours, flux payant, recherche globale ou pagination supplémentaire. Une page tronquée ou incomplète est signalée ; aucune exhaustivité promise.
- Réponses décodées par les contrats X existants ; identifiants réels, dates de publication/collecte, compteurs inconnus conservés comme inconnus. Les tests utilisant des réponses synthétiques ne sont pas une preuve de collecte réelle.
- Les profils protégés, ou dont le statut public manque, ne déclenchent pas de lecture de timeline. Une erreur arrête la collecte et doit être examinée avant nouvelle autorisation. Après une tentative, le prochain cycle ne part pas avant une heure, même après modification de configuration.
- L’API, les règles de débit, les délais imposés par X, les circuits et les plafonds sont vérifiés avant admission. Les réservations restent conservées même si le coût estimé final est inférieur ou si la réponse échoue. Elles peuvent arrêter la collecte plus tôt et **ne sont pas une facture X**.
- Avertissement à 80 % des réservations ou du maximum de requêtes. Un dépassement journalier/mensuel refuse l’appel ; changer de clé, de profils ou de configuration n’efface pas les compteurs. Les périodes sont UTC, distinctes du fuseau d’affichage Windows ; garder l’horloge du PC correcte.
- **Arrêter la collecte** et **Supprimer la clé et arrêter** bloquent les nouveaux appels ; un appel précédemment autorisé peut encore se terminer et être facturé. Aucun abonnement n’est annulé par ces boutons.
- À chaque lancement, après crash ou redémarrage : collecte **arrêtée**, même si elle fonctionnait avant fermeture. Les historiques, clés et compteurs sont conservés. Pas de service Windows caché ni de démarrage de collecte automatique.

Le PC doit rester allumé, connecté et **MemeRadar ouvert**. Veille/hibernation/arrêt interrompent la surveillance. Il n’existe aucun rattrapage exhaustif au retour ni notification système lorsque le logiciel est fermé. La prochaine tentative possible et la dernière tentative sont affichées ; ce dernier horaire ne prouve pas une collecte réussie.

## Stockage, clés et sauvegarde

`%APPDATA%\MemeRadar\local-data-v1.sqlite` contient configuration, observations et compteurs. Les fichiers SQLite `-wal` et `-shm` peuvent exister. Le fichier est plafonné à environ 64 Mio avec les pages par défaut ; un stockage plein ou illisible bloque les opérations et ne déclenche aucune réinitialisation automatique.

Le jeton est chiffré par **Electron safeStorage / protection Windows liée au compte utilisateur**. Aucun repli en clair si cette protection est indisponible ; la collecte et l’enregistrement sont alors refusés. Il n’existe pas de fonction de lecture ou d’export du jeton vers le renderer, ni de secret dans localStorage, les préférences démo, l’installateur ou les journaux. La saisie transite nécessairement en mémoire par le champ de configuration avant chiffrement.

La base entière n’est pas chiffrée : publications, profils, configuration et anciens réglages démo sont privés au profil Windows et lisibles par un accès autorisé à celui-ci. Protéger son compte et les sauvegardes. Conserver son jeton d’origine dans son propre gestionnaire sécurisé si une nouvelle saisie devient nécessaire. Après déplacement vers un autre PC/compte, le jeton chiffré peut être indéchiffrable : ressaisir la clé, sans supprimer les compteurs.

Les publications et profils vieux de sept jours sont purgés au lancement et pendant les lectures/collectes locales ; lorsque le PC ou l’application est fermé, aucune purge ne peut s’exécuter. La vue affiche au plus 300 publications récentes et 100 profils observés. La mise en conformité avec une suppression fournisseur avant cette échéance n’est pas automatisée ; les droits de conservation doivent être vérifiés avant usage. Les métadonnées financières et les journaux de requêtes ne sont pas purgés automatiquement pour éviter d’effacer les protections de budget.

Pour sauvegarder : arrêter la collecte, fermer complètement MemeRadar, puis copier **tout** `%APPDATA%\MemeRadar` vers un emplacement privé protégé. Ne pas copier seulement la base pendant son utilisation. Cette sauvegarde est manuelle ; ni copie cloud ni synchronisation automatique. Ne jamais envoyer ce dossier dans la conversation. Une restauration ancienne peut omettre des dépenses plus récentes : ne pas réactiver avant rapprochement avec le compte X. La désinstallation conserve les données. Leur suppression n’annule aucune facture et efface les protections locales ; ce n’est pas une méthode de réinitialisation de budget.

## Ce qui reste à raccorder

Le moteur local livré couvre **configuration X, profils publics et veille des publications**. Conversations, événements, prix/pools/graphiques, risques, règles d’alertes et notifications automatiques restent non raccordés au moteur local. Ils sont indiqués indisponibles en mode local et restent essayables dans la démonstration distincte. Aucun portefeuille, transaction ni conseil d’investissement.

## Vérification

Tests unitaires/contrats sur Node avec SQLite réel et transport X synthétique ; aucun appel fournisseur effectué. Le parcours Electron vérifie l’écran local vide, l’enregistrement sans appel, les compteurs, l’isolation du renderer, la conservation après redémarrage et, lorsque le coffre du système est disponible, le chiffrement réel via safeStorage sans retour de clé. Le banc Windows teste aussi l’application installée et sa désinstallation. Validation réussie sur la [CI de la version publiée](https://github.com/wnathan469-debug/meme/actions/runs/39271272337), source `cc98528babdba1856f7f45edf55df71337fc3a98` : 337 tests unitaires/contrats dont 21 nouveaux pour le moteur local, 124 tests PostgreSQL/API et sept tests Redis supplémentaires (468 tests TypeScript distincts), vingt tests navigateur et parcours Windows natif installation/lancement/redémarrage/désinstallation. Le contrôle Windows impose un coffre disponible, vérifie le déchiffrement réel dans le processus principal et l’absence de clé dans les réponses IPC. Couverture unité/contrat : lignes 95,74 %, branches 91,36 %, seuils 80 % conservés. Les contrôles SQL et de déploiement historiques passent aussi, mais ne sont pas requis sur le PC.

Les deux fichiers publics 0.3.1 ont été téléchargés entièrement avec HTTP 200 et leurs SHA-256 correspondent au manifeste publié ; CRC du ZIP valides et empreinte de l’EXE à l’intérieur identique. Voir [le rapport de téléchargement](DOWNLOAD_VERIFICATION.md). Aucune collecte réelle sur un compte X n’est annoncée ici. Les tests automatisés du runner Windows ne remplacent pas une vérification sur le PC Windows 10/11 de destination.

| Fonction | Statut |
|---|---|
| Moteur SQLite, interface locale et protection Windows | Réel et vérifié |
| Client X local, profils et publications | Réel non vérifié |
| Données de la démonstration distincte | Simulé (démo) |
| Marché, risques, conversations, événements et alertes en mode local | Non commencé |

« Réel non vérifié » pour X signifie que le chemin d’appel officiel est raccordé au moteur local, mais sans preuve d’accès et de données obtenues sur un compte fournisseur réel. Les réponses de test sont synthétiques.
