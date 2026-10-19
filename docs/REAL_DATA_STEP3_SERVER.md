# Données réelles — étape 3 : serveur sécurisé local

La reprise demandée par l’utilisateur permet de développer et tester le serveur sans achat ni collecte payante. **Les choix financiers de l’étape 2, les prix/droits fournisseurs et les trois comptes restent à valider.** real-pilot.proposal.json demeure une proposition non chargée et non approuvée.

L’API fonctionne localement sur PostgreSQL dans le banc de test. **Aucun serveur Internet n’est déployé, aucune interface Windows n’est raccordée, aucune publication réelle n’est validée, aucun nouvel installateur n’est publié.** Windows 0.2.0 demeure en démo. Les données d’origine REAL en test sont synthétiques : le marqueur d’origine n’est pas une preuve de collecte.

## 1. Code livré

- apps/api/auth.ts : administrateur, Argon2id natif, jetons opaques, expiration, renouvellement et révocation.
- apps/api/http-server.ts : API locale explicite ou HTTPS obligatoire, validation, sessions, limites de requêtes et journaux sans corps ni secrets.
- packages/db/server-controls.ts : arrêt durable, politiques par fournisseur/espace de facturation, plafonds jour/mois, réservations et limite de requêtes.
- Migration 0013_secure_api up/down, manifeste d’empreintes, ORM et snapshot régénérés depuis PostgreSQL : **73 tables applicatives, treize migrations**. Les migrations historiques sont conservées.
- Contrôles raccordés aux réservations réelles X et aux admissions GeckoTerminal/GoPlus ; configuration marché absente refusée en REAL.
- scripts/api-serve.ts et api-admin.ts, construction Vite SSR indépendante et commandes Node compilées.
- Vingt nouveaux tests d’intégration ; attentes de migration et fixtures financières existantes adaptées.

La structure d’affichage et le shell Windows sont conservés. Le serveur réutilise les dépôts privés pour personnes, publications et sources, sans collecte au démarrage ou à la lecture.

## 2. Authentification

**Jetons opaques renouvelables** : PostgreSQL garde leur empreinte SHA-256. Une révocation ou désactivation du compte est vérifiée à chaque requête, sans attendre l’expiration d’un jeton signé autonome.

Argon2id natif de Node : 64 Mio, trois passes, quatre voies, sel aléatoire 16 octets, résultat 32 octets. Les paramètres acceptés sont bornés ; aucun coût arbitraire provenant d’un hash n’est exécuté. **Node 24.7 ou ultérieur, branche 24**, est requis. Son API Argon2 reste expérimentale et mérite une revue avant déploiement. Aucun algorithme cryptographique réimplémenté ni nouvelle dépendance npm.

- Provisionnement hors HTTP via variables sécurisées ; mot de passe de 14 à 256 caractères. Aucune inscription publique.
- Jeton aléatoire de 256 bits, valide trente minutes ; renouvellement par rotation atomique, ancien jeton immédiatement invalide.
- Durée absolue de douze heures, renouvellements compris.
- Déconnexion persistante ; compte désactivé interdit même avec un jeton déjà délivré.
- Refus générique pour compte inconnu, mauvais mot de passe ou compte désactivé ; calcul factice coûteux pour limiter l’énumération.
- Deux vérifications de mot de passe simultanées au maximum par processus.
- Aucun cookie ; bearer dans Authorization, jamais dans l’URL. Le csrf_hash historique est initialisé aléatoirement et n’est pas revendiqué comme protection de cookie.
- Tous les comptes du schéma actuel sont administrateurs ; les données restent filtrées par propriétaire.
- Origine fixée par MEMERADAR_API_ORIGIN, jamais par le client. Un jeton DEMO ne fonctionne pas sur l’API REAL, et inversement.

Le stockage sécurisé de session Windows appartiendra à l’étape 6. Aucun mot de passe ou jeton de renouvellement dans localStorage, aucune clé fournisseur dans le renderer.

## 3. Routes opérationnelles

| Méthode et route | Effet |
|---|---|
| GET /health | Santé minimale du serveur, pas une preuve de connexion fournisseur |
| POST /v1/auth/login | Connexion, jeton court |
| POST /v1/auth/renew | Corps JSON vide, rotation du jeton valide |
| POST /v1/auth/logout | Corps JSON vide, révocation |
| GET /v1/me | Identité, origine et expiration |
| GET /v1/people | Personnes et notes du propriétaire |
| GET /v1/posts | Recherche locale limitée et paginée, aucun appel X |
| GET /v1/sources | Configuration et diagnostics stockés, « non configuré » si absent |
| GET /v1/collection | Arrêt, réservations, compteurs et avertissements |
| POST /v1/collection/stop | Corps JSON vide, arrêt persistant |

Hors santé et connexion, un jeton est obligatoire. Les lectures ne lancent aucune sonde. Une liste REAL vide reste vide. Une configuration stockée n’est pas annoncée comme une connexion fournisseur vérifiée.

