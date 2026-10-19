# Décisions proposées — Phase 1

Statut des ADR 001 à 004 : retenu comme base de la phase 2 après validation du cadrage. Ces choix ne constituent pas encore une implémentation.

## ADR-001 — Monolithe modulaire TypeScript

**Contexte.** Dépôt vide, nombreuses règles métier partagées entre ingestion, API et interface ; besoin de workers sans complexité de microservices.

**Décision.** TypeScript strict, Fastify, React/Vite, PostgreSQL 16, Redis/BullMQ, Drizzle, Zod ; Vitest et Playwright. Retenir une version Node LTS maintenue et compatible au moment du socle, plutôt que figer Node 20 recommandé dans le document sans vérifier son support. Verrouiller les versions lors de l'installation.

**Alternatives.** Python/FastAPI et React (deux chaînes de types) ; NestJS (cadre plus lourd) ; Next.js (rendu serveur sans besoin démontré ici) ; microservices (coût opérationnel prématuré).

**Conséquences.** Contrats de domaine partagés, tests déterministes ; API et worker restent deux processus, avec gestion explicite de leurs cycles de vie. Les diagrammes et frontières sont décrits dans ARCHITECTURE.md (phase 2, à valider).

## ADR-002 — Démonstration isolée et prioritaire

**Contexte.** Aucune clé ni donnée réelle disponible ; risque majeur de présenter une fiction comme une observation réelle.

**Décision.** APP_MODE=demo par défaut ; origine obligatoire sur les données, filtrage dans les dépôts et refus des sorties externes dans le client partagé. Fixtures locales, URLs .invalid, adresses explicitement factices et rejeu déterministe. Prévoir une isolation réseau du déploiement démo ; tester également l'absence de sorties contournant le client partagé.

**Alternatives.** Démo reposant sur des API publiques ou mélangeant données live et seeds, rejetés car incompatibles avec la séparation demandée.

**Conséquences.** Démarrage sans abonnement ; chemin live séparé et configuration validée. Les téléchargements nécessaires à l'installation sont distincts des appels applicatifs pendant la démo. Les communications internes API/Postgres/Redis sont permises, pas les fournisseurs externes.

## ADR-003 — Règles déterministes et couverture explicite

**Contexte.** Association et analyse de risques ne permettent ni certitude financière ni exhaustivité ; les API et quotas évoluent.

**Décision.** Pas de LLM initial ; règles explicables et versionnées, provenance systématique, données manquantes propagées. Vérifier les fournisseurs avant d'annoncer une intégration ; pas de quota, endpoint ou tarif supposé. Aucun niveau CONFIRMED sans publication officielle de l'adresse exacte sur la chaîne concernée.

**Alternatives.** Score global, classification opaque, association sur le seul nom : rejetés conformément au cahier des charges.

**Conséquences.** Résultats reproductibles mais limites de couverture visibles. API sociales et canaux externes optionnels ; toute fonction V1 non livrée devra être signalée, jamais masquée par un résultat inventé.

## ADR-004 — Déploiement privé initial

**Contexte.** Aucun besoin multi-tenant ou hébergeur précisé ; données et canaux externes potentiellement sensibles.

**Décision.** Docker Compose, administrateur local avec mot de passe haché, sessions sécurisées ; fuseau America/Toronto, UTC en stockage. Rétention initiale proposée : extraits 30 jours, logs techniques expurgés 14 jours. Notifications internes par défaut, SMTP/webhook seulement sur activation explicite.

**Alternatives.** SaaS multi-tenant et OIDC dès le départ : coût supérieur sans besoin confirmé.

**Conséquences.** Ne suffit pas pour une ouverture publique ; hébergement, TLS, sauvegardes, autorisations, rétention et conformité devront être revus avant cet usage. Aucun secret ne sera demandé dans le chat.


## ADR-005 — Outbox transactionnelle et livraison au moins une fois

**Contexte.** Une écriture PostgreSQL et une publication Redis ne peuvent pas être rendues atomiques par une transaction locale unique.

**Décision proposée en phase 2.** Écrire les événements à publier dans une outbox au sein de la transaction métier ; dispatcher avec identifiant stable et consommateurs idempotents. Conserver alertes et suppressions en base avant tout envoi.

**Alternatives.** Double écriture directe (risque de perte) ; transactions distribuées (complexité excessive pour la V1).

