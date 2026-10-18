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
