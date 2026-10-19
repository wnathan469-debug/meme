# Données réelles — étape 4 : préparation de l’hébergement

La validation utilisateur porte sur le serveur local de l’étape 3 et autorise la préparation de l’hébergement. **Elle ne valide pas le budget de 60 USD/mois, un hébergeur, un abonnement, un domaine ou des appels payants.** Aucun compte de production, certificat public ou accès hébergeur utilisable n’est fourni dans cet environnement. Les secrets ne doivent jamais être envoyés dans la conversation.

**Ce lot prépare et teste le déploiement ; il ne clôt pas l’étape 4.** Le critère demandé inclut une adresse HTTPS depuis Internet, une restauration chez l’hébergeur et une alerte de panne. La répétition locale avec certificats temporaires ne remplace pas ces preuves. Windows 0.2.0 reste une démo et aucun nouvel installateur connecté n’est publié.

## Ce qui est fourni

- `deploy/Dockerfile` : serveur Linux amd64 Node 24.19.0, image de base fixée par empreinte ; build SSR indépendant, dépendances de production, utilisateur sans privilèges. Ni fixtures, ni interface Windows, ni secrets dans l’image finale.
- `deploy/compose.yaml` : PostgreSQL 16 et Redis 7.2 privés, volumes persistants, journalisation bornée, ressources limitées. Seul le port HTTPS de l’API est publié. API en lecture seule au niveau du système de fichiers, capacités supprimées, interdiction de gagner des privilèges.
- Outils compilés de migration et de création d’administrateur. Le provisionnement SQL est explicite et refuse d’écraser un rôle existant. L’API utilise un rôle distinct, sans superuser/BYPASSRLS, sans écriture des politiques financières ni création d’utilisateurs.
- `deploy/backup.sh` : sauvegarde PostgreSQL personnalisée toutes les six heures, chiffrée en flux par CMS AES-256-GCM, publication atomique. Aucun dump en clair conservé par le job. Un échec produit une alerte et ne publie pas un fichier partiel.
- `deploy/restore-safety.sql` : après restauration isolée, arrêt des collectes, désactivation des fournisseurs, suppression de leur validation et révocation des sessions. Les réservations et journaux financiers restent conservés.
- `deploy/monitor.mjs` : surveillance HTTPS et accès SQL, deux échecs successifs avant alerte, fichier d’état atomique et journal des transitions. Ni SMS ni email envoyé ; aucun destinataire externe configuré.
- `scripts/test-deployment.mjs` : répétition isolée du déploiement, sauvegarde/restauration, panne et retour au service. Les enregistrements d’origine REAL sont des données synthétiques de test.

Redis est prêt pour les workers ultérieurs, mais **l’API ne l’utilise pas actuellement**. Il n’est pas une preuve de collecte opérationnelle. Ce réseau Redis sans mot de passe n’est acceptable que dans ce réseau Docker privé, sans port publié ni application tierce ; sur une offre gérée, utiliser les identifiants et TLS du prestataire. PostgreSQL n’est accessible que sur le réseau privé du même hôte ; une base sur un autre hôte exige TLS vérifié et des règles réseau adaptées.

## Choix d’hébergement encore ouvert

La proposition Railway de l’étape 2 reste conditionnelle. Le présent conteneur attend **TLS dans Node**, avec certificat et clé montés en fichiers. Il est directement destiné à un hôte Linux Docker administré. **Le brancher tel quel derrière le port HTTP d’une plateforme Railway/Render ne fonctionne pas.** Une terminaison TLS gérée demande une adaptation testée ou un service TCP compatible, à confirmer avant de choisir l’offre. Ne jamais activer HTTP local en production pour contourner cela.

Un VPS exige une personne responsable des mises à jour, certificats, pare-feu, sauvegardes et incidents. Ce n’est pas une opération à demander à un utilisateur Windows sans accompagnement. Aucun changement de prestataire ou achat de VPS n’est déduit de ce lot. Les estimations de l’étape 2 restent des estimations, pas des tarifs actuels vérifiés.

Avant achat, obtenir une offre écrite couvrant : disponibilité permanente, région, mémoire (au moins 2 Gio à confirmer par mesure), stockage, sauvegarde extérieure, restauration, trafic, taxes, alertes et véritables plafonds de facturation. Les limites mémoire Docker ne plafonnent pas une facture. Aucun service ou collecteur ne doit être démarré sur une offre payante sans validation spécifique.