**Conséquences.** Des doublons de tâches sont possibles et doivent être neutralisés. Un envoi externe à issue ambiguë peut être répété ; aucune garantie universelle exactement une fois.

## ADR-006 — Isolation réseau et origine des données

**Contexte.** Le seul blocage du client HTTP partagé ne protège pas contre une sortie via une autre bibliothèque ou le navigateur.

**Décision proposée en phase 2.** Profil Compose démo sans passerelle externe, ressources navigateur locales, liens fictifs non navigables ; bases et namespaces Redis distincts, contraintes d'origine sur les références et filtrage dans les dépôts. Profil live doté d'une sortie contrôlée.

**Alternatives.** Simple badge visuel ou simple filtre de requête, insuffisants pour les garanties demandées.

**Conséquences.** Tester séparément restrictions du transport, du déploiement et du navigateur. Le passage live exige un redémarrage et une configuration validée ; les contraintes SQL détaillées sont prévues en phase 3.


## ADR-007 — Schéma SQL explicite et intégrité d'origine

**Contexte.** La phase 3 doit être testable avant l'installation du socle TypeScript/Drizzle et préserver les preuves entre modes.

**Décision.** SQL PostgreSQL 16 comme référence initiale, migrations transactionnelles psql avec verrou et registre. Clés étrangères composites avec origine, NUMERIC exact et preuves officielles relationnelles. Les migrations Drizzle futures devront intégrer cet historique sans recréer les tables.

**Alternatives.** Générer immédiatement tout l'ORM sans socle ; conserver les preuves uniquement en JSON ; identifiants polymorphes sans clés étrangères.

**Conséquences.** Tests directs sur PostgreSQL possibles dès maintenant. Le schéma contrôle intégrité et formes simples ; validation cryptographique, authenticité des publications, JSON métier et filtrage des lectures restent applicatifs. Le registre technique des migrations est la seule table sans origine. Le rollback initial est destructif et exige confirmation explicite.


## ADR-008 — Application Windows autonome de démonstration

**Contexte.** Après la phase 3, l'utilisateur demande une application installable sur Windows 10/11. Les fournisseurs, backend et analyses live des phases suivantes n'existent pas encore.

**Décision.** Ajouter une édition de bureau Electron/React autonome, avec fixtures, calculs pédagogiques et préférences locales. Conserver le schéma PostgreSQL comme base du futur serveur ; ne pas imposer Postgres/Redis/Docker à l'utilisateur de la démo. Le mode live reste explicitement indisponible. Session Windows comme contrôle d'accès local, sans introduire un faux compte serveur.

**Alternatives.** Attendre les quinze phases avant tout paquet ; distribuer une interface nécessitant un serveur/Docker installé sur le PC ; prétendre fournir des analyses réelles avec les fixtures.

**Conséquences.** Premier logiciel local installable, sans secret ou abonnement. Les fonctionnalités effectivement livrées et reportées figurent dans DESKTOP.md et LIMITATIONS.md. Electron est configuré sans Node côté renderer, avec preload restreint et refus des sorties réseau. La validation Linux et la génération du paquet ne remplacent pas un essai Windows natif ni une signature d'éditeur.

## ADR-009 — Évolution V2 progressive et accès X séparé

**Statut.** Audit validé par l’utilisateur ; phase 1 V2 implémentée, intégration UI et déploiement live à venir.

**Contexte.** Le document V2 demande veille X, personnes, conversations et graphiques, tandis que l'édition 0.1.0 est une démonstration Electron autonome sans backend, client HTTP ou connexion à PostgreSQL. L'utilisateur souhaite conserver une installation Windows sans outils de développement.

**Décision proposée.** Conserver Electron/React, préférences et distribution V1. Refactoriser par extraction ciblée, créer un contrat XProvider avec adaptateur DEMO hors ligne et client REAL côté backend privé TypeScript/PostgreSQL/Redis. Sans backend/clé : état non configuré, pas de donnée réelle inventée. Les jetons ne sont jamais transmis au renderer ; les notes privées sont visibles uniquement par leur utilisateur et ne sont jamais envoyées à X ou à un modèle de langage. Ne pas remplacer l'installateur 0.1.0 ni modifier la migration 0001.