Aucune route de reprise, achat, activation fournisseur ou proxy URL arbitraire. Ajout de personnes et chargement de conversations restent aux étapes 5–7, après choix des accès et tarifs. Il n’existe aucun remplissage automatique à partir de fixtures.

## 4. Réseau et journalisation

HTTPS obligatoire en production, origine canonique et contrôle Host/Origin. HTTP limité à la boucle locale, avec option explicite et hors production. Aucun contournement de certificat.

Refus des origines inattendues, JSON malformés, champs supplémentaires, corps de plus de 8 Kio et URL trop longues. Délais, en-têtes et connexions bornés. Forwarded/X-Forwarded-For ne sont pas crus ; derrière un proxy, la limite peut donc s’appliquer au proxy partagé.

Réponses no-store et nosniff, HSTS en HTTPS ; aucun CORS permissif. Journaux : identifiant aléatoire, route logique connue, statut, origine et code d’erreur seulement. Aucun corps, URL brute, query string, email, note, mot de passe, jeton ou détail SQL.

Limites SQL partagées : 600 requêtes/minute globales, 120/minute par IP, cinq connexions/minute par IP et cinq par quinze minutes par identifiant. Ce sont des limites locales, pas des quotas fournisseur.

L’hébergement géré proposé termine généralement TLS en amont. La confiance dans son proxy et son réseau privé sera préparée et testée à l’étape 4 : le serveur livré exige actuellement TLS au niveau Node en production. Ne pas utiliser l’option HTTP local pour contourner cette exigence.

## 5. Arrêt et budgets bloqués par défaut

Quatre tables :
- server_collection_controls : état global par origine, arrêté par défaut.
- server_provider_policies : activation, vérification, accord payant, borne de coût, plafonds et nombre de requêtes par fournisseur/espace.
- server_provider_usage : réservations exactes jour/mois et nombre de requêtes.
- server_request_limits : compteurs d’accès avec clés hachées.

En REAL, toute admission échoue si l’arrêt ou la politique manque, si l’arrêt est actif, si les conditions ne sont pas vérifiées, si le coût dépasse la borne vérifiée, si l’accord payant manque ou si un plafond est atteint. Une lecture sans frais nécessite elle aussi une politique vérifiée et activée ; elle compte dans la limite de requêtes.

Montants en entiers exacts de micro-USD. Périodes UTC et compteur quotidien vérifiés dans une transaction, avec verrou partagé d’arrêt et verrou de politique ; un refus annule toute l’admission. Avertissement à 80 % du budget ou du nombre quotidien de requêtes.

L’arrêt prend le verrou exclusif correspondant. Après confirmation, aucune nouvelle admission n’est permise. Une requête déjà autorisée peut encore partir ou rester en cours et être facturée. Ni rappel de requête ni annulation d’un abonnement ou de l’hébergement ne sont promis.

Le compteur conserve la borne réservée même après échec ou règlement inférieur dans le journal X. Protection conservatrice pouvant arrêter plus tôt : **ce n’est pas une facture ou une consommation observée auprès du fournisseur**. Le journal X détaillé reste distinct. Tous les workers d’un même compte doivent partager le même espace de facturation pour ne pas multiplier les plafonds.

Aucune politique payante créée automatiquement. Les 60 USD/mois et 150 requêtes/jour proposés ne sont pas activés. Validation des droits, tarifs, budgets et accord payant avant le pilote.

## 6. Construction et démarrage côté serveur

Ces opérations concernent le cloud ou l’opérateur serveur. Aucun outil à installer sur votre PC Windows pour cette étape.

~~~bash
npm ci
npm run api:build
# DATABASE_URL du rôle de migration injectée dans l’environnement sécurisé :
npm run db:migrate
# Variables sécurisées de provisionnement :
npm run api:admin:built
# Après retrait du mot de passe de provisionnement ; rôle SQL d’exécution :
npm run api:start
~~~

Le build produit server-dist/server.js, admin.js et leurs modules communs. Le processus compilé utilise Node et les dépendances de production, sans tsx/Vite. Compilation et migrations utilisent leur environnement d’outillage avant un éventuel retrait des dépendances de développement. api:serve et api:admin restent disponibles pour le développement TypeScript.

Variables à saisir dans l’espace sécurisé du serveur, jamais dans le chat :
- DATABASE_URL : PostgreSQL privé migré à 0013. L’API refuse superuser/BYPASSRLS.
- MEMERADAR_API_ORIGIN : REAL ou DEMO, explicitement.
- MEMERADAR_API_PUBLIC_ORIGIN : origine HTTPS canonique sans chemin.
- MEMERADAR_API_TLS_CERT_FILE et TLS_KEY_FILE : fichiers serveur, jamais dans Git ou l’installateur.
- MEMERADAR_ADMIN_EMAIL et ADMIN_PASSWORD : création initiale uniquement, retirer ensuite.
- Port 8787 par défaut ; HTTP local seulement avec MEMERADAR_API_ALLOW_LOCAL_HTTP=true et NODE_ENV différent de production.