## Mise en service par l’opérateur cloud

Ces commandes concernent le serveur choisi, **pas votre PC Windows**. Elles ne sont à exécuter qu’après choix et devis validés. Pour une plateforme gérée, utiliser son gestionnaire de secrets ; pour un hôte Docker, l’opérateur fournit un répertoire de secrets protégé hors du dépôt. Ne jamais mettre des valeurs dans Git, une capture partagée ou des arguments de commande.

1. Créer le projet chez le fournisseur choisi, vérifier les coûts et limites avec l’utilisateur. Relier le dépôt autorisé. Ne créer aucun worker X. Tous les fournisseurs restent désactivés et sans clé.
2. Préparer le domaine choisi et un certificat public valide pour ce domaine. Pare-feu : HTTPS 443 public ; administration seulement depuis le canal d’administration autorisé. Aucun port 5432, 6379 ou 8787 public supplémentaire. Docker peut contourner certaines règles UFW : vérifier aussi les règles de l’hébergeur et les ports réellement publiés.
3. Créer les fichiers ci-dessous dans un répertoire protégé, propriété de l’opérateur. Le parent doit être en mode 0700. Les fichiers montés doivent être lisibles par l’UID du conteneur concerné : Compose local utilise des montages de fichiers et ne remappe pas automatiquement uid/mode des secrets. Le banc utilise 0444 dans ce parent 0700 ; un gestionnaire de secrets ou des ACL ciblées est préférable sur un hôte partagé. Ne pas rendre le répertoire accessible aux autres utilisateurs.

| Fichier secret | Utilisation |
|---|---|
| `postgres_password` | Mot de passe PostgreSQL généré et unique |
| `admin_database_url` | URL privée de migration/provisionnement, rôle `postgres`, base `memeradar` sur `db:5432` |
| `api_database_url` | Même base et hôte, rôle `memeradar_api`, autre mot de passe généré ; encoder les caractères réservés dans l’URL |
| `admin_password` | Mot de passe initial de l’application, au moins 14 caractères |
| `tls_cert.pem`, `tls_key.pem` | Chaîne de certificat public et clé du domaine |
| `backup_cert.pem` | Certificat public RSA de chiffrement des sauvegardes ; **aucune clé privée de sauvegarde sur ce serveur** |

Le compte PostgreSQL d’administration est réservé aux migrations, au provisionnement et au job de sauvegarde. Ce dernier a donc un accès privilégié et doit être protégé. Il n’est jamais monté dans l’API. La clé privée de restauration doit être conservée dans un coffre séparé et sauvegardée hors du serveur ; une sauvegarde chiffrée sans sa clé est irrécupérable.

4. Définir seulement la configuration non secrète : `MEMERADAR_SECRETS_DIR` (chemin absolu), `MEMERADAR_PUBLIC_ORIGIN` (par exemple `https://api.votre-domaine`), `MEMERADAR_ADMIN_EMAIL` (adresse du compte applicatif), puis une référence d’image versionnée dans `MEMERADAR_SERVER_IMAGE`. L’exemple de domaine n’est pas une adresse livrée. Ces variables peuvent être saisies dans le panneau du prestataire ou dans un fichier privé de configuration Compose, jamais une clé dans le chat.
5. Depuis le dépôt sur l’hôte autorisé, construire puis provisionner. Le build nécessite accès npm et Docker Hub, avec vérification TLS et intégrité du lockfile conservées.

```bash
docker build -f deploy/Dockerfile -t memeradar-server:VERSION .
# MEMERADAR_SERVER_IMAGE doit désigner cette image.
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml up -d --wait db redis
docker compose -f deploy/compose.yaml run --rm tools migrate
docker compose -f deploy/compose.yaml run --rm tools bootstrap
docker compose -f deploy/compose.yaml run --rm tools admin
docker compose -f deploy/compose.yaml up -d api
```

Ne pas exécuter `compose config` sans `--quiet` dans un journal partagé ; ne pas afficher les fichiers secrets. Le provisionnement du rôle et de l’administrateur est initial seulement, pas une commande de réinitialisation de mot de passe. Les migrations sont répétables. Ne jamais utiliser les identifiants de migration pour lancer l’API.

