# Sécurité — édition démo

Le shell Electron fonctionne avec contextIsolation et sandbox activés, nodeIntegration désactivé, CSP locale, refus des sorties HTTP(S), fenêtres et téléchargements. Le renderer ne reçoit que les méthodes de préférences validées, une copie au presse-papiers limitée aux adresses fictives et la version ; les IPC vérifient émetteur, frame principale et origine interne.

Les préférences sont validées par Zod aux deux frontières, limitées en taille et remplacées par écriture temporaire/renommage. Le stockage ne contient pas de secret. Les contenus fictifs sont rendus comme texte React, jamais injectés avec innerHTML. Aucun client blockchain, portefeuille, signature ou transaction n'est livré.

Le modèle de menace couvre des données locales invalides et une tentative de navigation externe ; il ne protège pas contre un administrateur du PC, une session Windows compromise ou un installateur modifié. Le blocage réseau applicatif ne remplace pas la politique réseau de la machine. Les sessions du navigateur/Chromium peuvent avoir des comportements système propres ; aucun mécanisme de télémétrie n'est ajouté par MemeRadar.

Le futur mode live exigera l'ensemble des protections de l'architecture serveur (authentification, CSRF, SSRF avec DNS/redirects contrôlés, secrets, quotas et audit). Elles ne sont pas déclarées implémentées par cette édition hors ligne.

Les dépendances sont verrouillées par package-lock.json. Voir VALIDATION.md pour le résultat de l'audit. Le paquet n'est pas signé : signature et essais Windows natifs nécessaires avant diffusion publique.


## Socle X V2

Le nouveau transport privé refuse tout réseau DEMO avant DNS, contrôle les IP publiques et épingle la résolution, vérifie TLS et refuse les redirections interorigines. Les jetons et chaînes Redis restent côté serveur, masqués en JSON et inspection. Aucun texte de publication, en-tête ou URL complète dans le journal technique. Budgets exacts et quotas partagés bloquent les appels si les contrôles sont indisponibles. Aucun accès réseau supplémentaire n'est accordé au renderer Electron. Voir PROVIDERS.md pour les limites opérationnelles Redis et les conditions d'activation live.


## Persistance V2 — phase 2

Budgets et journal résident désormais dans PostgreSQL, avec réservations transactionnelles et défaut fermé si le stockage est indisponible. L'intention avant appel et le règlement restent inspectables après arrêt ; aucun remboursement automatique d'appel ambigu. RLS forcée sur données privées, catégories de même propriétaire et FK d'origine sur toutes les nouvelles liaisons. Le contexte SQL doit provenir du futur serveur authentifié, avec rôle sans superuser/BYPASSRLS ; il ne constitue pas lui-même une authentification. Le lanceur de migrations vérifie les empreintes, verrouille les tables au retour arrière et refuse la perte de données. Les sauvegardes contiennent potentiellement des notes privées et nécessitent contrôle d'accès/chiffrement selon l'hébergement. Voir V2_PHASE2.md. Aucun secret n'est ajouté aux préférences V2 ni au renderer.


## Collecte V2 — phase 3

Flux HTTPS avec résolution épinglée, absence de redirection, lecture NDJSON bornée, silence/arrêt contrôlés ; secrets serveur inchangés. Les POST de règles sont limités au préfixe géré et ne sont pas rejoués automatiquement après un envoi ambigu. Les fenêtres REAL exigent une borne de facturation vérifiée et une réservation avant connexion. Les curseurs et publications sont transactionnels, les résultats d'un ancien bail sont refusés et la pause empêche de nouveaux enregistrements. Les devis sont propriétaire/processus, éphémères et consommés avant envoi. Requêtes locales paramétrées, données privées non transmises, notifications après COMMIT et isolées par origine/utilisateur. Aucun texte X n'est exécuté ou rendu en HTML par ces services. Voir V2_PHASE3.md pour les limites avant exposition publique.

## Personnes et notes privées — phase 4

Les notes ne sont utilisées ni dans les appels X, ni dans les journaux techniques, ni dans une requête LLM. Les formulaires React les affichent comme texte échappé. Le stockage DEMO est local au profil Windows/navigateur, sous une clé distincte des préférences V1, sans chiffrement applicatif. Il n'offre aucune protection contre une autre personne utilisant la même session, un administrateur ou une session compromise. Une lecture invalide ne déclenche pas d’écrasement.

Le stockage serveur est PostgreSQL dans l’instance privée : propriétaire/origine filtrés dans chaque opération, transactions avec contexte RLS local, rôle d’application sans superuser/BYPASSRLS obligatoire. Le service est privé et ne remplace pas l’authentification du futur serveur. Les confirmations sont éphémères et limitées au processus/propriétaire ; aucun champ de note dans la carte de réponse fournisseur. Les sauvegardes peuvent contenir les anciennes notes : contrôle d’accès, chiffrement du disque/backup et rétention doivent être configurés par l’hébergeur ; aucun chiffrement au repos automatique n’est prétendu. Supprimer la fiche supprime sa note courante, sans promettre une purge des sauvegardes. Voir [V2_PHASE4.md](V2_PHASE4.md).