**Alternatives.** Réécriture complète ; collecte depuis le renderer avec jeton ; installation manuelle de Postgres/Redis imposée à l'utilisateur ; annoncer du live sur les fixtures. Ces alternatives ne répondent pas au besoin de compatibilité, sécurité ou simplicité d'installation.

**Conséquences.** L'hébergement et le financement du backend live restent à décider avant activation ; la démo ne dépend pas de ce service. Migrations additives, sauvegardes et nouvelle version de préférences ; tests V1 conservés. Les contradictions sur le scénario Tesla et les identifiants fictifs sont explicites dans AUDIT_V2.md et ne justifient aucune suppression silencieuse.


## ADR-010 — Réservations exactes partagées et activation live explicite

**Décision.** Client REST privé derrière XProvider, transport Undici 7.30.1 épinglé, validation Zod existante, ipaddr.js 2.2.0 pour le classement IP, ioredis 5.11.1 pour les contrôles atomiques Lua. Pas de SDK X ajouté : chemins vérifiés dans le SDK officiel, logique de contrôle sous notre responsabilité. tsx 4.23.15 exécute le diagnostic TypeScript hors renderer.

**Motifs.** Aucun transport partagé n'existait dans V1. Le refus DEMO précède DNS ; un tarif inconnu ou registre indisponible bloque les appels. Les montants sont exacts en micro-USD, les réservations pessimistes couvrent chaque tentative, les plafonds globaux et par fonctionnalité sont atomiques. L'adaptateur mémoire reste local aux tests, la composition live exige Redis. Les budgets ne sont jamais désactivables.

**Écarts explicités.** `getPostsByIds` retourne une page normalisée plutôt qu'un tableau nu, pour conserver provenance, erreurs partielles et quotas. Les variables de plafond portent l'unité MICRO_USD. Le flux optionnel, les probes périodiques, les priorités et alertes visibles sont reportés aux collecteurs/UI correspondants ; aucune méthode vide ne prétend les implémenter. Le journal Redis est provisoire avant la migration additive phase 2 et ne remplace pas un audit durable. Détails et garanties opérationnelles : PROVIDERS.md.


## ADR-011 — SQL versionné, ORM de requêtes et comptabilité durable

**Décision.** Conserver 0001 intact, ajouter 0002–0005 et un manifeste SHA-256. Lanceur pg/TypeScript avec verrou de session et transactions, refus des versions/empreintes inconnues, retour V2 global atomique sans perte de ligne. Le bootstrap V1 historique reste disponible pour ses tests ; la commande opérateur devient db:migrate. Le registre V1 sans checksum est adopté explicitement comme référence de confiance, sans prétendre certifier son passé.

**ORM.** Drizzle 0.45.4 et pg 8.23.1 pour les requêtes ; schéma complet des colonnes généré par introspection de SQL testé. Les contraintes/index/triggers/RLS restent dans le SQL, sans deuxième générateur DDL. Pas de drizzle push, pas de remplacement destructeur des tables. NUMERIC/domaines monétaires en chaînes exactes et bigint en bigint.

**Persistance.** PostgreSQL prend la responsabilité des budgets/réservations et du journal. Redis conserve les quotas et coordinations temporaires. Un runtime réel exige les deux ; pas de repli moins durable. Intention avant appel, coût connu après règlement, rapprochement des interruptions à ajouter avant déploiement. Aucun import automatique de compteurs externes ni mélange de versions de workers. RLS forcée sur personnes/catégories/règles privées ; rôle applicatif non privilégié et contexte utilisateur transactionnel, authentification serveur encore à livrer.

**Préférences.** Module V1→V2 testé, backup exact et publication exclusive sans écrasement ; activation différée jusqu'à l'interface V2 pour éviter une copie périmée pendant l'usage V1. Aucun secret/REAL introduit par conversion. L'application et l'installateur actuels restent sur leurs préférences V1.


## ADR-012 — Collecte clôturée par bail et flux à enveloppe vérifiée

**Décision.** Ajouter 0006 plutôt que réécrire une migration appliquée. Ingestion et curseur dans une même transaction ; jeton de bail et verrou de flux partagé, refus des résultats périmés. Le curseur maximal n'est promu qu'à la fin d'une pagination, et les erreurs conservent les pages déjà enregistrées. Les modes/règles sont fusionnés via jointures, pas par duplication de la publication. Propriétaire/origine filtrent les lectures et notifications.