6. Retirer le mot de passe de provisionnement applicatif de l’environnement actif et du stockage temporaire. Conserver les seuls secrets opérationnels dans le coffre. La configuration Compose `tools` attend ce fichier lors d’une commande d’administration : le fournir temporairement depuis le coffre à cette occasion. Ne pas démarrer le profil `operator` en bloc : invoquer uniquement la tâche souhaitée.
7. Depuis un autre réseau, vérifier `GET /health` avec le certificat public reconnu par Chrome, puis connexion et lectures privées. Une réponse santé indique uniquement API/SQL disponibles, pas fournisseurs vérifiés. Vérifier aussi qu’un port base/Redis n’est pas accessible. Relever la date, le domaine, le résultat et la version déployée sans identifiant ni jeton.

En environnement de build avec proxy d’entreprise, les arguments Docker prédéfinis `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` peuvent être transmis depuis l’environnement. Le Dockerfile accepte un certificat public supplémentaire via le secret BuildKit `build_ca` : jamais une clé privée, jamais `strict-ssl=false`. Ce montage n’est pas copié dans l’image. Les ajustements réseau du banc cloud ne sont pas une instruction d’ouvrir les bases de production.

## Sauvegardes et restauration

Après provisionnement, activer **uniquement** le job de sauvegarde :

```bash
docker compose -f deploy/compose.yaml up -d backup
docker compose -f deploy/compose.yaml logs --tail=20 backup
```

Le volume `backups` contient des fichiers `.cms` chiffrés, locaux au même hôte. **Cela ne protège pas contre la perte de l’hôte.** Avant mise en service : programmer une copie vers un stockage extérieur choisi et autorisé, vérifier sa réussite, surveiller l’âge du dernier fichier complet, l’espace disque et la validité du certificat de chiffrement. Politique cible à valider : sauvegarde toutes les six heures, 7 jours de copies quotidiennes et 4 hebdomadaires hors site. Aucune purge automatique n’est livrée ; ne la programmer qu’après vérification de la copie et d’une restauration. RPO cible 6 h et RTO cible 4 h sont des objectifs non mesurés en production.

Pour restaurer, utiliser une **nouvelle base isolée** et garder API/collecteurs arrêtés. Déchiffrer depuis un environnement de récupération protégé avec la clé privée du coffre ; les fichiers en clair du test doivent être supprimés ensuite. Exemple opérateur, chemins locaux sans secret en argument :

```bash
openssl cms -decrypt -binary -inform DER -in sauvegarde.cms \
  -recip backup_cert.pem -inkey backup_key.pem -out restauration.dump
# Base de récupération isolée ; authentification via coffre/PGPASSFILE :
pg_restore --exit-on-error --no-owner --no-acl -d base_recuperation restauration.dump
psql -X -v ON_ERROR_STOP=1 -d base_recuperation -f deploy/restore-safety.sql
```

Ne pas poursuivre après un échec de déchiffrement ou de restauration, même si un fichier partiel existe. Comparer versions, comptes, enregistrements et réservations. Recréer/contrôler les rôles et droits : le dump ne restaure pas les mots de passe des rôles globaux. Réconcilier les factures/appels intervenus depuis la sauvegarde avant de vérifier à nouveau les politiques et d’autoriser une quelconque collecte. Une ancienne sauvegarde ne prouve pas qu’aucune dépense n’a eu lieu après sa création. L’historique de consentement est conservé mais ne dispense pas d’une nouvelle validation opérationnelle.

## Surveillance et incidents

Le healthcheck Docker interroge HTTPS et l’accès SQL toutes les 30 secondes. Un conteneur `unhealthy` n’est pas automatiquement redémarré par Docker ; `restart` concerne la sortie du processus. Le moniteur doit être installé **sur un autre hôte ou service indépendant** pour détecter la perte totale du serveur. Configuration de ce processus : origine HTTPS canonique, `MEMERADAR_API_ORIGIN=REAL`, `MEMERADAR_MONITOR_STATE_FILE` dans un répertoire privé existant ; intervalle par défaut 60 secondes. Lancer `node deploy/monitor.mjs` sous le superviseur du prestataire. Le mode `MEMERADAR_MONITOR_CA_FILE` sert seulement à une autorité explicitement choisie ; ne pas l’utiliser pour accepter un certificat public invalide.