## Conversations — phase 5

Les commentateurs ordinaires n’obtiennent aucune fiche de suivi : seuls ID, pseudo, nom affiché et date d’observation nécessaires à la conversation sont persistés dans une table privée de cette vue. Les champs de profil supplémentaires ne sont pas demandés, sont écartés s’ils sont renvoyés et ne peuplent pas le cache de profils. Aucun historique d’activité inter-conversations ni âge de compte n’est construit. Les statistiques sont agrégées dans le seul contexte des réponses récupérées ; toute hypothèse de coordination reste non prouvée. Le service n’envoie aucune note privée à X ou à un LLM.

Devis à confirmer, bornes de pages/reprises, jetons de confirmation propriétaire/processus, verrou partagé, ingestion et métadonnées atomiques. Les deux nouvelles tables ont une RLS forcée et des relations propriétaire/origine. Le rôle applicatif sans BYPASSRLS et l’authentification réelle restent requis avant exposition HTTP. Les textes restent échappés ; aucune ouverture de lien fictif ni accès réseau nouveau dans le renderer. Voir [V2_PHASE5.md](V2_PHASE5.md).

## Événements — phase 6

Les critères d’événement et les attestations manuelles restent propres au propriétaire. Les liens calculés sont désormais privés, même si une autre personne a collecté la même publication publique ; les anciennes liaisons publiques restent identifiées séparément. RLS forcée et filtres explicites dans tous les lecteurs concernés, plus les règles d’alerte. La classification « officiel selon attestation manuelle » ne repose jamais sur un nom, badge ou nombre d’abonnés et n’est pas une vérification automatique de la preuve. Aucune note ou critère privé n’est envoyé à X/LLM. Les identités minimales de conversation sont réutilisées dans ce seul contexte, sans créer de profil global.

Les preuves de couverture portent révision, règle, dates et date d’enregistrement ; une configuration changée ne peut réutiliser une ancienne base comme si le périmètre était identique. Pas de preuve future ni d’exhaustivité automatique après une requête réussie. Règles d’alerte sauvegardées mais désactivées jusqu’à la phase 10. Stockage de démo séparé, local au profil, non chiffré par l’application. Voir [V2_PHASE6.md](V2_PHASE6.md).


## Phase 7 — preuves sociales privées

Migration 0009 : RLS forcée sur mentions, candidats et attestations ; lectures filtrées explicitement même en connexion administrateur. Aucun envoi externe ni nouvelle dépendance. EIP-55/Keccak borné, base58 décodé, URL HTTPS de tokens par liste blanche ; aucune URL de pool ou raccourcisseur résolu. Une adresse dans une URL non autorisée ne devient pas une preuve en texte. La confirmation exige une revue opérateur explicite d’une publication exacte d’un auteur officiellement attesté ; elle cesse après changement de contenu/révision, indisponibilité ou révocation. Les colonnes globales de première apparition ne sont pas alimentées par une collecte privée. Voir [phase 7](V2_PHASE7.md) pour limites et procédures.


## Phase 8 — analyse et graphique

Graphique chargé localement sans iframe/CDN. Source REAL exacte HTTPS api.geckoterminal.com, DNS épinglé, redirections refusées, délai/corps bornés, aucune activation implicite. Requêtes réservées dans le contrôle partagé ; 429 sans boucle de retry. Cache public séparé des marqueurs privés, filtrés par propriétaire même en connexion administrateur. Adresses validées par chaîne, URL explorateur centralisées, HTML échappé et contrôles/bidi neutralisés. Aucune clé ou transaction crypto ajoutée. Voir [phase 8](V2_PHASE8.md).


## Phase 9 — contrôles de risque

Évaluations séparées par chaîne/adresse/origine, preuves bornées, TTL/échéance, contradictions et inconnues conservées. GoPlus GET fixe désactivé par défaut, DNS épinglé et limite PostgreSQL partagée indépendante. Adaptateurs Solana sans RPC ; ingestion réservée à un hôte de confiance, aucune donnée privée/sociale. Texte fournisseur échappé, URL affichées sans navigation automatique. Aucun wallet, signature ou transaction. Voir [phase 9](V2_PHASE9.md).


## Phase 10 — alertes privées

État, historique et livraisons privés par règle/propriétaire/origine, RLS forcée et verrou transactionnel. Déduplication et limites réévaluées avant livraison ; personne suivie relue sous verrou partagé, identité stable vérifiée. In-app uniquement, sans nouvel IPC ou appel externe ; provenance sans query string, corps techniques bruts refusés. Stockage local corrompu préservé. Raccordement serveur/collecteurs à venir. Voir [phase 10](V2_PHASE10.md).