**Modes.** Polling priorisé ou flux filtré borné et annulable, auto revient à la recherche disponible après échec. Un refus financier arrête aussi le rattrapage. Le flux REAL exige une borne contractuelle maximale de facturation par fenêtre ; sans cela il reste absent, car arrêter après N trames ne prouve pas que X facture au plus N. Les fenêtres ambiguës restent facturées prudemment à leur borne ; aucun tarif ni accès réel validé par les tests simulés.

**Recherche et livraison.** Devis propriétaire éphémère et à usage unique avant recherche payante, coût exact en micro-USD et budget durable toujours obligatoire. Recherche locale SQL paramétrée et filtres URL indépendants du réseau. Les abonnements et la pause du fil sont des services privés en mémoire, à relier à l'interface/transport authentifié dans les étapes prévues ; aucun SSE ou écran fictif annoncé. Disponibilité explicite avec masquage conservateur, planification de conformité/rétention et reprise exhaustive encore à finaliser avant activation réelle.

## V2 — phase 4 : personnes (18 octobre 2026)

Réutiliser les tables existantes, sans migration supplémentaire. Lier une règle interne `kind=people` à chaque fiche validée, isoler ces règles de la recherche par mots-clés et collecter uniquement par ID stable. Priorité = fréquence applicative et ordre de passage, jamais dépassement du budget. Confirmation propriétaire/processus à usage unique avant ajout validé ; préparation différée bornée, sans activation automatique d’une identité non confirmée. Interdire tout suivi d’un compte protégé ou de protection inconnue. Conserver les preuves publiques à la suppression mais effacer la note courante. Exposer une première page DEMO locale tout en gardant le futur serveur privé distinct ; notes locales non chiffrées, validation à la lecture, aucune modification des préférences V1. Ne pas republier le paquet 0.1.0 comme une V2. Détails et preuves : [V2_PHASE4.md](V2_PHASE4.md).

## V2 — phase 5 : conversations (18 octobre 2026)

Séparer les métadonnées publiques et la couverture privée de chaque propriétaire. Ajouter deux tables minimales avec RLS plutôt que réutiliser un compteur global qui révélerait ou mélangerait les collectes de plusieurs utilisateurs. Confirmer tous les devis, compter racine/reprises/expansions dans la borne, reprendre les pages explicitement, séparer citations et réponses. Permettre la recherche de conversation autorisée même si le lookup racine est indisponible. Ne jamais déclarer l’exhaustivité à partir d’une pagination terminée ou d’un ratio de 100 %. Limiter les commentateurs à une identité d’affichage par conversation et ne pas les mettre en cache comme profils. Arbre borné et itératif, trous explicites, tri des branches sœurs et liste chronologique. Réutiliser les services de facturation et l’ingestion avec un hook de transaction privé pour les métadonnées minimales. Scénario 35/120 ajouté sans modifier les trois fixtures de base du fournisseur V2. Aucun changement au paquet 0.1.0 publié. Voir [V2_PHASE5.md](V2_PHASE5.md).

## V2 — phase 6 : événements (18 octobre 2026)

Conserver le tableau de bord et les calculs d’origine, préciser leur périmètre, puis ajouter une fiche Nébula Mobile dédiée. Ne jamais remplacer une absence de couverture par zéro. Comparer seulement des tranches vérifiées pour toutes les règles d’un même périmètre, avec révision, requête de référence et date de preuve ; séparer interruptions de collecte et temps de publication. Rapprochements textuels interprétés, scores non probabilistes, attestations officielles manuelles explicites. Rendre privées les nouvelles liaisons pour ne pas révéler les critères d’un autre propriétaire ; conserver les liaisons publiques antérieures. RLS appliquée aussi aux règles d’alerte ; création réelle, exécution désactivée jusqu’à la phase 10. Lire les preuves de tokens existantes sans en inventer ni produire une association par nom. Jeu de 60 publications dédié, à unifier en phase 13. Aucun remplacement du paquet 0.1.0 publié. Voir [V2_PHASE6.md](V2_PHASE6.md).


## Phase 7 — chaîne exacte, connaissances privées et revue du sens