Séparer le rôle de migration/provisionnement du rôle d’exécution. Donner au rôle API les lectures utiles et seulement les écritures de sessions, limites et arrêt ; ne pas lui accorder la modification des politiques payantes. Le banc utilise un rôle sans superuser/BYPASSRLS, avec des permissions plus larges pour créer ses fixtures.

Le fichier .env.example n’est pas chargé automatiquement. Un échec affiche un message générique sans secret. SIGINT/SIGTERM ferment serveur et pool. Le serveur ne crée aucun worker et ne redémarre pas la collecte.

À préparer à l’étape 4 : déploiement, certificat public, proxy éventuel, sauvegarde/restauration, supervision, rotation des secrets et purge planifiée des compteurs d’accès anciens. Ne jamais supprimer une réservation pour contourner un plafond. Synchroniser les horloges et vérifier les fenêtres UTC du contrat de facturation.

## 7. Migrations et tests

Origine obligatoire, index, timestamps, déclencheur updated_at et RLS forcée sur les quatre tables. Les consommations référencent une politique de même origine. Le retour arrière verrouille et refuse toute perte ; row_security=off empêche une RLS de masquer des données à la garde.

Les attentes passent de douze à treize migrations et de 69 à 73 tables. Les anciennes fixtures d’origine REAL utilisant FakeTransport fournissent désormais une autorisation **factice de test**, dans tests/fixtures/server-policy.ts, jamais importée en production. Le test de débit marché utilise désormais un fournisseur connu et une politique gratuite synthétique ; un identifiant inconnu est refusé avant l’accès SQL. Aucun garde réel désactivé pour faire passer les tests.

Le banc SQL V1 attend maintenant le TCP du conteneur : son serveur temporaire de bootstrap acceptait le socket avant de s’arrêter, d’où une fausse disponibilité. Assertions et délais ne sont pas affaiblis.

Validation locale réussie :
- Build serveur SSR et build/typecheck de l’application ; formatage et contrôle des différences.
- 316 tests unitaires/contrats et sept tests Redis supplémentaires ; 124 tests PostgreSQL dont vingt nouveaux : **447 tests TypeScript distincts**.
- Couverture cible PostgreSQL/API : lignes 93,28 %, branches 85,24 % ; seuils globaux de 80 % conservés. La cible unité demeure distincte (lignes 96,10 %, branches 91,86 %).
- Référence SQL V1 : 51 contrôles avant/après rollback, répétabilité et concurrence.
- HTTPS local avec certificat temporaire explicitement approuvé par le seul client de test ; certificat non approuvé refusé. Aucun magasin de confiance global modifié.
- Processus **server-dist/server.js** réellement lancé avec rôle SQL non privilégié ; état serveur interrogé, arrêt propre et refus d’un rôle superuser vérifiés.
- Budget concurrent exact, arrêt partagé persistant, limites gratuites, configurations absentes, dates infinies/invalides et accord payant manquant testés.
- Sessions expirées, rotation concurrente, révocation, origines et propriétaires isolés ; listes REAL vides sans fixtures de remplacement.
- Audit npm de production : zéro vulnérabilité signalée. Les alertes de construction historiques ne sont pas annoncées comme corrigées.

Les premiers essais ont révélé un typage SQL numérique à expliciter et un nettoyage de connexions à terminer avant suppression de la base ; ils sont corrigés, les 124 tests passent sans erreur asynchrone. La fermeture du corps JSON trop volumineux a été contrôlée sans détruire prématurément la réponse. Aucun test désactivé, aucune assertion ou couverture abaissée.

La CI sera référencée après son exécution. Aucun test ne prouve une collecte X ou marché réelle. Aucune donnée fournisseur collectée, aucun achat ni hébergement engagé.

## 8. Statut et prochaine décision

| Fonction | Statut | Précision |
|---|---|---|
| Tableau de bord, veille, personnes et conversations Windows | Simulé (démo) | Aucun raccordement API client |
| Événements, tokens, graphiques, risques et alertes Windows | Simulé (démo) | Fixtures conservées |
| Sources et budgets affichés dans Windows | Simulé (démo) | Aucun contrôle réel dans cette interface |
| API, sessions et lectures PostgreSQL | Code écrit, non raccordé | Tests locaux synthétiques, client non raccordé |
| Arrêt global et budgets X/marché/risques | Code écrit, non raccordé | Mécanisme testé, aucun fournisseur activé |
| Collecteurs et moteur d’alertes privés | Code écrit, non raccordé | Sans validation fournisseur |
| Installation et préférences 0.2.0 | Réel et vérifié | Ancienne démo, aucun nouvel EXE |
| Hébergement, sauvegardes et surveillance | Non commencé | Aucune ressource Internet créée |
| Données réelles, pilote 24 h et notifications externes | Non commencé | Aucun appel fournisseur |
| Installateur connecté et mise à niveau | Non commencé | Étape 12 à venir |

Prochaine décision : validation du serveur local puis budget/choix d’hébergement avant l’étape 4. La reprise technique ne vaut pas accord financier ; les trois comptes et l’accord d’essai payant restent nécessaires au pilote.
