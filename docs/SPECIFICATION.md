# PROMPT — Conception et développement de « MemeRadar » (version détaillée)

---

## 0. RÔLE, POSTURE ET RÈGLES DE CONDUITE

Tu agis comme une équipe technique senior condensée en une seule personne :

- **Architecte logiciel senior** (systèmes distribués, pipelines de données temps quasi réel, conception d'API) ;
- **Ingénieur données** spécialisé dans l'ingestion multi-sources, la normalisation, la déduplication et la traçabilité (data lineage) ;
- **Ingénieur blockchain** maîtrisant les écosystèmes EVM (Ethereum, Base, BNB Chain, Arbitrum) et Solana, les standards de tokens (ERC-20, SPL Token, Token-2022), les DEX (Uniswap v2/v3/v4, Raydium, Orca, Meteora, PancakeSwap, Aerodrome) et les launchpads de memecoins ;
- **Ingénieur sécurité applicative** (OWASP Top 10, OWASP ASVS, gestion des secrets, analyse de contrats intelligents, sécurité de la chaîne d'approvisionnement logicielle) ;
- **Analyste OSINT éthique** respectant strictement les conditions d'utilisation des plateformes et les lois sur la vie privée ;
- **Ingénieur qualité** (tests unitaires, d'intégration, de contrat, de bout en bout, tests de propriétés).

### Règles de conduite permanentes

1. **Honnêteté épistémique absolue.** Tu distingues toujours ce qui est *observé* (donnée brute avec source), *calculé* (transformation déterministe documentée) et *interprété* (hypothèse produite par un algorithme ou un modèle). Ces trois niveaux doivent être visibles dans le code, dans la base de données et dans l'interface.
2. **Aucune promesse de gain.** Le logiciel est un outil de veille et d'analyse. Il ne prédit aucun prix, ne recommande aucun achat ni aucune vente, et n'emploie jamais de vocabulaire promotionnel (« pépite », « x100 », « opportunité », « moon », « gem », « sûr », « solide », « garanti »).
3. **Aucune action financière.** Le logiciel ne se connecte à aucun portefeuille, ne demande jamais de clé privée, de phrase de récupération (seed phrase), de fichier keystore ou de signature, et n'exécute aucune transaction. Toute simulation on-chain doit se faire en lecture seule, sans signature.
4. **Conformité.** Tu respectes les conditions d'utilisation, les quotas et les restrictions de chaque API. Tu ne contournes jamais un paywall, un captcha, une limite de débit ou une protection anti-bot. Tu ne fais pas de scraping là où il est interdit. Tu ne collectes aucune donnée privée.
5. **Transparence sur les limites.** Quand une information manque, tu choisis une solution simple, tu la documentes dans un fichier `DECISIONS.md` (format ADR : contexte, décision, alternatives, conséquences) et tu continues.
6. **Pas de code fantôme.** Tu ne livres jamais de fichier contenant `// TODO: implémenter`, `...`, `pass` vide ou « le reste du code est similaire » à la place d'une logique attendue dans la V1. Si une fonctionnalité est volontairement hors périmètre V1, elle est marquée explicitement comme telle avec une interface stub qui lève une erreur claire (`NotImplementedInV1Error`) et elle est listée dans `LIMITATIONS.md`.

---

## 1. CONTEXTE ET OBJECTIFS DU PRODUIT

### 1.1 Problème

Les memecoins apparaissent souvent dans les minutes ou les heures qui suivent un événement viral (annonce d'entreprise, déclaration d'une personnalité, mème Internet, événement culturel). Ces tokens sont fréquemment des imitations, des arnaques (rug pulls, honeypots) ou des opérations de promotion coordonnée. Un utilisateur qui veut *comprendre* ce phénomène a besoin d'un outil qui relie, de manière traçable, un événement réel aux tokens qui s'en réclament, et qui expose les signaux de risque.

### 1.2 Objectifs (dans le périmètre)

- Détecter et regrouper des événements d'actualité à partir de sources autorisées.
- Mesurer l'évolution de l'attention portée à ces événements.
- Découvrir les tokens créés ou devenus actifs autour de ces événements.
- Évaluer la plausibilité du lien entre un token et un événement.
- Afficher les métriques de marché avec leur provenance et leur fraîcheur.
- Relever des signaux de risque on-chain, présentés comme tels.
- Générer des alertes configurables, dédupliquées et explicables.

### 1.3 Non-objectifs (hors périmètre, à ne pas implémenter)

- Trading, exécution d'ordres, sniping, bots d'achat, copy-trading.
- Prédiction de prix, de rendement ou de « potentiel ».
- Score global de type « bonne / mauvaise crypto ».
- Connexion à un portefeuille (WalletConnect, MetaMask, Phantom, etc.).
- Collecte de messages privés, de groupes fermés, de données personnelles non publiques.
- Désanonymisation de détenteurs de portefeuilles.

### 1.4 Utilisateurs cibles

- Chercheurs et journalistes qui étudient les dynamiques de memecoins.
- Analystes de risque et équipes de conformité.
- Utilisateurs avertis qui veulent vérifier un token avant toute décision personnelle.

---

## 2. MÉTHODE DE TRAVAIL ATTENDUE

Tu travailles en **phases successives**. À la fin de chaque phase, tu t'arrêtes, tu résumes ce qui a été produit, tu listes les décisions prises et tu attends ma validation avant de continuer (sauf si je t'indique « continue sans t'arrêter »).

| Phase | Contenu | Livrable |
|---|---|---|
| **Phase 1** | Analyse des exigences, hypothèses, risques du projet | Document de cadrage |
| **Phase 2** | Architecture, choix technologiques justifiés, diagrammes | `ARCHITECTURE.md` + diagrammes Mermaid |
| **Phase 3** | Modèle de données complet et migrations | Schéma SQL + migrations |
| **Phase 4** | Inventaire des API et fournisseurs, quotas, coûts, CGU | `PROVIDERS.md` + `.env.example` |
| **Phase 5** | Socle technique : monorepo, configuration, logs, erreurs, client HTTP résilient | Code du socle + tests |
| **Phase 6** | Module de veille (ingestion, normalisation, regroupement d'événements) | Code + tests |
| **Phase 7** | Module de découverte et d'association de tokens | Code + tests |
| **Phase 8** | Modules marché et risques on-chain | Code + tests |
| **Phase 9** | Module attention et personnalités | Code + tests |
| **Phase 10** | Indicateurs explicables | Code + tests |
| **Phase 11** | Système d'alertes | Code + tests |
| **Phase 12** | API backend complète | Code + tests de contrat |
| **Phase 13** | Interface utilisateur | Code + tests e2e |
| **Phase 14** | Mode démo et données fictives | Seeds + garde-fous |
| **Phase 15** | Documentation finale, limites, checklist de mise en production | `README.md`, `LIMITATIONS.md`, `SECURITY.md`, `RUNBOOK.md` |

Pour chaque fichier livré : indique son **chemin complet** en en-tête, fournis-le **en entier**, et si un message est trop long, découpe proprement par fichiers entiers (jamais au milieu d'un fichier) en annonçant « Suite au prochain message : fichiers X, Y, Z ».

---

## 3. ARCHITECTURE ET TECHNOLOGIES

### 3.1 Architecture cible (à présenter, justifier, puis implémenter)

Propose une architecture modulaire de type **monolithe modulaire avec workers asynchrones**, plus simple à déployer qu'une architecture microservices pour une V1, mais découpée de façon à pouvoir extraire des services plus tard.

Composants attendus :

1. **Connecteurs de sources** (ingestion) — un connecteur par type de source, avec une interface commune.
2. **Normaliseur** — transforme chaque élément brut en `RawItem` normalisé.
3. **Déduplicateur** — élimine les doublons exacts et quasi-doublons.
4. **Extracteur d'entités** — détecte personnalités, entreprises, produits, mots-clés.
5. **Regroupeur d'événements** (clustering) — rassemble les `RawItem` en `Event`.
6. **Traqueur d'attention** — calcule des séries temporelles de mentions.
7. **Découvreur de tokens** — interroge les indexeurs blockchain et DEX.
8. **Moteur d'association** — calcule le lien token ↔ événement.
9. **Enrichisseur marché** — récupère prix, volume, liquidité, transactions.
10. **Analyseur de risques** — permissions de contrat, détenteurs, liquidité, simulation de vente.
11. **Moteur d'indicateurs** — produit les cinq indicateurs explicables.
12. **Moteur d'alertes** — évalue les règles, applique les limitations, envoie les notifications.
13. **API backend** — REST (et éventuellement WebSocket/SSE pour le temps réel).
14. **Interface web** responsive en français.
15. **Planificateur** de tâches récurrentes.

### 3.2 Pile technologique recommandée (à justifier, alternatives à mentionner)

- **Langage** : TypeScript de bout en bout (Node.js 20 LTS) **ou** Python 3.12 pour le backend + TypeScript pour le frontend. Choisis une option, justifie-la et reste cohérent.
- **Backend** : Fastify ou NestJS (si TypeScript) / FastAPI (si Python).
- **Base de données** : PostgreSQL 16, avec l'extension `pg_trgm` pour la similarité textuelle et, si utile, TimescaleDB ou des tables partitionnées pour les séries temporelles.
- **File de tâches** : Redis + BullMQ (TypeScript) ou Redis + Celery/ARQ (Python).
- **Cache et limitation de débit** : Redis.
- **ORM / migrations** : Prisma ou Drizzle (TS) / SQLAlchemy + Alembic (Python).
- **Validation** : Zod (TS) / Pydantic v2 (Python) pour toute donnée entrante, y compris les réponses d'API externes.
- **Frontend** : Next.js (App Router) ou Vite + React, Tailwind CSS, une bibliothèque de graphiques (Recharts ou ECharts), TanStack Query pour la récupération de données.
- **Tests** : Vitest/Jest + Supertest (TS) ou Pytest (Python), Playwright pour le e2e, MSW ou `nock`/`respx` pour simuler les API externes.
- **Conteneurisation** : Docker + `docker-compose.yml` (Postgres, Redis, backend, worker, frontend).
- **Qualité** : ESLint/Prettier ou Ruff/Black, vérification des types stricte, hooks pre-commit.
- **Observabilité** : logs structurés JSON (pino ou structlog), identifiants de corrélation, endpoint `/health` et `/ready`, métriques Prometheus optionnelles.

### 3.3 Diagrammes attendus (en Mermaid)

- Diagramme de composants.
- Diagramme de flux de données, de la source brute jusqu'à l'alerte.
- Diagramme de séquence : « un article Tesla est publié → un événement est créé → un token est découvert → une alerte est envoyée ».
- Diagramme entité-relation de la base de données.

### 3.4 Arborescence attendue (à adapter selon la pile choisie)

```
memeradar/
├── apps/
│   ├── api/                # API backend
│   ├── worker/             # Workers asynchrones et planificateur
│   └── web/                # Interface utilisateur
├── packages/
│   ├── core/               # Types de domaine, règles métier pures
│   ├── connectors/         # Connecteurs de sources d'actualité
│   ├── chain/              # Clients blockchain et DEX
│   ├── analysis/           # Association, risques, indicateurs
│   ├── alerts/             # Moteur d'alertes
│   ├── db/                 # Schéma, migrations, dépôts
│   └── shared/             # Client HTTP résilient, logs, erreurs, config
├── seeds/demo/             # Données strictement fictives
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── fixtures/           # Réponses d'API enregistrées et anonymisées
│   └── e2e/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROVIDERS.md
│   ├── DECISIONS.md
│   ├── LIMITATIONS.md
│   ├── SECURITY.md
│   ├── RUNBOOK.md
│   └── INDICATORS.md
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## 4. SÉPARATION STRICTE DES DONNÉES RÉELLES ET FICTIVES

1. Chaque enregistrement de la base porte un champ `data_origin` avec les valeurs `REAL` ou `DEMO`. Ce champ est **non nul** et indexé.
2. Le mode est piloté par la variable `APP_MODE=demo|live`. En mode `demo`, aucun appel réseau externe n'est autorisé : le client HTTP partagé lève une erreur `NetworkDisabledInDemoMode` si une requête sortante est tentée.
3. En mode `live`, toute requête qui renverrait des données `DEMO` est filtrée côté dépôt (repository), pas seulement côté interface.
4. Les données fictives sont **évidemment fictives** :
   - noms d'entreprises et de personnalités inventés ou explicitement préfixés `[DÉMO]` ;
   - adresses de contrat **syntaxiquement reconnaissables comme factices** (par exemple `0xDEMO000000000000000000000000000000000001` pour EVM, ou une chaîne Solana commençant par `DEMo` et contenant un motif documenté), et validées par une fonction `isDemoAddress()` testée ;
   - liens pointant vers `https://demo.memeradar.invalid/...` (domaine `.invalid` réservé, jamais résolu).
5. L'interface affiche un **bandeau permanent** « MODE DÉMO — données entièrement fictives » en mode démo, et un badge « DÉMO » sur chaque carte d'élément fictif.
6. L'exemple Tesla demandé ci-dessous doit exister **uniquement** en tant que scénario de démonstration clairement fictif. Il ne doit jamais inclure une vraie adresse de contrat ni laisser penser qu'un token réel est associé à Tesla.

---

## 5. MODÈLE DE DONNÉES DÉTAILLÉ

Fournis le schéma SQL complet (ou le schéma ORM équivalent) avec types, contraintes, clés étrangères, index et commentaires. Au minimum :

### 5.1 Tables de veille

- **`sources`** : `id`, `type` (rss, api_news, official_press, social_x, social_reddit, social_youtube, social_telegram_public, custom), `name`, `base_url`, `reliability_tier` (A officiel / B média établi / C agrégateur / D réseau social / E inconnu), `reliability_notes`, `tos_url`, `tos_reviewed_at`, `rate_limit_policy` (JSON), `enabled`, `data_origin`, horodatages.
- **`raw_items`** : `id`, `source_id`, `external_id`, `url`, `canonical_url`, `title`, `body_excerpt` (texte limité, pas de reproduction intégrale d'articles protégés), `author_handle` (public uniquement), `language`, `published_at`, `fetched_at`, `content_hash` (SHA-256), `simhash`, `raw_payload_ref` (référence de stockage, avec durée de rétention), `data_origin`. Contrainte d'unicité sur `(source_id, external_id)` et index sur `content_hash`, `simhash`, `published_at`.
- **`entities`** : `id`, `type` (person, company, product, project, keyword, hashtag, ticker_mention), `canonical_name`, `aliases` (tableau), `official_handles` (JSON), `official_domains`, `verified_contracts` (adresses officiellement publiées par l'entité, avec source de vérification), `data_origin`.
- **`raw_item_entities`** : liaison avec `confidence`, `extraction_method` (dictionnaire, regex, NER, LLM).
- **`events`** : `id`, `title`, `summary`, `summary_method` (extractif, LLM, manuel), `first_published_at`, `first_detected_at`, `detection_latency_seconds` (calculé), `status` (emerging, active, fading, closed), `source_reliability_level`, `popularity_level`, `data_origin`, horodatages.
- **`event_items`** : liaison événement ↔ éléments bruts, avec `similarity_score`, `is_origin_candidate`.
- **`attention_snapshots`** : `event_id` ou `entity_id`, `bucket_start`, `bucket_size` (5 min, 1 h, 1 j), `mention_count`, `unique_accounts` (nullable si indisponible), `interactions` (nullable), `source_breakdown` (JSON), `data_completeness` (0–1), `data_origin`.
- **`watchlists`** et **`watchlist_items`** : suivi par l'utilisateur d'entreprises, personnalités, sujets et mots-clés, avec opérateurs (ET, OU, SAUF), langue, priorité.

### 5.2 Tables blockchain

- **`chains`** : `id`, `slug` (ethereum, base, bsc, arbitrum, solana), `family` (evm, svm), `chain_id` EVM, `explorer_url`, `enabled`.
- **`tokens`** : `id`, `chain_id`, `contract_address` (normalisée : checksum EIP-55 pour EVM, base58 validée pour Solana), `name`, `symbol`, `decimals`, `total_supply_raw` (en entier arbitraire, jamais en flottant), `token_standard`, `created_at_onchain`, `creation_tx`, `creator_address`, `first_activity_at`, `first_seen_by_app_at`, `launchpad` (nullable), `metadata_uri`, `data_origin`. Unicité sur `(chain_id, contract_address)`.
- **`pools`** : `id`, `token_id`, `dex`, `pool_address`, `quote_token`, `created_at_onchain`, `liquidity_usd`, `lp_locked_status` (locked, burned, unlocked, unknown), `lp_lock_source`, `last_updated_at`.
- **`token_event_links`** : `token_id`, `event_id`, `confidence_level` (CONFIRMED, PLAUSIBLE, WEAK, INSUFFICIENT_DATA), `reasons` (JSON structuré), `counter_reasons` (JSON), `impersonation_flags` (JSON), `time_delta_seconds` (création du token − premier signal de l'événement), `algorithm_version`, `computed_at`.
- **`market_observations`** : `token_id`, `observed_at`, `provider`, `metric` (price_usd, mcap_estimated, fdv, volume_5m/1h/6h/24h, liquidity_usd, tx_count, buyers, sellers, price_change_*), `value` (NUMERIC haute précision), `provider_timestamp`, `quality_flags` (stale, inconsistent, unverifiable_volume, outlier).
- **`holder_snapshots`** : `token_id`, `observed_at`, `top_holders` (JSON : adresse, solde, pourcentage, étiquette connue : pool, burn, CEX, contrat de verrouillage, créateur), `top10_pct_excluding_known`, `holder_count`, `provider`.
- **`risk_findings`** : `token_id`, `check_type`, `status` (signal_detected, no_signal_detected, check_failed, not_applicable, insufficient_data), `severity` (info, low, medium, high), `evidence` (JSON avec données brutes et sources), `limitations` (texte), `checked_at`, `checker_version`.
- **`wallet_movements`** : mouvements notables des gros détenteurs (adresse, direction, montant, tx, horodatage), sans aucune tentative d'identification de la personne.

### 5.3 Tables d'analyse, d'alertes et d'audit

- **`indicator_results`** : `subject_type`, `subject_id`, `indicator` (ATTENTION, EVENT_LINK, DATA_QUALITY, ONCHAIN_RISK, ANALYSIS_CONFIDENCE), `level` (valeur ordinale ou `INSUFFICIENT_DATA`), `inputs_used` (JSON), `factors` (JSON avec contribution de chaque facteur), `missing_inputs` (JSON), `algorithm_version`, `computed_at`.
- **`alert_rules`** : `id`, `type`, `conditions` (JSON validé par schéma), `channels`, `cooldown_seconds`, `min_confidence`, `quiet_hours`, `enabled`.
- **`alerts`** : `id`, `rule_id`, `triggered_at`, `reason` (texte lisible), `observed_data` (JSON), `sources` (liste d'URL), `fingerprint` (pour la déduplication), `status` (pending, sent, suppressed, acknowledged, dismissed_false_positive), `suppression_reason`.
- **`provider_calls`** : journal des appels externes (fournisseur, endpoint, statut, latence, quota restant, erreur) sans jamais enregistrer de clé API.
- **`audit_log`** : modifications de configuration, de règles et de sources.

---

## 6. MODULE 1 — VEILLE SUR LES ACTUALITÉS ET LES TENDANCES

### 6.1 Connecteurs de sources

Chaque connecteur implémente une interface commune :

```
interface SourceConnector {
  id: string
  type: SourceType
  fetchSince(cursor: Cursor | null): Promise<FetchResult>   // éléments + nouveau curseur
  healthCheck(): Promise<HealthStatus>
  rateLimitPolicy: RateLimitPolicy
  tosNotes: string                                          // résumé des conditions d'utilisation
}
```

Connecteurs à implémenter en V1 (avec mocks pour les tests) :

1. **RSS / Atom** générique (flux d'actualité, salles de presse officielles, blogs d'entreprises). Respect des en-têtes `ETag` et `Last-Modified`, intervalle minimal configurable par flux, `User-Agent` identifiable avec un contact.
2. **API d'actualité** (au choix et documenté : GDELT, NewsAPI, ou équivalent), avec gestion des quotas.
3. **Communiqués officiels** via flux RSS ou API de diffuseurs (lorsqu'autorisé).
4. **Réseau social X** via l'API officielle uniquement (niveau d'accès requis, coûts et limites à documenter). Si aucune clé n'est fournie, le connecteur est désactivé proprement avec un message explicatif.
5. **Reddit** via l'API officielle (OAuth, limites documentées).
6. **YouTube Data API** pour les vidéos publiques de chaînes suivies.
7. **Canaux Telegram publics** uniquement si l'accès se fait par un mécanisme autorisé ; sinon, connecteur listé comme non implémenté avec justification.
8. **Connecteur personnalisé** : l'utilisateur peut ajouter une URL RSS ou un webhook entrant (signé par HMAC).

Règles communes :
- Aucun contournement de paywall, de connexion obligatoire ou d'anti-bot.
- Respect de `robots.txt` pour tout accès HTTP non couvert par une API.
- Stockage d'un **extrait limité** et du lien vers l'original ; pas de republication intégrale de contenu protégé.
- Seules les publications **publiques** de comptes **publics** sont collectées.

### 6.2 Normalisation

- Normalisation Unicode (NFKC), nettoyage HTML sécurisé (aucune exécution de script, liste blanche de balises), détection de langue.
- Canonicalisation des URL (suppression des paramètres de suivi `utm_*`, `fbclid`, etc., résolution des redirections courtes avec une limite de sauts et un délai).
- Conversion de toutes les dates en UTC ISO 8601, en conservant le fuseau d'origine si disponible ; affichage dans le fuseau de l'utilisateur.

### 6.3 Déduplication

- **Doublons exacts** : `content_hash` et `canonical_url`.
- **Quasi-doublons** : SimHash ou MinHash avec seuil configurable (documenter la valeur par défaut et la raison).
- **Reprises d'une même dépêche** par plusieurs médias : rattachées au même événement, la source la plus ancienne et la plus fiable étant marquée comme `is_origin_candidate`.
- Tests avec des exemples de titres reformulés, traduits et tronqués.

### 6.4 Extraction d'entités

- Étape 1 : dictionnaire d'entités suivies + alias + comptes officiels.
- Étape 2 : expressions régulières pour les tickers (`$XXX`), hashtags, mentions, adresses de contrat collées dans le texte.
- Étape 3 (optionnelle, désactivable) : NER ou LLM. Si un LLM est utilisé :
  - le contenu externe est traité comme **donnée non fiable** (protection contre l'injection d'instructions) ;
  - la sortie est validée par un schéma strict ;
  - l'extraction est marquée `extraction_method = LLM` et considérée comme une interprétation.

### 6.5 Regroupement en événements

- Algorithme de regroupement incrémental : similarité textuelle (TF-IDF ou embeddings) + recouvrement d'entités + proximité temporelle (fenêtre glissante configurable).
- Création, fusion et fermeture d'événements avec règles explicites et journalisées.
- Calcul de `first_published_at` (plus ancienne publication connue) et `first_detected_at` (moment où l'application l'a vue) ; affichage de l'écart.

### 6.6 Fiabilité de la source vs popularité de l'événement

Ces deux notions sont **strictement séparées** dans le modèle, les calculs et l'interface :

- **Fiabilité de la source** : basée sur le niveau de la source (officielle, média établi, agrégateur, réseau social, inconnue), la vérification du compte, la présence d'une confirmation par une source de niveau A ou B. Un événement très populaire mais uniquement relayé par des comptes non vérifiés doit apparaître comme « populaire, fiabilité faible ».
- **Popularité** : basée sur le volume de mentions, la vitesse d'accélération, la diversité des sources.

Afficher un avertissement spécifique si l'événement n'est confirmé par aucune source officielle (« Information non confirmée par une source officielle à ce stade »).

### 6.7 Évolution de l'attention

- Séries temporelles par tranches de 5 minutes, 1 heure et 1 jour.
- Calcul de la vitesse (dérivée) et de l'accélération des mentions, avec lissage (moyenne mobile exponentielle) documenté.
- Champ `data_completeness` indiquant si certaines sources étaient indisponibles sur la tranche (pour ne pas confondre une panne de connecteur avec une baisse d'attention).

### 6.8 Suivi personnalisé

L'utilisateur peut suivre des entreprises, personnalités, sujets et mots-clés, avec :
- opérateurs booléens (ET, OU, SAUF) ;
- filtre de langue ;
- priorité (faible, normale, haute) influençant les alertes ;
- prévisualisation des éléments récents correspondants avant d'enregistrer.

### 6.9 Scénario de démonstration obligatoire (fictif)

Crée un scénario fictif complet : **« [DÉMO] Annonce virale d'un nouveau véhicule par Tesla »**, comprenant :
- 1 communiqué officiel fictif (source niveau A, URL en `.invalid`) ;
- 4 à 6 reprises par des médias fictifs à des heures différentes ;
- 15 à 30 publications sociales fictives montrant une montée puis une baisse de l'attention ;
- 4 tokens fictifs apparus après l'annonce, illustrant chacun un niveau d'association différent :
  1. un token au lien **plausible** (nom thématique, créé 40 minutes après l'annonce, liquidité modeste) ;
  2. un token au lien **faible** (nom vaguement lié, créé avant l'annonce) ;
  3. un token **imitateur** qui se présente comme « officiel Tesla » (signalé comme usurpation) ;
  4. un token avec **données insuffisantes** (pas de pool trouvé, métadonnées absentes) ;
- des signaux de risque variés (autorité de création active, forte concentration, liquidité non verrouillée, échec de vérification) ;
- 3 alertes fictives, dont une supprimée par le système anti-répétition.

Précise dans le scénario qu'aucune affirmation n'est faite sur Tesla ou ses produits réels.

---

## 7. MODULE 2 — RECHERCHE ET ASSOCIATION DE MEMECOINS

### 7.1 Découverte des tokens

Pour chaque événement actif, lance une recherche sur les blockchains configurées :

- **Sources de découverte** (à documenter avec leurs limites) : DexScreener, GeckoTerminal, Birdeye (Solana), fournisseurs RPC/indexeurs (Helius, Alchemy, QuickNode, Infura), explorateurs (famille Etherscan), éventuellement les API publiques des launchpads lorsque leurs conditions le permettent.
- **Stratégies de recherche** :
  1. recherche par mots-clés dérivés de l'événement (entités, termes clés, variantes, traductions, abréviations) ;
  2. flux des nouveaux pools récents par chaîne, filtrés ensuite localement ;
  3. adresses de contrat mentionnées dans les publications associées à l'événement.
- Génération de variantes contrôlées : casse, suppression d'espaces, ajout de suffixes courants (« inu », « coin », « ai », « 2.0 »), translittérations. Documenter la liste et la limiter pour éviter l'explosion combinatoire.

### 7.2 Identité d'un token

- L'identifiant unique est toujours **(blockchain, adresse de contrat normalisée)**.
- Le nom et le symbole ne sont **jamais** une preuve d'identité ni d'association.
- Validation stricte des adresses : checksum EIP-55 pour EVM ; validation base58 et longueur pour Solana ; rejet de toute adresse invalide avec erreur explicite.
- Affichage de l'adresse complète, avec bouton de copie et lien vers l'explorateur de la chaîne.

### 7.3 Détection d'usurpation et d'imitation

Signaler un token comme **imitateur potentiel** lorsque :
- son nom ou symbole correspond à une entité connue (entreprise, personnalité, projet) **et** son adresse ne figure pas parmi les contrats officiellement publiés par cette entité (`verified_contracts`) ;
- il utilise des **homoglyphes** (caractères cyrilliques ou grecs ressemblant à des lettres latines, caractères invisibles, espaces de largeur nulle) — implémenter une fonction de détection testée ;
- il emploie des termes comme « official », « officiel », « real », « verified » dans son nom ou ses métadonnées ;
- plusieurs tokens portent exactement le même nom/symbole sur la même chaîne (afficher le nombre de doublons).

L'interface doit afficher un avertissement visible : « Ce token utilise le nom d'une entité connue. Aucune preuve d'un lien officiel n'a été trouvée. »

### 7.4 Calcul du niveau de confiance de l'association

Implémente un moteur d'association **à base de règles explicites**, versionné, et documenté dans `INDICATORS.md` :

- **CONFIRMÉ** : uniquement si une source de niveau A (compte ou site officiel de l'entité) publie explicitement l'adresse exacte du contrat. Sinon, ce niveau ne peut jamais être atteint.
- **PLAUSIBLE** : correspondance thématique forte (entités et termes clés) **et** création ou première activité après le premier signal de l'événement, dans une fenêtre temporelle configurable **et** au moins une preuve supplémentaire (adresse mentionnée dans des publications liées à l'événement, métadonnées cohérentes).
- **FAIBLE** : correspondance thématique partielle, ou chronologie incohérente (token créé avant l'événement), ou correspondance uniquement par le nom.
- **DONNÉES INSUFFISANTES** : impossible de déterminer la date de création, métadonnées absentes, ou sources indisponibles.

Pour chaque association, stocker et afficher :
- la liste des **raisons** (éléments en faveur) ;
- la liste des **contre-indications** (éléments en défaveur) ;
- les **drapeaux d'usurpation** ;
- la version de l'algorithme.

### 7.5 Chronologie

Afficher une frise chronologique visuelle comprenant :
- premier signal connu de l'événement (publication originale) ;
- détection de l'événement par l'application ;
- création du contrat du token (bloc et transaction) ;
- création du premier pool de liquidité ;
- première transaction d'échange observée ;
- première mention du token dans les sources suivies ;
- détection du token par l'application.

Indiquer l'écart temporel entre chaque étape, et les **limites** : horloges des sources, délais d'indexation des fournisseurs, publications supprimées ou modifiées, fuseaux horaires, précision des horodatages de blocs.

---

## 8. MODULE 3 — ANALYSE DU MARCHÉ

### 8.1 Métriques

Lorsque les données existent :
- prix en USD et dans le jeton de cotation ;
- variations sur 5 minutes, 1 heure, 6 heures, 24 heures ;
- capitalisation estimée (préciser la méthode : offre en circulation vs FDV, et pourquoi l'offre en circulation est souvent incertaine pour les memecoins) ;
- volume par période ;
- liquidité totale et par pool ;
- nombre de transactions, d'acheteurs et de vendeurs distincts ;
- âge du token ;
- heure de dernière mise à jour ;
- **fournisseur source de chaque métrique**, affiché au survol ou en note.

### 8.2 Qualité des données de marché

Implémente des contrôles automatiques et affiche leurs résultats :
- **Fraîcheur** : une métrique est marquée « ancienne » au-delà d'un seuil configurable par type de métrique.
- **Cohérence entre fournisseurs** : si deux fournisseurs divergent au-delà d'un seuil (par exemple 5 % sur le prix, 20 % sur la liquidité), marquer « incohérent » et afficher les deux valeurs.
- **Cohérence interne** : volume 24 h très supérieur à la liquidité, nombre de transactions incompatible avec le volume, prix impossible (division par une liquidité quasi nulle).
- **Volume non vérifiable** : heuristiques de wash trading (ratio volume/liquidité extrême, transactions répétées entre un petit nombre d'adresses, achats et ventes de montants identiques à intervalles réguliers). Le volume est alors affiché avec la mention « qualité non vérifiable » et jamais présenté comme fiable.
- **Valeurs manquantes** : affichées explicitement « non disponible », jamais remplacées par zéro.

### 8.3 Précision numérique

- Aucun montant ni solde stocké en virgule flottante : utiliser des entiers arbitraires (BigInt) pour les quantités brutes on-chain et des décimaux haute précision pour les valeurs en USD.
- Formatage adapté aux très petits prix (notation avec indice de zéros ou notation scientifique lisible).

---

## 9. MODULE 4 — ANALYSE DES RISQUES ON-CHAIN

Chaque vérification produit un `risk_finding` avec un statut parmi : **signal détecté**, **aucun signal détecté**, **vérification échouée**, **non applicable**, **données insuffisantes**. « Aucun signal détecté » ne doit jamais être affiché comme « sûr ».

### 9.1 Concentration des détenteurs

- Récupérer les principaux détenteurs.
- Étiqueter et **exclure du calcul de concentration** les adresses connues : pools de liquidité, adresse de destruction (burn), contrats de verrouillage, portefeuilles de plateformes centralisées si identifiés publiquement.
- Calculer la part du top 1, top 10, top 20 hors adresses étiquetées, et la part détenue par le créateur.
- Limites : étiquetage incomplet, une même personne peut contrôler plusieurs adresses.

### 9.2 Mouvements des portefeuilles importants

- Détecter les transferts significatifs des principaux détenteurs et du créateur (seuil en pourcentage de l'offre et en USD).
- Signaler en particulier les transferts vers des pools (ventes potentielles) et les retraits de liquidité.

### 9.3 Liens observables entre portefeuilles

- Heuristiques purement on-chain : source de financement commune (même portefeuille ayant financé plusieurs détenteurs en frais de réseau), achats dans le même bloc ou dans un intervalle très court, transferts circulaires.
- Présenter comme « liens observables », jamais comme preuve qu'une même personne contrôle les adresses.
- **Interdiction** de tenter d'identifier les personnes derrière les adresses.

### 9.4 Liquidité

- Liquidité disponible par pool, évolution dans le temps, retraits soudains (seuil configurable).
- Statut des jetons LP : brûlés, verrouillés (avec plateforme de verrouillage et date d'expiration si disponible), non verrouillés, inconnu.

### 9.5 Permissions du contrat

**EVM** (à partir du code vérifié si disponible, sinon du bytecode et d'appels en lecture) :
- propriétaire (`owner`) actif ou renoncé ;
- fonction de création (`mint`) accessible ;
- liste noire / liste blanche, pause des transferts ;
- frais d'achat/vente modifiables, plafonds de transaction ou de portefeuille modifiables ;
- contrat **proxy** modifiable (upgradeable) — risque majeur à signaler ;
- code source non vérifié sur l'explorateur — à signaler comme limitation majeure.

**Solana** :
- autorité de création (`mint authority`) active ou révoquée ;
- autorité de gel (`freeze authority`) active ou révoquée ;
- extensions Token-2022 présentes (frais de transfert, transfer hook, délégué permanent, métadonnées modifiables) ;
- autorité de mise à jour des métadonnées.

### 9.6 Signaux de vente bloquée (honeypot)

- Simulation en **lecture seule** d'une vente (par exemple `eth_call` sur le routeur, ou `simulateTransaction` sur Solana) **sans aucune signature ni clé privée**, avec un compte de simulation fictif lorsque nécessaire.
- Utilisation possible de services tiers (GoPlus Security, Honeypot.is, RugCheck pour Solana, etc.), en affichant leur nom, leur résultat brut et le fait qu'il s'agit d'une opinion tierce.
- Limites à afficher : un contrat peut se comporter différemment selon l'adresse, le moment ou le montant ; une simulation réussie ne garantit pas qu'une vente réelle sera possible.

### 9.7 Message obligatoire dans la section risques

« Ces éléments sont des signaux automatisés et non des preuves. L'absence de signal ne signifie pas l'absence de risque. La volatilité, les ventes coordonnées et les retraits de liquidité peuvent entraîner des pertes importantes. »

---

## 10. MODULE 5 — PERSONNALITÉS ET ATTENTION

### 10.1 Métriques affichées séparément

- nombre de mentions observées ;
- évolution des mentions (graphique) ;
- nombre de comptes distincts (si disponible, sinon « non disponible ») ;
- interactions observées (j'aime, partages, réponses), avec la source ;
- publications à l'origine des mentions (lien vers chacune) ;
- répartition par plateforme.

### 10.2 Signaux de promotion coordonnée (hypothèses)

Heuristiques possibles, toutes présentées comme **hypothèses** :
- nombreux comptes récents publiant des textes quasi identiques dans un court intervalle ;
- forte proportion de comptes avec peu d'abonnés et une activité concentrée sur le token ;
- mêmes liens, mêmes images ou mêmes hashtags inhabituels répétés ;
- pics de mentions non corrélés à une source d'origine identifiable.

Afficher : « Hypothèse automatisée : des signes de promotion coordonnée ont été observés. Cela ne constitue pas une conclusion. »

### 10.3 Soutien des personnalités

- Ne jamais considérer qu'une personnalité soutient un token parce que son nom, son image ou ses propos sont utilisés.
- Distinguer trois cas, avec un libellé explicite :
  1. **Mention par la personnalité elle-même** depuis son compte officiel vérifié (fait observé, avec lien) ;
  2. **Mention de la personnalité par d'autres** (fait observé, sans implication de soutien) ;
  3. **Utilisation du nom ou de l'image dans la promotion du token** (fait observé, risque d'usurpation signalé).
- Chaque affirmation de l'interface porte un marqueur visuel : **Observé**, **Calculé** ou **Interprété**.

### 10.4 Vie privée

- Seuls les comptes publics et leurs publications publiques sont traités.
- Aucun profilage de particuliers non publics ; les comptes non notoires sont agrégés de façon anonyme dans les statistiques.
- Politique de rétention configurable (par exemple, suppression des extraits bruts après N jours).
- Prise en compte des lois applicables sur la protection des renseignements personnels (par exemple la Loi 25 au Québec, le RGPD en Europe) : documenter dans `SECURITY.md` les mesures et les points à faire valider par un juriste.

---

## 11. MODULE 6 — INDICATEURS EXPLICABLES

### 11.1 Principe

Aucun score unique. Cinq indicateurs indépendants, chacun avec une **échelle ordinale** (par exemple : très faible, faible, modéré, élevé, très élevé) ou la valeur **« données insuffisantes »**.

| Indicateur | Ce qu'il mesure | Ce qu'il ne mesure pas |
|---|---|---|
| **Attention** | Niveau et évolution des mentions | La qualité ou la valeur du token |
| **Lien avec l'événement** | Correspondance sujet/chronologie entre token et actualité | Une approbation officielle (sauf niveau confirmé) |
| **Qualité des données** | Fraîcheur, cohérence, fiabilité des sources | Le risque du token |
| **Risque on-chain** | Signaux relevés sur contrat, détenteurs, liquidité | L'absence de risque |
| **Confiance de l'analyse** | Quantité et qualité des éléments disponibles pour les autres indicateurs | La probabilité de succès |

### 11.2 Format de sortie obligatoire pour chaque indicateur

```
{
  indicator: "ONCHAIN_RISK",
  level: "HIGH" | ... | "INSUFFICIENT_DATA",
  inputs_used: [ { name, value, source, observed_at } ],
  factors: [ { name, effect: "augmente" | "diminue", weight, explanation } ],
  missing_inputs: [ { name, reason } ],
  algorithm_version: "onchain-risk@1.0.0",
  computed_at: "..."
}
```

### 11.3 Règles

- Si les entrées minimales définies pour un indicateur ne sont pas disponibles, la sortie est **« données insuffisantes »**, jamais une valeur par défaut.
- Les règles et pondérations sont des fonctions pures, testées, versionnées et documentées dans `INDICATORS.md`.
- L'interface affiche un panneau « Pourquoi ce niveau ? » listant les facteurs et les données manquantes.
- Interdiction de produire une prédiction de prix, de hausse, de rentabilité, ou une recommandation d'achat/vente, y compris de façon implicite (« signaux haussiers », « bon moment »).

---

## 12. MODULE 7 — ALERTES

### 12.1 Types d'alertes

- Nouvelle actualité liée à un mot-clé ou une entité suivie.
- Création d'un token associé à un événement (avec niveau de confiance minimal configurable).
- Forte accélération des mentions (seuil relatif à une base historique, pas seulement absolu).
- Changement notable de liquidité (ajout ou retrait au-delà d'un pourcentage).
- Mouvement inhabituel d'un portefeuille important.
- Nouveau signal de risque à sévérité élevée sur un token suivi.
- Panne ou dégradation d'une source (alerte technique distincte).

### 12.2 Définition des règles

- Règles stockées en JSON validé par un schéma, éditables via l'interface avec un constructeur visuel.
- Conditions combinables (ET/OU), seuils, fenêtres temporelles, filtres de chaîne, de niveau de confiance et de qualité des données.

### 12.3 Contenu d'une alerte

- heure de déclenchement (UTC et heure locale) ;
- raison lisible (« L'attention autour de [événement] a été multipliée par 4,2 en 30 minutes ») ;
- données observées ayant déclenché la règle ;
- liens vers les sources ;
- lien vers la fiche détaillée ;
- rappel de l'avertissement financier.

### 12.4 Limitation des répétitions et des faux positifs

- **Empreinte** (fingerprint) par alerte pour la déduplication.
- **Délai de récupération** (cooldown) par règle et par sujet.
- **Hystérésis** : une alerte de seuil ne se redéclenche qu'après un retour sous un seuil inférieur.
- **Regroupement** : plusieurs déclenchements proches sont fusionnés en une alerte résumée.
- **Heures silencieuses** configurables.
- **Seuil de qualité** : pas d'alerte si la qualité des données est sous un minimum configurable (ou alerte marquée « données peu fiables »).
- **Retour utilisateur** : bouton « faux positif » qui enregistre le retour et permet d'ajuster les seuils.
- Les alertes supprimées restent consultables avec la raison de suppression.

### 12.5 Canaux

- Notification dans l'application (obligatoire).
- Courriel (SMTP configurable).
- Webhook sortant signé (HMAC).
- Bot Telegram ou Discord sortant (optionnel, envoi uniquement).

---

## 13. MODULE 8 — INTERFACE UTILISATEUR

### 13.1 Exigences générales

- Interface entièrement en **français**, responsive (mobile, tablette, ordinateur), thème clair et sombre.
- Accessibilité : contrastes conformes WCAG 2.1 AA, navigation au clavier, libellés ARIA, les niveaux de risque ne sont jamais indiqués par la couleur seule (texte + icône).
- États gérés pour chaque vue : chargement, vide, erreur, données partielles, données anciennes.
- Horodatages en heure locale avec l'UTC au survol, et format relatif (« il y a 12 min »).
- Chaque résultat comporte un lien vers la source originale, ouvert dans un nouvel onglet avec `rel="noopener noreferrer nofollow"`.

### 13.2 Pages

1. **Tableau de bord** : événements émergents, tokens récemment associés, alertes récentes, état des sources, courbe d'attention globale.
2. **Événements** : liste filtrable ; fiche détaillée avec résumé, sources, entités, courbe d'attention, fiabilité vs popularité, tokens associés, chronologie.
3. **Tokens détectés** : liste filtrable ; fiche détaillée avec identité (adresse complète), association à l'événement (raisons et contre-indications), chronologie, marché, risques, attention, cinq indicateurs avec panneau « Pourquoi ? ».
4. **Alertes** : historique, règles, constructeur de règles, alertes supprimées, retours faux positifs.
5. **Sources** : liste des connecteurs, statut, dernier succès, quotas restants, niveau de fiabilité, lien vers les conditions d'utilisation, activation/désactivation.
6. **Paramètres** : chaînes activées, listes de suivi, seuils, fuseau horaire, canaux de notification, rétention, mode démo/réel (lecture seule si piloté par variable d'environnement).

### 13.3 Filtres

Par blockchain, période, sujet ou entité, niveau de risque, niveau de confiance de l'association, qualité des données, statut de l'événement. Les filtres sont reflétés dans l'URL pour être partageables.

### 13.4 Avertissement obligatoire

Visible en permanence (pied de page) et en tête de chaque fiche token :

> « Cette analyse est automatisée, peut être incomplète et ne constitue pas un conseil financier. Les memecoins sont des actifs très spéculatifs ; il est possible de perdre la totalité des sommes investies. »

### 13.5 Interdits d'interface

- Aucun bouton « Acheter », « Échanger », aucun lien d'affiliation vers des plateformes d'échange.
- Aucun classement des tokens par « potentiel » ou par performance de prix mis en avant.
- Aucun vocabulaire promotionnel.

---

## 14. SÉCURITÉ

1. **Secrets** : uniquement via variables d'environnement ; validation au démarrage (l'application refuse de démarrer si une variable requise en mode `live` est absente, avec un message clair) ; jamais de secret dans les logs, les erreurs, le frontend ou le dépôt Git.
2. **Aucune clé privée** : ajouter un test qui échoue si le code contient des motifs de type clé privée, phrase mnémonique ou appel de signature (`signTransaction`, `sendTransaction`, `Keypair.fromSecretKey`, etc.).
3. **Contenu externe non fiable** : nettoyage HTML (DOMPurify ou équivalent), échappement systématique, Content Security Policy stricte, aucune image externe chargée sans proxy ou liste blanche (risque de pistage), validation des URL (schémas `http`/`https` uniquement).
4. **Métadonnées de tokens hostiles** : noms et symboles peuvent contenir du HTML, des caractères de contrôle, des homoglyphes, des URL malveillantes ; traiter comme données hostiles.
5. **Protection SSRF** : le client HTTP refuse les adresses IP privées, locales et de métadonnées cloud lors de la résolution d'URL (redirections comprises).
6. **API backend** : authentification (au minimum un compte administrateur local avec mot de passe haché Argon2/bcrypt, ou intégration OIDC documentée), limitation de débit, validation de toutes les entrées, en-têtes de sécurité, CORS restrictif.
7. **Injection d'instructions** : si un LLM est utilisé pour les résumés ou l'extraction, le contenu externe est délimité, le modèle n'a accès à aucun outil d'action, et la sortie est validée par schéma.
8. **Chaîne d'approvisionnement** : versions de dépendances verrouillées, audit (`npm audit` / `pip-audit`), image Docker minimale, exécution non root.
9. **Journalisation** : logs structurés, identifiant de corrélation, niveau configurable, masquage automatique des champs sensibles.

---

## 15. RÉSILIENCE ET GESTION DES ERREURS

- **Client HTTP partagé** avec : délai d'expiration, nouvelles tentatives avec temporisation exponentielle et gigue, respect de l'en-tête `Retry-After`, coupe-circuit (circuit breaker) par fournisseur, limiteur de débit à seau de jetons (token bucket) par fournisseur, partagé via Redis entre les workers.
- **Typologie d'erreurs** : réseau, délai dépassé, quota atteint, authentification, réponse invalide (échec de validation de schéma), donnée manquante, fournisseur indisponible. Chaque type a un comportement défini (nouvelle tentative, mise en attente, désactivation temporaire, alerte technique).
- **Idempotence** : toutes les tâches de workers sont idempotentes (clés d'unicité, upserts).
- **Doublons** : contraintes d'unicité en base + déduplication applicative.
- **Données manquantes** : jamais remplacées par des valeurs par défaut trompeuses ; propagées jusqu'à l'interface sous la forme « non disponible ».
- **Dégradation gracieuse** : si un fournisseur tombe, les autres continuent ; l'interface indique quelles données sont affectées.
- **Réponses externes** : toutes validées par schéma ; une réponse non conforme est journalisée (sans données sensibles) et rejetée.

---

## 16. API ET FOURNISSEURS — INVENTAIRE ATTENDU

Produis un fichier `PROVIDERS.md` sous forme de tableau comprenant, pour chaque fournisseur : rôle, endpoints utilisés, authentification, offre gratuite ou payante, quotas connus, lien vers les conditions d'utilisation, données obtenues, limites connues, alternative possible. Catégories minimales :

- Actualités (GDELT, NewsAPI ou équivalent, flux RSS).
- Réseaux sociaux (API X, API Reddit, YouTube Data API).
- Découverte et marché DEX (DexScreener, GeckoTerminal, Birdeye).
- RPC et indexation (Helius, Alchemy, QuickNode ou Infura).
- Explorateurs (Etherscan et équivalents par chaîne, Solscan si API disponible).
- Sécurité de tokens (GoPlus Security, Honeypot.is, RugCheck).
- Référentiels de tokens officiels (CoinGecko, listes de tokens officielles) pour la vérification des contrats légitimes.
- Notifications (SMTP, Telegram Bot API, Discord webhooks).

Indique clairement que les quotas et tarifs doivent être vérifiés par l'utilisateur, car ils évoluent.

### 16.1 Fichier `.env.example`

Fournis un fichier complet, commenté, regroupé par catégorie, sans aucun vrai secret, avec des valeurs factices évidentes (`remplacer_par_votre_cle`), par exemple :

```
# --- Mode ---
APP_MODE=demo                     # demo | live
NODE_ENV=development
LOG_LEVEL=info
TZ_DEFAULT=America/Toronto

# --- Base de données et cache ---
DATABASE_URL=postgresql://memeradar:changeme@localhost:5432/memeradar
REDIS_URL=redis://localhost:6379

# --- Actualités ---
NEWSAPI_KEY=remplacer_par_votre_cle
GDELT_ENABLED=true

# --- Réseaux sociaux (optionnels) ---
X_API_BEARER_TOKEN=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
YOUTUBE_API_KEY=

# --- Blockchain ---
ENABLED_CHAINS=solana,ethereum,base
HELIUS_API_KEY=
ALCHEMY_API_KEY=
ETHERSCAN_API_KEY=
BIRDEYE_API_KEY=

# --- Sécurité de tokens ---
GOPLUS_API_KEY=

# --- Notifications ---
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
TELEGRAM_BOT_TOKEN=
WEBHOOK_SIGNING_SECRET=

# --- Application ---
SESSION_SECRET=remplacer_par_une_longue_chaine_aleatoire
ADMIN_EMAIL=admin@example.invalid
```

Complète cette liste selon tes choix et documente chaque variable (obligatoire ou optionnelle, mode concerné, effet si absente).

---

## 17. TESTS

### 17.1 Exigences

- Couverture minimale visée : 80 % sur les paquets `core`, `analysis` et `alerts`.
- Aucun test ne doit effectuer d'appel réseau réel : tous les fournisseurs sont simulés avec des réponses enregistrées dans `tests/fixtures/`, anonymisées et marquées fictives.

### 17.2 Tests unitaires minimaux

- Validation et normalisation d'adresses EVM (checksum) et Solana.
- `isDemoAddress()` et blocage réseau en mode démo.
- Détection d'homoglyphes et d'usurpation.
- Déduplication exacte et quasi-doublons.
- Canonicalisation d'URL.
- Moteur d'association : chaque niveau de confiance, y compris l'impossibilité d'atteindre « confirmé » sans source officielle.
- Calcul de la chronologie et des écarts temporels.
- Calcul de concentration avec exclusion des adresses étiquetées.
- Contrôles de qualité des données de marché (fraîcheur, incohérence, volume non vérifiable).
- Chaque indicateur, notamment le retour « données insuffisantes ».
- Moteur d'alertes : déclenchement, déduplication, délai de récupération, hystérésis, regroupement, heures silencieuses.
- Client HTTP : nouvelles tentatives, `Retry-After`, coupe-circuit, limiteur de débit, protection SSRF.
- Masquage des secrets dans les logs.

### 17.3 Autres tests

- **Tests de propriétés** (fast-check / Hypothesis) pour la normalisation et la déduplication.
- **Tests d'intégration** avec Postgres et Redis en conteneurs (Testcontainers ou docker-compose de test).
- **Tests de contrat** : les réponses enregistrées des fournisseurs passent les schémas de validation.
- **Test de sécurité statique** : absence de motifs de clé privée et d'appels de signature dans le code.
- **Tests de bout en bout** (Playwright) : parcours démo complet sur le scénario Tesla fictif (tableau de bord → événement → token imitateur → panneau « Pourquoi ? » → alerte), vérification de la présence de l'avertissement et du bandeau démo.

### 17.4 Commandes

Fournis les commandes exactes : installation, lancement des tests unitaires, d'intégration, e2e, couverture, linting, vérification des types.

---

## 18. MODE DÉMO

- Lancement en une commande (par exemple `docker compose up` avec `APP_MODE=demo`, ou `npm run demo`).
- Base peuplée automatiquement avec le scénario Tesla fictif et au moins deux autres scénarios fictifs inventés (par exemple un mème Internet viral et un événement sportif fictif).
- Simulation du passage du temps (rejeu des données fictives sur une période accélérée) pour voir l'attention évoluer et les alertes se déclencher.
- Garanties : aucun appel réseau, aucune donnée réelle, bandeau et badges visibles.

---

## 19. CONFORMITÉ ET CADRE LÉGAL (À DOCUMENTER, PAS À TRANCHER)

Rédige une section dans `LIMITATIONS.md` listant les points à faire valider par un professionnel avant un usage public ou commercial :
- conditions d'utilisation de chaque API (usage commercial, stockage, redistribution) ;
- droit d'auteur sur les extraits d'articles ;
- protection des renseignements personnels (Loi 25 au Québec, LPRPDE au Canada, RGPD en Europe selon les utilisateurs) ;
- réglementation des valeurs mobilières et des cryptoactifs (par exemple l'AMF au Québec) concernant tout contenu pouvant être perçu comme du conseil financier ;
- responsabilité en cas d'erreur de l'analyse.

---

## 20. LIVRABLES ATTENDUS

1. Document de cadrage et plan.
2. `ARCHITECTURE.md` avec diagrammes Mermaid.
3. Schéma de base de données et migrations.
4. Code complet de la première version, fichier par fichier.
5. `.env.example` complet et commenté.
6. `PROVIDERS.md` (API, fournisseurs, quotas, CGU, variables associées).
7. `README.md` : prérequis, installation, lancement en mode démo, lancement en mode réel, commandes de test, structure du projet.
8. `INDICATORS.md` : définition, entrées, règles et limites de chaque indicateur et du moteur d'association.
9. `SECURITY.md` : modèle de menaces simplifié, mesures prises, points restants.
10. `LIMITATIONS.md` : limites fonctionnelles, techniques, de données et légales de la V1.
11. `RUNBOOK.md` : surveillance, pannes de fournisseurs, rotation des clés, purge des données.
12. `DECISIONS.md` : décisions prises en l'absence d'information.
13. **Checklist avant usage réel**, incluant au minimum : vérification des CGU et quotas, test sur un petit ensemble de tokens connus et déjà analysés manuellement, comparaison des résultats avec des explorateurs officiels, revue de sécurité, validation juridique, plan de surveillance, procédure de signalement d'erreurs.

---

## 21. CRITÈRES D'ACCEPTATION (DÉFINITION DE « TERMINÉ »)

La V1 est considérée comme terminée lorsque :

- [ ] `docker compose up` en mode démo lance l'application complète sans aucune clé API.
- [ ] Le scénario Tesla fictif est navigable de bout en bout.
- [ ] Tous les tests passent et la couverture minimale est atteinte.
- [ ] Aucun appel réseau n'est possible en mode démo (test automatisé).
- [ ] Aucun motif de clé privée ou de signature n'existe dans le code (test automatisé).
- [ ] Chaque métrique affichée indique sa source et son heure de mise à jour.
- [ ] Chaque indicateur peut afficher « données insuffisantes » et explique ses facteurs.
- [ ] Le niveau « confirmé » est impossible sans source officielle publiant l'adresse exacte (test automatisé).
- [ ] L'avertissement financier apparaît dans le pied de page et sur chaque fiche token.
- [ ] Aucun vocabulaire promotionnel ni aucune prédiction n'apparaît dans l'interface (vérification par une liste de termes interdits testée).
- [ ] Les données manquantes sont affichées comme « non disponible » et jamais comme zéro.
- [ ] La documentation listée en section 20 est complète.

---

## 22. CE QUE TU NE DOIS JAMAIS FAIRE

- Prétendre que l'application détecte toutes les tendances instantanément.
- Prédire le succès, le prix ou la rentabilité d'un memecoin.
- Prétendre empêcher les rug pulls ou garantir la sécurité d'un token.
- Qualifier un token de « sûr », « solide », « fiable », « garanti » ou équivalent.
- Demander ou manipuler une clé privée, une phrase de récupération ou une connexion de portefeuille.
- Exécuter ou préparer des transactions signées.
- Contourner des restrictions d'accès, des quotas ou des conditions d'utilisation.
- Collecter des données privées ou tenter d'identifier les propriétaires de portefeuilles.
- Mélanger données fictives et réelles.
- Inventer des données, des scores, des fournisseurs ou des endpoints d'API : si tu n'es pas certain qu'un endpoint existe sous la forme décrite, indique-le explicitement et isole l'appel derrière une interface facilement adaptable.

---

## 23. POUR COMMENCER

Commence **uniquement par la Phase 1** : reformule les exigences en quelques points, liste tes hypothèses, les principaux risques du projet (techniques, de données, légaux) et les questions ouvertes pour lesquelles tu proposes une décision par défaut. Termine par le plan détaillé des phases suivantes, puis attends ma validation.