Le fichier d’état est actualisé à chaque vérification ; deux échecs produisent `alert`, un succès ultérieur `healthy`. Surveiller aussi la fraîcheur de ce fichier et la vie du moniteur. Ce moniteur ne contrôle pas les quotas fournisseurs, la fraîcheur des publications, Redis, l’âge des sauvegardes ou le stockage. Ces vérifications et le canal d’alerte vers l’opérateur restent à configurer chez l’hébergeur. Aucune livraison email/SMS ni surveillance Internet indépendante n’est revendiquée par le test local.

Test de panne après déploiement : prévenir l’opérateur, arrêter seulement l’API, constater l’alerte extérieure et son heure, redémarrer, constater le retour au service. Ne pas arrêter ni effacer un volume. Journaux : `docker compose -f deploy/compose.yaml logs --tail=100 api`. Ne pas activer de journalisation des corps, en-têtes Authorization ou détails de connexion.

## Mise à jour, retour en arrière et rotation

1. Arrêter les nouvelles collectes par la commande authentifiée existante, attendre les travaux déjà autorisés ; conserver leurs réservations. Sauvegarder, vérifier la copie extérieure et disposer d’une restauration testée.
2. Construire/tester une image avec référence immuable liée au commit. Conserver l’ancienne image et le manifeste. Ne jamais utiliser un tag mouvant comme unique point de retour.
3. Lire les migrations, vérifier leur compatibilité avec l’ancienne image, appliquer avec le rôle opérateur ; recréer uniquement l’API sur la nouvelle image. Tester santé et lectures privées depuis l’extérieur. Aucune activation de fournisseur par une mise à jour.
4. En cas d’échec compatible : redéfinir l’ancienne image, recréer uniquement l’API, tester. **Ne pas exécuter automatiquement une migration down**. Si le schéma est incompatible : maintenance et restauration dans une base isolée, rapprochement financier, puis bascule validée. Ne jamais employer `docker compose down -v` en production : cela détruit les volumes. Le banc de test l’emploie uniquement sur ses volumes éphémères.
5. Renouveler le certificat public avant expiration ; monter les nouveaux fichiers, recréer l’API et vérifier la chaîne depuis l’extérieur. Les secrets montés par fichier peuvent conserver l’ancien inode après remplacement ; un simple rechargement du fichier n’est pas garanti. Rotation SQL : mettre à jour le mot de passe du rôle via console sécurisée, mettre à jour le fichier du coffre, recréer l’API, vérifier, révoquer l’ancien accès. Rotation des sessions par révocation SQL opérateur, jamais par suppression de compte ou des journaux financiers.

## Validation et limites

Validation locale réussie le 19 octobre 2026 : image Docker construite avec base fixée par empreinte et vérification TLS ; **124 tests PostgreSQL/API** (couverture lignes 93,28 %, branches 85,24 %, seuils 80 % conservés), typecheck et formatage. **Onze contrôles de déploiement** vérifient les réseaux privés, les migrations compilées répétables, le provisionnement sans écrasement, le rôle SQL restreint, toutes les lectures privées, le certificat non approuvé refusé, le chiffrement et le refus d’une altération, la restauration effective, la révocation des sessions, la conservation des réservations, la panne simulée et le rétablissement. Le banc de déploiement est ajouté à la CI Linux.

Les certificats sont temporaires et approuvés par le seul client local de test ; aucun magasin de confiance global modifié. Les bases, volumes et clés du banc sont supprimés après la recette. Le script ne lance aucun appel fournisseur, ne crée aucun compte externe et ne publie pas de serveur Internet. La recette Internet, le certificat public, la copie extérieure, le test de restauration chez l’hébergeur et le canal d’alerte humain restent **non effectués**. Pas de nouvel installateur connecté, collecte réelle ou appel fournisseur.

| Élément | Statut |
|---|---|
| Application Windows et données affichées | Simulé (démo) |
| API, authentification et protections de collecte | Code écrit, non raccordé |
| Configuration de déploiement, sauvegarde et surveillance | Code écrit, non raccordé |
| Hébergement public, sauvegarde extérieure et surveillance indépendante | Non commencé |
| Collecte réelle et installateur Windows connecté | Non commencé |

**Étape 4 en cours : attendre le choix d’hébergement, le devis validé et l’accès sécurisé avant toute création payante.** Ne pas passer à la collecte réelle en présentant la recette locale comme un déploiement.