L’extraction ne choisit jamais une chaîne EVM d’après le symbole ou l’unicité du registre ; une URL autorisée ou un contexte opérateur explicite est nécessaire. Les URL de pools ne prouvent pas une adresse de token. L’implémentation EIP-55 utilise un Keccak borné testé sur les huit vecteurs ERC-55, sans dépendance ajoutée. Les premières apparitions restent privées dans le résultat calculé pour ne pas révéler la veille d’un autre propriétaire. Le moteur V1 est conservé ; les règles sociales s’ajoutent séparément. Une attestation d’identité officielle seule ne prouve pas le sens d’une publication : la confirmation exige une revue explicite de son objet, liée à sa source actuelle et révocable. Aucun contrat officiel n’est inventé dans la démo. Voir [phase 7](V2_PHASE7.md).


## Phase 8 — analyse et graphique

Lightweight Charts 5.2.1 (Apache-2.0), Fancy Canvas 2.1.0 (MIT), versions verrouillées et attribution/licences embarquées. Graphique chargé à la demande. Calculs financiers en décimales BigInt ; Number réservé au dessin borné, chaînes exactes conservées. Le seuil est comparé avant arrondi. Cache public par pool et période, marqueurs privés par propriétaire ; pool vérifié et côté de prix explicite. Pas de FDV déguisée en capitalisation, pas de retrait de liquidité déduit d’une seule variation. Voir [phase 8](V2_PHASE8.md).


## Phase 9 — analyse des risques

17 contrôles indépendants, sans score ni certification. Seuils locaux : concentration top 1 ≥ 10 % / top 10 ≥ 50 %, transfert ≥ 1 % ou sortie créateur identifié, baisse de liquidité ≥ 20 %. BigInt, rôles vérifiés pour exclusions, données partielles jamais transformées en absence de risque. TTL maximal cinq minutes et échéance LP, provenance et contradictions visibles. Table risk_findings réutilisée, acquisitions immuables/idempotentes. Aucun ajout de dépendance ni migration. Voir [phase 9](V2_PHASE9.md).


## Phase 10 — fréquence et reprise

Moteur déterministe séparé de V1, 12 types, états privés durables. Comparaisons exactes, hystérésis, cooldown, borne horaire glissante par observation, contrôle à l’admission et à la livraison ; suppression tracée sans report silencieux. Résumés périodiques UTC et quotidiens en heure civile IANA, DST couvert ; faux positifs sans suppression de preuve. Migration 0011 additive, une table, aucune dépendance ou canal externe. Voir [phase 10](V2_PHASE10.md).

## Phase 11 — administration des fournisseurs et budget engagé

Séparer les états observés de la présence d’une configuration. Journal technique sans texte fournisseur brut et consommation complète indépendante de la pagination du journal. Plafonds modifiables sous le même verrou que les réservations ; les nouvelles limites par fonctionnalité reprennent l’historique, avec remboursements attachés aux réservations d’origine. Test réseau explicite par nonce durable à usage unique, deux minutes, au plus une tentative sans retry automatique. Les secrets restent hors du renderer et des tables de gestion. Interface hors ligne dédiée jusqu’à la phase 12 ; voir [phase 11](V2_PHASE11.md).

## Phase 12 — navigation et portée des filtres

Neuf pages, fiche d’analyse rattachée aux tokens, anciens deep links conservés. Filtres dans l’URL avec contexte partagé explicite et contrôle privé des notes ; pas de score global de risque inventé. Nouvelle veille intégrée aux fixtures existantes, titres/focus clavier et erreur de vue isolée. Les liens externes restent désactivés dans l’édition DEMO, y compris les références documentaires par clic ordinaire ; aucun droit Electron élargi. Le raccordement serveur envisagé auparavant n’est pas livré par ce lot Navigation/UI ; son absence est documentée, sans annoncer une activation REAL dans la livraison démo. Voir [phase 12](V2_PHASE12.md).

## Phase 13 — catalogue, acquisition et horloge de démonstration

Catalogue Nébula de 63 publications uniques, quatre tokens Base/Solana et trois profils nommés, sans ajout automatique de personnes. XProvider simulé réutilisant ce catalogue, pages et auteurs minimaux, flux fini interrompable. Horloge locale partagée et persistante, pannes globales explicites, retour arrière sans destruction d’historique. Les nouvelles alertes de publication démarrent au point courant et utilisent les observations du catalogue ; autres cas d’alertes et compteurs restent pédagogiques explicitement distincts des calculs de marché. Aucun raccordement REAL implicite, aucune publication publique de paquet à cette phase. Voir [phase 13](V2_PHASE13.md).
