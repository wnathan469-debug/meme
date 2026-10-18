# PROMPT — Évolution de « MemeRadar » vers la V2 (Veille X, personnes suivies, conversations, graphiques)

---

## 0. RÔLE, POSTURE ET RÈGLES DE CONDUITE

Tu agis comme une équipe technique senior condensée en une seule personne :

- **Ingénieur logiciel senior** chargé de faire évoluer une base de code existante sans la casser (refactorisation progressive, compatibilité ascendante, migrations sûres) ;
- **Ingénieur données** spécialisé dans l'ingestion de flux sociaux, la déduplication, la reconstruction de conversations et la traçabilité des données ;
- **Spécialiste de l'API X** (anciennement Twitter API v2) : recherche récente, recherche complète si disponible, flux filtré, recherche d'utilisateurs, champs et expansions, identifiants de conversation, limites par point de terminaison, modèle de facturation ;
- **Ingénieur blockchain** maîtrisant les écosystèmes EVM et Solana, les DEX, les indexeurs et les données OHLCV ;
- **Ingénieur en visualisation de marchés** (graphiques financiers, séries temporelles, annotations, performance de rendu) ;
- **Ingénieur sécurité et confidentialité** (OWASP, gestion des secrets, contenus externes hostiles, minimisation des données, protection des renseignements personnels) ;
- **Ingénieur qualité** (tests unitaires, d'intégration, de contrat, de bout en bout, tests de non-régression).

### Règles de conduite permanentes

1. **Évolution, pas réécriture.** Tu pars du projet existant. Tu conserves ce qui fonctionne. Toute suppression ou réécriture d'un module existant doit être justifiée dans `DECISIONS.md` (format ADR : contexte, décision, alternatives, conséquences).
2. **Pas d'accès au code = pas de supposition.** Si le code du projet existant ne t'a pas été fourni, tu me le demandes avant toute modification (archive, arborescence, fichiers clés). Tu ne fais jamais semblant de connaître un code que tu n'as pas vu.
3. **Honnêteté épistémique.** Tu distingues toujours les données **observées** (brutes, avec source et heure de collecte), **calculées** (transformation déterministe documentée) et **interprétées** (hypothèse produite par l'application). Cette distinction existe dans le code, dans la base de données et dans l'interface.
4. **Honnêteté sur l'accès à X.** Tu ne prétends jamais que l'application voit toutes les publications, toutes les réponses ou tous les commentateurs, ni qu'elle est instantanée, si l'accès API configuré ne le permet pas. La couverture réelle est mesurée et affichée.
5. **Aucune promesse de gain.** Aucune prédiction de prix, aucune recommandation d'achat ou de vente, aucun vocabulaire promotionnel (« pépite », « x100 », « moon », « gem », « sûr », « solide », « garanti », « opportunité »).
6. **Aucune action financière.** Aucune connexion de portefeuille, aucune demande de clé privée, de phrase de récupération ou de signature, aucune transaction. Les simulations on-chain se font en lecture seule.
7. **Conformité.** Respect strict des conditions d'utilisation, des politiques développeur, des quotas et des restrictions de X et de chaque fournisseur. Aucun scraping de X, aucun contournement de limite, aucune automatisation de compte, aucun usage de comptes multiples pour multiplier les quotas.
8. **Vérification des faits techniques.** Les capacités, quotas, tarifs et niveaux d'accès de l'API X changent régulièrement. Tu ne codes jamais en dur une hypothèse non vérifiée : tu l'isoles dans une configuration, tu la documentes comme « à vérifier dans la documentation officielle à la date d'installation », et tu prévois une détection des capacités au démarrage lorsque c'est possible.
9. **Pas de code fantôme.** Aucun fichier livré ne contient `// TODO`, `...`, `pass` vide ou « le reste est similaire » à la place d'une logique attendue. Une fonction volontairement hors périmètre est un stub explicite qui lève `NotImplementedInV2Error` et figure dans `LIMITATIONS.md`.
10. **Non-régression.** Toutes les fonctionnalités et tous les tests existants doivent continuer de fonctionner après tes modifications, sauf changement explicitement documenté et validé.

---

## 1. PHASE 0 — AUDIT DU PROJET EXISTANT (OBLIGATOIRE AVANT TOUT CODE)

### 1.1 Ce que tu dois examiner

- Arborescence complète et organisation en modules.
- Langages, frameworks, versions, gestionnaire de paquets, fichiers de verrouillage.
- Schéma de base de données et historique des migrations.
- Connecteurs de sources existants (notamment un éventuel connecteur X déjà présent).
- Modules d'analyse : association token ↔ événement, marché, risques, indicateurs.
- Moteur d'alertes, file de tâches, planificateur.
- Client HTTP partagé (nouvelles tentatives, limitation de débit, coupe-circuit, protection SSRF).
- Interface : pages, routage, composants, bibliothèque de graphiques, gestion des états.
- Mode démo et séparation données réelles/fictives (`data_origin`, `APP_MODE`).
- Tests existants, couverture, commandes, intégration continue.
- Documentation existante (`README.md`, `ARCHITECTURE.md`, `PROVIDERS.md`, `LIMITATIONS.md`, `SECURITY.md`, `DECISIONS.md`, `INDICATORS.md`).
- Dette technique, failles de sécurité visibles, dépendances obsolètes ou vulnérables.

### 1.2 Ce que tu dois me présenter

1. **Inventaire de l'existant** : tableau « module / rôle / état (fonctionnel, partiel, cassé, absent) / qualité / tests ».
2. **Fonctions conservées** telles quelles.
3. **Fonctions à adapter**, avec la nature de l'adaptation.
4. **Fonctions à créer**.
5. **Analyse d'écart** entre l'existant et chaque section de ce prompt (tableau section par section).
6. **Risques de régression** et stratégie pour les éviter.
7. **Plan de migration de la base de données** : nouvelles tables, colonnes ajoutées, index, migration réversible, impact sur les données existantes.
8. **Dépendances à ajouter**, avec justification, licence et alternative.
9. **Clés API et accès requis**, en distinguant obligatoire, recommandé et optionnel.
10. **Questions ouvertes**, chacune accompagnée d'une décision par défaut que tu appliqueras si je ne réponds pas.

Tu t'arrêtes après la Phase 0 et tu attends ma validation.

---

## 2. MÉTHODE DE TRAVAIL APRÈS L'AUDIT

| Phase | Contenu |
|---|---|
| **Phase 1** | Couche d'accès à l'API X (client, détection des capacités, budget, limites) |
| **Phase 2** | Migrations de base de données |
| **Phase 3** | Veille X (collecte, déduplication, recherche, filtres) |
| **Phase 4** | Personnes suivies |
| **Phase 5** | Conversations et commentateurs |
| **Phase 6** | Améliorations des événements et de la chronologie |
| **Phase 7** | Liens tokens ↔ publications X |
| **Phase 8** | Page d'analyse et graphique du token |
| **Phase 9** | Extension de l'analyse des risques |
| **Phase 10** | Nouvelles alertes et réglage de fréquence |
| **Phase 11** | Page « Sources et API » (état, quotas, coûts, plafonds) |
| **Phase 12** | Interface et navigation |
| **Phase 13** | Mode démo étendu |
| **Phase 14** | Tests de non-régression, tests nouveaux, documentation finale |

Pour chaque phase :
- annonce les fichiers créés, modifiés et supprimés ;
- fournis chaque fichier **en entier**, avec son chemin complet en en-tête (pas de fragments isolés, sauf si je demande explicitement un diff) ;
- explique brièvement chaque modification d'un fichier existant ;
- fournis les tests associés ;
- termine par un récapitulatif et attends ma validation (sauf si je dis « continue sans t'arrêter »).

Si un message est trop long, découpe-le par fichiers entiers et annonce la suite (« Suite au prochain message : fichiers X, Y, Z »).

---

## 3. COUCHE D'ACCÈS À L'API X

### 3.1 Principes

L'accès à X est le composant le plus contraint du projet (coûts, quotas, niveaux d'accès variables). Toute la V2 doit fonctionner de manière **dégradée mais honnête** selon les capacités réellement disponibles.

### 3.2 Client X dédié

Crée un client `XApiClient` isolé derrière une interface, utilisant le client HTTP partagé existant (ou en l'étendant) :

```
interface XProvider {
  capabilities(): Promise<XCapabilities>
  searchRecent(query: XQuery, opts: PageOpts): Promise<XPage<XPost>>
  searchFullArchive?(query: XQuery, opts: PageOpts): Promise<XPage<XPost>>
  getPostsByIds(ids: string[]): Promise<XPost[]>
  getUserByUsername(username: string): Promise<XUser | null>
  getUsersByIds(ids: string[]): Promise<XUser[]>
  getUserPosts(userId: string, opts: PageOpts): Promise<XPage<XPost>>
  getConversation(conversationId: string, opts: PageOpts): Promise<XPage<XPost>>
  getQuotePosts?(postId: string, opts: PageOpts): Promise<XPage<XPost>>
  stream?: { setRules(rules: XStreamRule[]): Promise<RuleSyncResult>; connect(onPost, onError): StreamHandle }
}
```

Exigences :
- Authentification par jeton d'application côté serveur uniquement ; le jeton n'est **jamais** transmis au navigateur.
- Demande explicite des champs et expansions nécessaires (auteur, métriques publiques, références, identifiant de conversation, entités, langue, date de création), et **uniquement** ceux-là, pour limiter le volume facturé.
- Validation de chaque réponse par schéma (Zod ou Pydantic). Une réponse non conforme est journalisée sans données sensibles et rejetée.
- Lecture des en-têtes de limitation de débit renvoyés par X (limite, restant, réinitialisation) et mise à jour d'un registre partagé dans Redis.
- Gestion des réponses 429 : attente jusqu'à la réinitialisation annoncée ou temporisation exponentielle avec gigue, nouvelle tentative contrôlée (nombre maximal configurable), puis abandon propre avec erreur typée.
- Gestion des erreurs 401/403 (accès insuffisant pour ce point de terminaison) : la capacité correspondante est marquée indisponible et l'interface l'indique, sans boucle de tentatives.
- Coupe-circuit par point de terminaison.

### 3.3 Détection des capacités

Au démarrage et à intervalle configurable, le système établit une **matrice des capacités** :

| Capacité | États possibles |
|---|---|
| Recherche récente | disponible / indisponible / non testée |
| Recherche historique complète | disponible / indisponible / non testée |
| Flux filtré en temps réel | disponible / indisponible / non testée |
| Recherche d'utilisateur | disponible / indisponible / non testée |
| Récupération de conversation | disponible / limitée (fenêtre temporelle) / indisponible |
| Publications citantes | disponible / indisponible / non testée |
| Métriques publiques | disponibles / partielles / indisponibles |

La détection doit être économe : elle ne consomme pas de quota inutilement (privilégier la configuration déclarée + le résultat des premiers appels réels plutôt que des appels de test coûteux). La matrice est affichée sur la page « Sources et API » et utilisée par toute l'application pour activer, désactiver ou dégrader les fonctions.

### 3.4 Modes de collecte

1. **Mode flux** : si le flux filtré est disponible, connexion persistante, reconnexion automatique avec temporisation, détection des déconnexions silencieuses (absence de signal de maintien), journal des interruptions, rattrapage par recherche récente après une coupure si le budget le permet.
2. **Mode interrogation périodique** : si seul l'accès recherche est disponible, interrogation selon une fréquence configurable par règle et par priorité, avec utilisation de `since_id` pour ne récupérer que les nouveautés.
3. **Mode désactivé** : aucune clé ou aucune capacité ; la section « Veille X » affiche clairement « Accès X non configuré » et explique comment le configurer. En mode démo, des données fictives sont utilisées.

L'interface affiche en permanence le mode actif : « Temps réel (flux filtré) », « Mise à jour toutes les N minutes » ou « Non connecté ». Le terme « en direct » n'est utilisé qu'en mode flux réellement actif.

### 3.5 Budget et plafonds de coûts

- **Registre de consommation** (`x_usage_ledger`) : chaque appel enregistre le point de terminaison, le nombre de publications et d'utilisateurs récupérés, l'heure et une estimation de coût selon une grille tarifaire **configurable** (jamais codée en dur, car elle évolue).
- **Plafonds configurables** : par jour, par mois, et par fonctionnalité (veille, personnes suivies, conversations).
- **Contrôle préalable** : avant tout appel, le système vérifie que le budget restant le permet. Au-delà d'un seuil d'avertissement (par exemple 80 %), une alerte technique est émise ; au plafond, les collectes non prioritaires sont suspendues, puis toutes les collectes si le plafond strict est atteint.
- **Estimation avant action coûteuse** : le chargement d'une conversation complète ou d'un historique affiche une estimation (nombre d'appels, publications estimées) et demande confirmation si elle dépasse un seuil.
- **Priorisation** : en cas de budget limité, l'ordre de priorité est configurable (par défaut : personnes suivies à priorité haute → mots-clés à priorité haute → reste).

### 3.6 Conformité spécifique à X

- Respect des politiques développeur de X, notamment sur le stockage, l'affichage et la suppression des contenus.
- Mécanisme pour **refléter les suppressions** : une publication supprimée ou devenue inaccessible sur X doit être retirée ou masquée dans l'application selon les règles applicables (vérification périodique d'un échantillon, traitement des événements de conformité si l'accès le permet). Documenter précisément l'approche retenue et ses limites.
- Affichage conforme : attribution de l'auteur, lien vers la publication originale.
- Aucune republication en masse de contenus X hors de l'application.

---

## 4. MODÈLE DE DONNÉES — AJOUTS ET MODIFICATIONS

Fournis les migrations (réversibles) et le schéma ORM. Toutes les nouvelles tables portent `data_origin` (`REAL` / `DEMO`), non nul et indexé, et des horodatages.

- **`x_users`** : `id` interne, `x_user_id` (identifiant numérique immuable, unique), `username` actuel, `display_name`, `verified_type` (si fourni), `followers_count` et autres métriques publiques avec `metrics_observed_at`, `profile_url`, `first_seen_at`, `last_refreshed_at`, `is_tracked`, `data_origin`.
- **`x_username_history`** : historique des changements de nom d'utilisateur pour un même `x_user_id`.
- **`x_posts`** : `id` interne, `x_post_id` (unique), `author_x_user_id`, `text`, `lang`, `created_at` (heure de publication X), `collected_at` (heure de collecte), `collection_mode` (stream, search, user_timeline, conversation), `conversation_id`, `in_reply_to_post_id`, `post_type` (original, reply, quote, repost), `referenced_post_ids` (JSON typé), `public_metrics` (JSON) avec `metrics_observed_at`, `entities` (hashtags, mentions, URL, cashtags), `detected_contract_addresses` (JSON avec chaîne présumée et validité), `matched_rule_ids`, `availability_status` (available, deleted, withheld, unknown) avec `availability_checked_at`, `data_origin`.
- **`x_post_metrics_history`** : évolution des métriques publiques d'une publication dans le temps (pour l'évolution des interactions).
- **`x_rules`** : règles de collecte (mots-clés, hashtags, comptes, sujets), traduction en requête X, `stream_rule_id` si synchronisée, priorité, fréquence, actif/en pause, budget alloué.
- **`x_collection_runs`** : chaque exécution de collecte (règle, mode, début, fin, nombre récupéré, nombre nouveau, doublons, erreurs, coût estimé).
- **`tracked_people`** : `id`, `x_user_id` (unique), `display_name_override`, `category` (référence vers `person_categories`), `keywords` (tableau), `private_note`, `priority` (basse, normale, haute, critique), `status` (active, paused), `validation_status` (validated_via_api, unvalidated, not_found, suspended_or_unavailable), `validated_at`, `added_at`, `updated_at`, `data_origin`.
- **`person_categories`** : catégories personnalisables (influenceur, fondateur, trader, journaliste, personnalité publique, etc.), modifiables par l'utilisateur.
- **`conversations`** : `conversation_id` (unique), `root_post_id`, `reported_reply_count` (selon les métriques publiques), `retrieved_reply_count`, `coverage_ratio` (calculé), `coverage_status` (complete_as_far_as_known, partial, outside_api_window, unavailable), `last_fetched_at`, `fetch_cost_estimate`.
- **`post_token_mentions`** : liaison publication ↔ token (`detection_method` : adresse exacte, cashtag, nom, lien vers une page de token), `confidence`, `notes`.
- **`post_event_links`** : liaison publication ↔ événement, avec score et méthode.
- **`token_chart_markers`** : marqueurs à afficher sur le graphique (type : événement, publication X, changement de liquidité, création de pool, alerte), horodatage, référence, libellé.
- **`price_candles`** (ou cache OHLCV) : `token_id`, `pool_address`, `interval`, `bucket_start`, `open`, `high`, `low`, `close`, `volume`, `provider`, `fetched_at`.
- **`provider_status`** : état de chaque fournisseur (connecté, dégradé, en erreur, désactivé), dernière réussite, dernière erreur, quotas connus.
- **`provider_budgets`** et **`x_usage_ledger`** : plafonds et consommation (voir section 3.5).
- **Ajouts à `tokens`** : `first_social_seen_at`, `first_social_post_id`.
- **Ajouts à `alerts` / `alert_rules`** : nouveaux types, `delivery_mode` (immédiat, résumé), `digest_interval`, `max_per_hour`.

Tous les montants restent en entiers arbitraires ou en décimaux haute précision, jamais en virgule flottante.

---

## 5. SECTION « VEILLE X »

### 5.1 Fonctions

- Fil des publications détectées à partir des mots-clés, hashtags, comptes et sujets suivis, mis à jour selon le mode de collecte actif (section 3.4).
- Indicateur visible : mode de collecte, heure de la dernière collecte, prochaine collecte prévue, nombre de nouvelles publications.
- Mise à jour de l'interface en temps réel par WebSocket ou Server-Sent Events lorsque le backend reçoit de nouvelles publications ; sinon, rafraîchissement périodique avec indication explicite.
- Bouton « Pause du fil » pour figer l'affichage pendant la lecture, avec compteur de nouvelles publications en attente.

### 5.2 Recherche

Deux types de recherche, clairement distingués dans l'interface :
1. **Recherche locale** dans les publications déjà collectées (gratuite, instantanée, limitée à ce qui a été collecté) : texte intégral (index PostgreSQL), période, compte, mot-clé, hashtag, type de publication, langue, présence d'une adresse de contrat, lien avec un événement ou un token.
2. **Recherche sur X** via l'API (coûteuse, soumise aux quotas et à la fenêtre temporelle de l'accès) : affiche une estimation de coût et de quota avant exécution, la fenêtre temporelle accessible, et enregistre les résultats en base.

Constructeur de requêtes assisté qui traduit les critères de l'utilisateur en syntaxe de requête X, en respectant la longueur maximale et les opérateurs autorisés par le niveau d'accès (à paramétrer, non codé en dur). Validation de la requête avant envoi.

### 5.3 Filtres

- Type : originale, réponse, citation, republication (à partir des références fournies par l'API ; si l'information manque, type « inconnu »).
- Période, compte, personne suivie, catégorie de personne, mot-clé, hashtag, langue, événement associé, token associé, présence d'adresse de contrat, niveau d'interactions.
- Filtres reflétés dans l'URL.

### 5.4 Affichage d'une publication

- Texte (nettoyé et échappé ; liens affichés avec leur domaine réel), auteur (nom, identifiant, lien vers le profil), heure de publication et heure de collecte (locale, UTC au survol).
- Interactions disponibles avec l'heure à laquelle elles ont été observées (« 1 240 j'aime — observé il y a 8 min »).
- Contexte : publication à laquelle elle répond, publication citée, appartenance à une conversation, avec liens.
- Bouton bien visible **« Ouvrir sur X »** (lien construit à partir de l'identifiant de publication, ouvert dans un nouvel onglet avec `rel="noopener noreferrer nofollow"`).
- Badges : règle(s) correspondante(s), personne suivie, événement associé, token mentionné, adresse de contrat détectée.
- Marqueurs **Observé / Calculé / Interprété** sur chaque élément (par exemple : le texte est observé ; la langue détectée par l'application est calculée ; le lien avec un événement est interprété).
- Statut de disponibilité si la publication a été supprimée ou retenue.

### 5.5 Déduplication

- Unicité par `x_post_id` en base (contrainte + upsert idempotent).
- Une même publication reçue par le flux, par une recherche et par une conversation n'est stockée qu'une fois ; ses règles correspondantes et ses modes de collecte sont fusionnés.
- Les republications pointent vers la publication originale et ne gonflent pas artificiellement les compteurs de mentions (comptage séparé : mentions originales vs republications).
- Détection des quasi-doublons (textes identiques publiés par de nombreux comptes) utilisée comme signal possible de promotion coordonnée, sans fusion des publications.

### 5.6 Détection de contenus liés aux tokens

- Extraction des adresses EVM (`0x` + 40 caractères hexadécimaux, validation du checksum lorsque la casse est mixte) et Solana (base58, longueur valide, exclusion des faux positifs fréquents).
- Extraction des cashtags et des liens vers des pages de tokens (agrégateurs DEX, explorateurs), avec extraction de la chaîne et de l'adresse depuis l'URL.
- Une adresse détectée dans une publication est une **preuve d'association beaucoup plus forte** qu'un nom ou un cashtag ; un cashtag seul n'est jamais suffisant.

---

## 6. PAGE « PERSONNES SUIVIES »

### 6.1 Gestion manuelle

- Ajouter, modifier, mettre en pause, réactiver et supprimer une personne suivie.
- Champs : nom, identifiant X, catégorie personnalisée, mots-clés associés, note privée, priorité, état.
- Gestion des catégories : créer, renommer, supprimer (avec réaffectation).
- Import et export CSV optionnels, avec validation ligne par ligne et rapport d'erreurs.

### 6.2 Validation de l'identifiant

- Normalisation de la saisie (suppression du `@`, des espaces, extraction depuis une URL de profil).
- Validation syntaxique locale du nom d'utilisateur.
- Si la recherche d'utilisateur est disponible : appel à l'API, affichage d'une carte de confirmation (nom affiché, identifiant, métriques publiques, lien vers le profil) que l'utilisateur doit confirmer explicitement avant l'ajout.
- Stockage de l'identifiant numérique immuable `x_user_id` comme clé ; le nom d'utilisateur peut changer et son historique est conservé.
- Si l'API n'est pas disponible : ajout possible avec le statut « non validé », clairement affiché, et validation automatique ultérieure dès que l'accès le permet.
- Compte introuvable, suspendu ou protégé : statut correspondant, aucune collecte tentée sur un compte protégé.
- **Aucune déduction d'identité à partir du nom seul** : l'application ne propose jamais « c'est probablement le compte de telle personne ». Seul l'identifiant saisi et confirmé par l'utilisateur fait foi.

### 6.3 Doublons

- Unicité sur `x_user_id`. Si l'utilisateur tente d'ajouter un compte déjà suivi (même sous un ancien nom d'utilisateur), l'application l'indique et propose d'ouvrir la fiche existante.

### 6.4 Priorité et budget

- La priorité influence la fréquence de collecte des publications de la personne et sa place dans l'allocation du budget X.
- Afficher sur la page le coût estimé du suivi de chaque personne selon la fréquence choisie.

### 6.5 Note privée

- Visible uniquement par l'utilisateur, jamais envoyée à un fournisseur externe ni à un modèle de langage.
- Échappée à l'affichage. Documenter dans `SECURITY.md` la manière dont elle est stockée.

### 6.6 Fiche d'une personne

- En-tête : nom, identifiant, catégorie, priorité, état, statut de validation, lien vers le profil X.
- Publications détectées (avec filtres et lien « Ouvrir sur X » sur chacune).
- Sujets, mots-clés, événements et tokens mentionnés, avec le nombre de mentions et la méthode de détection.
- Graphique de l'évolution de l'activité publique observée (publications par jour/heure, interactions observées), avec la mention « basé uniquement sur les publications collectées ».
- Alertes associées.
- Encadré « Limites des données » : période couverte, mode de collecte, interruptions connues, publications potentiellement manquées.

### 6.7 Règles d'interprétation

- Une mention d'un token par une personne suivie est affichée comme « Mention observée », jamais comme un soutien ou une recommandation.
- Les signes possibles de promotion (publication contenant une adresse, un lien d'achat, un vocabulaire promotionnel, des mentions répétées du même token) sont affichés comme « Promotion possible — à vérifier », avec les éléments observés, jamais comme une conclusion.
- Afficher un rappel : « La mention d'un token par un compte connu ne garantit ni sa légitimité ni un lien officiel. »

---

## 7. CONVERSATIONS ET COMMENTATEURS

### 7.1 Fonctions

- Bouton « Voir la conversation » sur chaque publication pertinente, si la capacité est disponible.
- Récupération par identifiant de conversation, dans la limite de la fenêtre temporelle et des quotas de l'accès configuré (à paramétrer, à vérifier dans la documentation).
- Estimation du coût avant chargement d'une grande conversation, avec confirmation au-delà d'un seuil.
- Reconstruction de l'arborescence (publication racine → réponses → sous-réponses) à partir des références de réponse, avec gestion des maillons manquants (« réponse à une publication non récupérée »).
- Affichage des citations récupérables, séparément des réponses.
- Vue en arbre et vue en liste chronologique.
- Tri par date et par interactions disponibles ; filtres : réponses mentionnant un token, une adresse de contrat, un événement suivi, une personne suivie.
- Bouton « Ouvrir sur X » sur chaque réponse.
- Mise en évidence des réponses contenant une adresse de contrat (avec lien vers la fiche du token si celui-ci est connu).

### 7.2 Couverture et honnêteté

- Calcul et affichage du **taux de couverture** : nombre de réponses récupérées / nombre de réponses déclaré par les métriques publiques (lorsque disponible).
- Bandeau obligatoire si la couverture est incomplète ou inconnue : « Conversation partielle : N réponses récupérées sur environ M déclarées. L'application ne voit pas l'intégralité des réponses. »
- Indication explicite si la conversation dépasse la fenêtre temporelle accessible.
- Ne jamais afficher « toutes les réponses » ou « aucun autre commentaire ».

### 7.3 Commentateurs et confidentialité

- Afficher les comptes ayant répondu (identifiant, nom affiché, lien vers le profil) uniquement lorsque l'API fournit cette information.
- **Minimisation des données** : pour les comptes non suivis, ne stocker que ce qui est nécessaire à l'affichage de la conversation ; aucun profilage individuel des commentateurs ordinaires, aucune fiche automatique, aucune agrégation de leur activité hors du contexte de la conversation.
- Les statistiques sur les commentateurs (nombre de comptes distincts, proportion de comptes récents) sont agrégées et anonymes.
- Signaux possibles de promotion coordonnée dans une conversation (nombreuses réponses quasi identiques, comptes récents publiant la même adresse) : présentés comme hypothèse, de façon agrégée.

---

## 8. ÉVÉNEMENTS ET TENDANCES — AMÉLIORATIONS

Conserve le tableau de bord d'actualités existant et ajoute :

- **Publications X liées** à chaque événement (score de lien, méthode, lien « Ouvrir sur X »), en séparant les publications de comptes officiels, de personnes suivies et d'autres comptes.
- **Attention avant et après l'événement** : série temporelle couvrant une fenêtre de référence avant le premier signal (ligne de base) et l'évolution après ; calcul du multiplicateur par rapport à la ligne de base ; indication des trous de collecte pour ne pas confondre une panne avec une baisse d'attention.
- **Chronologie enrichie** : premier signal connu (source originale), première publication X liée observée, détection par l'application, premières mentions par des personnes suivies, création des tokens associés, premières mentions de ces tokens sur X.
- **Fiabilité de la source** distincte de la **popularité**, conservée et visible.
- **Alertes** créables directement depuis un événement (sujet, entreprise, personnalité, mot-clé, hashtag).

### Exemple de démonstration obligatoire (fictif)

Crée le scénario fictif **« [DÉMO] Annonce virale d'un nouveau produit par l'entreprise fictive Nébula Mobile »** comprenant :
- un communiqué officiel fictif et des reprises par des médias fictifs ;
- un compte officiel fictif `@demo_nebula_officiel` et 3 personnes suivies fictives (`@demo_analyste_julie`, `@demo_fondateur_marc`, `@demo_trader_k`) ;
- 40 à 80 publications X fictives (originales, réponses, citations, republications) montrant une montée puis une baisse de l'attention ;
- une conversation fictive partielle (par exemple 35 réponses récupérées sur 120 déclarées) avec des réponses contenant des adresses de contrat fictives ;
- 4 tokens fictifs : un lien plausible, un lien faible, un imitateur se présentant comme « officiel », un cas de données insuffisantes ;
- des données de graphique fictives avec marqueurs ;
- des alertes fictives, dont une regroupée dans un résumé et une supprimée par l'anti-répétition.

Aucune entreprise, aucun compte X ni aucune adresse réels ne doivent apparaître dans les données de démonstration. Les liens « Ouvrir sur X » en mode démo pointent vers `https://demo.memeradar.invalid/...` et l'interface l'indique.

---

## 9. TOKENS LIÉS AUX ÉVÉNEMENTS — EXTENSIONS

Conserve le moteur d'association existant et ses règles, et ajoute :

- **Heure de première apparition sociale** (`first_social_seen_at`) et lien vers la publication correspondante, avec la mention « première apparition **observée** dans les données collectées » (une apparition antérieure non collectée est possible).
- **Publications associées** au token, classées par méthode de détection (adresse exacte > lien vers une page de token > cashtag > nom).
- **Raisons de l'association** enrichies par les preuves sociales : adresse publiée par un compte officiel (seul cas permettant « confirmé »), adresse publiée dans des publications liées à l'événement, etc.
- **Contre-indications** : token créé avant l'événement, adresse jamais mentionnée, mentions provenant presque uniquement de comptes récents.
- Règles inchangées : jamais d'association sur le seul nom ou symbole ; adresse du contrat toujours mise en évidence ; imitations de projets, entreprises ou personnalités signalées (homoglyphes, termes « officiel », absence de l'adresse dans les contrats officiellement publiés).

---

## 10. PAGE D'ANALYSE ET GRAPHIQUE DU TOKEN

### 10.1 Accès

- Bouton **« Ouvrir le graphique »** bien visible sur chaque carte de token, chaque ligne de liste, chaque résultat de recherche et chaque mention de token dans une publication.
- Route interne identifiée par la chaîne et l'adresse : `/tokens/{chaîne}/{adresse}`. Jamais par le symbole.
- Validation de la chaîne et de l'adresse côté routeur ; adresse invalide → page d'erreur explicite.
- Liens externes optionnels (agrégateurs DEX, explorateur de la chaîne) construits par une fonction unique `buildExternalTokenUrls(chain, address)`, testée, avec liste blanche de domaines configurables. Aucun lien construit à partir du symbole.

### 10.2 Contenu de la page

- En-tête : nom, symbole, chaîne, **adresse complète** avec bouton « Copier l'adresse » (retour visuel de confirmation), lien vers l'explorateur, drapeaux d'usurpation, niveau d'association, avertissement financier.
- **Graphique de prix** avec périodes sélectionnables (par exemple 5 min, 15 min, 1 h, 4 h, 1 j selon les données disponibles) et plages (1 h, 6 h, 24 h, 7 j, depuis la création).
- Choix du pool lorsque plusieurs pools existent (le graphique dépend du pool), avec le pool principal sélectionné par défaut selon une règle documentée (par exemple liquidité la plus élevée).
- **Volume** (histogramme sous le graphique) et **liquidité** (courbe ou indicateur séparé).
- **Transactions d'achat et de vente** : liste récente avec heure, type, montant, adresse abrégée (lien vers l'explorateur), et compteurs par période.
- **Capitalisation estimée** dans le temps, avec la méthode de calcul et ses limites (offre en circulation incertaine).
- **Changements importants horodatés** : détection automatique (variation de prix ou de liquidité au-delà d'un seuil sur une fenêtre, retrait ou ajout de liquidité, création de pool), listés et marqués sur le graphique.
- **Marqueurs** sur le graphique pour les événements associés, les publications X associées (en particulier celles des personnes suivies et des comptes officiels) et les alertes. Survol → aperçu ; clic → ouverture de la publication ou de l'événement.
- **Source et heure de mise à jour** de chaque série et de chaque métrique.

### 10.3 Choix techniques du graphique

- Bibliothèque de graphiques financiers adaptée (par exemple `lightweight-charts` de TradingView, licence Apache 2.0) ou la bibliothèque déjà utilisée par le projet si elle convient ; justifier le choix.
- Données OHLCV récupérées depuis un fournisseur documenté (par exemple GeckoTerminal ou Birdeye selon la chaîne), mises en cache dans `price_candles` avec durée de validité par intervalle.
- Si un outil graphique externe est intégré par iframe : uniquement depuis une liste blanche de domaines, avec CSP adaptée et attribut `sandbox` ; documenter les conditions d'utilisation de cet outil.
- Performance : chargement progressif, limitation du nombre de points, mise à jour incrémentale.

### 10.4 Données manquantes

- Pas de graphique disponible → message explicite (« Aucune donnée de prix n'est disponible pour ce token auprès des fournisseurs configurés »), avec la raison si connue (pas de pool, fournisseur indisponible, token trop récent).
- Métriques partielles → affichage des seules métriques disponibles, les autres marquées « non disponible ».
- Données anciennes ou incohérentes entre fournisseurs → badge correspondant, avec les deux valeurs.
- Jamais de données interpolées ou inventées pour combler un trou ; les trous sont visibles sur le graphique.

---

## 11. ANALYSE DES RISQUES DU TOKEN — EXTENSIONS

Conserve l'analyse existante et assure, dans la page du token, une section complète portant sur :

- concentration des principaux détenteurs (hors pools, adresse de destruction, contrats de verrouillage) ;
- mouvements des portefeuilles importants, y compris ceux du créateur ;
- liquidité, statut des jetons LP et changements observés ;
- permissions du contrat (EVM : propriétaire, création, liste noire, pause, frais modifiables, proxy modifiable, code non vérifié ; Solana : autorité de création, autorité de gel, extensions Token-2022, autorité de mise à jour des métadonnées) ;
- possibilités de création de nouveaux tokens ou de restriction des ventes ;
- signaux de honeypot ou de vente bloquée (simulation en lecture seule et services tiers identifiés).

Chaque vérification affiche : statut (signal détecté, aucun signal détecté, vérification échouée, non applicable, données insuffisantes), éléments observés, source, heure, limites.

Ajouter un encadré **« Activité sociale et légitimité »** : « Une forte activité sur X ou la mention par un compte connu ne garantit pas la légitimité d'un token. Ces signaux peuvent résulter de promotion payée, de comptes automatisés ou d'usurpation. »

Message obligatoire : « Ces éléments sont des signaux automatisés et non une certification de sécurité. L'absence de signal ne signifie pas l'absence de risque. Les memecoins sont très spéculatifs et peuvent subir des manipulations et des pertes rapides. »

---

## 12. ALERTES PERSONNALISÉES — EXTENSIONS

### 12.1 Nouveaux types

- Nouvelle publication d'une personne suivie (option : uniquement si elle contient un mot-clé, un cashtag ou une adresse).
- Mot-clé ou hashtag détecté sur X.
- Hausse rapide du nombre de mentions (par rapport à une ligne de base, pas seulement un seuil absolu).
- Événement associé à un sujet suivi.
- Token nouvellement détecté (avec niveau d'association minimal configurable).
- Variation importante de liquidité ou d'activité de transactions.
- Changement de risque (apparition d'un nouveau signal, changement de statut d'une vérification).
- Alertes techniques : quota proche de la limite, plafond de budget atteint, déconnexion du flux, fournisseur en erreur.

### 12.2 Contenu

Chaque alerte inclut : raison lisible du déclenchement, données observées, heure (locale et UTC), source, et **accès direct** à la publication sur X et/ou à la fiche et au graphique du token. Rappel de l'avertissement financier pour les alertes liées aux tokens.

### 12.3 Fréquence et anti-répétition

- Mode de livraison par règle : immédiat, résumé toutes les N minutes, résumé quotidien.
- Nombre maximal d'alertes par heure et par règle.
- Empreinte de déduplication, délai de récupération, hystérésis, regroupement des déclenchements proches, heures silencieuses.
- Seuil de qualité de données minimal.
- Bouton « faux positif » et historique des alertes supprimées avec raison.
- Les alertes sur une personne en pause sont suspendues automatiquement.

### 12.4 Canaux

Notification dans l'application (obligatoire), courriel, webhook sortant signé, bot Telegram/Discord sortant (optionnels).

---

## 13. PAGE « SOURCES ET API »

Afficher pour X et pour chaque autre fournisseur :

- état de connexion (connecté, dégradé, en erreur, désactivé, non configuré) ;
- matrice des capacités (pour X) ;
- mode de collecte actif et fréquence ;
- date et heure de la dernière collecte réussie, de la dernière erreur ;
- journal des erreurs récentes (type, point de terminaison, heure, message nettoyé sans secret) ;
- limites rencontrées (réponses 429, quotas restants, heure de réinitialisation) ;
- consommation : nombre d'appels, publications récupérées, coût estimé par jour et par mois (avec la grille tarifaire configurée et la mention « estimation, à vérifier dans le tableau de bord du fournisseur ») ;
- plafonds de budget, pourcentage consommé, comportement au plafond ;
- réglages modifiables : fréquence de collecte par règle et par priorité, plafonds, activation/désactivation par fournisseur ;
- bouton « Tester la connexion » qui effectue un appel minimal et indique son coût potentiel ;
- liens vers les conditions d'utilisation et la documentation de chaque fournisseur.

Gestion technique (à appliquer partout) : attente progressive avec gigue, respect des en-têtes de réinitialisation, mise en cache (durées configurables par type de donnée), nouvelle tentative contrôlée, coupe-circuit, plafond strict anti-dépassement.

---

## 14. INTERFACE ET NAVIGATION

### 14.1 Navigation

Menu principal (barre latérale sur ordinateur, menu repliable ou barre inférieure sur mobile) :
1. Tableau de bord
2. Veille X
3. Conversations
4. Personnes suivies
5. Événements
6. Tokens détectés
7. Alertes
8. Sources et API
9. Paramètres

### 14.2 Exigences

- Interface entièrement en français, responsive, thèmes clair et sombre.
- Accessibilité WCAG 2.1 AA ; les niveaux de risque et de confiance ne reposent jamais sur la couleur seule.
- États de chargement, vide, erreur, données partielles, données anciennes, accès X non configuré.
- Filtres globaux et par page : période, blockchain, personne suivie, catégorie, mot-clé, hashtag, événement, niveau de risque, niveau d'association, qualité des données ; reflétés dans l'URL.
- Boutons **« Ouvrir sur X »** et **« Ouvrir le graphique »** visuellement cohérents et faciles à repérer partout où ils s'appliquent.
- Tableau de bord enrichi : dernières publications des personnes suivies, mentions en forte hausse, état de la connexion X et du budget.
- Bandeau « MODE DÉMO — données entièrement fictives » en mode démo.
- Avertissement financier permanent en pied de page et en tête de chaque fiche token :

> « Cette analyse est automatisée, peut être incomplète et ne constitue pas un conseil financier. Les memecoins sont des actifs très spéculatifs ; il est possible de perdre la totalité des sommes investies. »

### 14.3 Interdits d'interface

Aucun bouton d'achat ou d'échange, aucun lien d'affiliation, aucun classement par « potentiel », aucun vocabulaire promotionnel.

---

## 15. SÉCURITÉ ET CONFIDENTIALITÉ

1. Clés API uniquement dans des variables d'environnement, validées au démarrage ; jamais dans le code, les logs, les messages d'erreur, le navigateur ou le dépôt.
2. `.env.example` mis à jour, sans secret réel.
3. Aucune demande de clé privée, de phrase de récupération ou de connexion de portefeuille ; test automatisé qui échoue si du code de signature ou des motifs de clé privée apparaissent.
4. Aucune transaction crypto.
5. **Contenus X et métadonnées de tokens traités comme hostiles** : échappement systématique, nettoyage HTML, caractères de contrôle et caractères bidirectionnels neutralisés, détection d'homoglyphes, liens affichés avec leur domaine réel, pas de prévisualisation automatique de liens externes côté serveur sans protection SSRF, pas de chargement d'images externes non filtré.
6. Content Security Policy stricte, en-têtes de sécurité, CORS restrictif, protection CSRF si sessions.
7. Authentification de l'application conservée ou ajoutée (au minimum un compte administrateur local avec mot de passe haché).
8. Si un modèle de langage est utilisé (résumés, extraction) : contenus externes délimités et traités comme données, aucune action possible par le modèle, sortie validée par schéma ; notes privées jamais transmises.
9. **Minimisation** : seules les données nécessaires et accessibles selon les règles des fournisseurs sont collectées ; durée de rétention configurable par type de donnée ; purge automatique ; respect des suppressions de contenus X.
10. Confidentialité des commentateurs ordinaires (section 7.3).
11. Documentation dans `SECURITY.md` des mesures, du modèle de menaces mis à jour et des points à faire valider par un juriste (conditions de X, protection des renseignements personnels selon la juridiction — par exemple la Loi 25 au Québec, le RGPD en Europe —, réglementation sur le conseil financier).
12. Séparation stricte démo/réel conservée : en mode démo, aucun appel réseau sortant (test automatisé).

---

## 16. VARIABLES D'ENVIRONNEMENT

Mets à jour `.env.example` avec, au minimum, une section X commentée :

```
# --- API X ---
X_API_ENABLED=false
X_API_BEARER_TOKEN=                    # jeton d'application, côté serveur uniquement
X_API_BASE_URL=https://api.x.com/2     # à vérifier dans la documentation officielle
X_COLLECTION_MODE=auto                 # auto | stream | polling | disabled
X_POLL_INTERVAL_SECONDS_DEFAULT=300
X_POLL_INTERVAL_SECONDS_HIGH_PRIORITY=60
X_MAX_RESULTS_PER_REQUEST=100          # à ajuster selon le niveau d'accès
X_CONVERSATION_MAX_POSTS=500
X_CONVERSATION_CONFIRM_THRESHOLD=200

# --- Budget X (estimations, grille tarifaire à renseigner) ---
X_PRICING_CONFIG_PATH=./config/x-pricing.json
X_BUDGET_DAILY_LIMIT=
X_BUDGET_MONTHLY_LIMIT=
X_BUDGET_WARNING_PERCENT=80
X_BUDGET_HARD_STOP=true

# --- Graphiques ---
CHART_DATA_PROVIDER=geckoterminal      # geckoterminal | birdeye | ...
CHART_CACHE_TTL_SECONDS_1M=30
CHART_CACHE_TTL_SECONDS_1H=300
EXTERNAL_CHART_ALLOWED_DOMAINS=

# --- Rétention ---
RETENTION_DAYS_X_POSTS=90
RETENTION_DAYS_CONVERSATIONS=30
RETENTION_DAYS_COMMENTER_DATA=30
```

Documente chaque variable : obligatoire ou optionnelle, mode concerné, valeur par défaut, effet si absente.

---

## 17. MODE DÉMO ÉTENDU

- Scénario « Nébula Mobile » (section 8) plus les scénarios existants, conservés.
- Fournisseur X simulé implémentant la même interface `XProvider`, y compris une simulation de flux (rejeu accéléré), de conversation partielle, de réponses 429, de déconnexion du flux et de dépassement de budget, afin de tester l'interface dans tous les états.
- Données de graphique fictives cohérentes avec les événements fictifs.
- Comptes, adresses et liens évidemment fictifs ; aucune donnée réelle ; aucun appel réseau.

---

## 18. TESTS

### 18.1 Non-régression

- Tous les tests existants doivent passer. Signale et justifie tout test modifié.

### 18.2 Nouveaux tests unitaires minimaux

- **Suivi manuel des comptes** : normalisation de l'identifiant (avec `@`, espaces, URL de profil), validation syntaxique, ajout, modification, pause, suppression, refus des doublons par `x_user_id`, détection d'un compte déjà suivi sous un ancien nom, statut « non validé » sans API, absence de collecte sur compte protégé.
- **Déduplication des publications** : même publication reçue par flux, recherche et conversation ; fusion des règles correspondantes ; republications ne gonflant pas les mentions originales ; upsert idempotent.
- **Liens vers les contrats** : `buildExternalTokenUrls` pour chaque chaîne, refus d'un symbole à la place d'une adresse, validation EVM (checksum) et Solana, route `/tokens/{chaîne}/{adresse}`, rejet d'adresses invalides, liste blanche de domaines.
- **Extraction d'adresses** depuis le texte et les URL, faux positifs exclus.
- **Conversations** : reconstruction de l'arbre avec maillons manquants, calcul du taux de couverture, bandeau « partielle ».
- **Alertes** : chaque nouveau type, résumés, plafond par heure, déduplication, délai de récupération, hystérésis, suspension pour une personne en pause.
- **Limites d'API** : lecture des en-têtes de limitation, réponse 429 avec attente jusqu'à la réinitialisation, nombre maximal de tentatives, 401/403 marquant la capacité indisponible, coupe-circuit, contrôle préalable du budget, arrêt au plafond strict, priorisation sous budget limité.
- **Mode de collecte** : bascule auto entre flux, interrogation et désactivé selon la matrice de capacités ; libellé « en direct » uniquement en mode flux.
- **Graphique** : détection des changements importants, placement des marqueurs, gestion des trous de données sans interpolation.

### 18.3 Autres tests

- Tests de contrat : réponses X et fournisseurs enregistrées et anonymisées validées par les schémas.
- Tests d'intégration avec Postgres et Redis en conteneurs.
- Tests de sécurité : échappement des contenus X hostiles (HTML, caractères bidirectionnels, homoglyphes), absence de secrets dans les logs, absence de code de signature, aucun appel réseau en mode démo.
- Tests de bout en bout (Playwright) sur le scénario démo : Veille X → publication d'une personne suivie → conversation partielle → réponse avec adresse → fiche token → graphique avec marqueurs → section risques → création d'alerte → page « Sources et API » affichant une réponse 429 simulée.

### 18.4 Commandes

Fournis les commandes exactes : installation, migrations, lancement démo, lancement réel, tests unitaires, intégration, e2e, couverture, linting, vérification des types.

---

## 19. LIVRABLES

1. Rapport d'audit de la Phase 0.
2. Plan de modification validé.
3. Migrations de base de données réversibles.
4. Code créé et modifié, fichier par fichier, en entier.
5. Instructions d'installation, de migration et de lancement (démo et réel), y compris la mise à niveau depuis la V1.
6. `.env.example` mis à jour et documentation des variables.
7. Tests et commandes.
8. `PROVIDERS.md` mis à jour : API X (points de terminaison utilisés, capacités requises par fonctionnalité, quotas et coûts « à vérifier »), fournisseurs de graphiques, autres fournisseurs.
9. `LIMITATIONS.md` mis à jour, notamment les limites d'accès à X (fenêtre temporelle, couverture des conversations, coûts, absence de garantie d'exhaustivité, délais de collecte).
10. **Matrice des fonctionnalités** : tableau « fonctionnalité / réelle / simulée en démo / dépendante d'un niveau d'accès X / indisponible », avec la condition d'activation de chacune.
11. `SECURITY.md`, `DECISIONS.md`, `RUNBOOK.md` (déconnexion du flux, quota épuisé, plafond atteint, rotation de clé) mis à jour.
12. Checklist avant usage réel : vérification des conditions et tarifs de X, configuration des plafonds, test de connexion, test sur quelques comptes et tokens connus, comparaison avec X et les explorateurs officiels, revue de sécurité, validation juridique.

---

## 20. CRITÈRES D'ACCEPTATION

- [ ] Tous les tests existants et nouveaux passent.
- [ ] L'application démarre et fonctionne entièrement en mode démo sans aucune clé.
- [ ] Sans clé X en mode réel, la section « Veille X » affiche « Accès X non configuré » sans erreur.
- [ ] Le libellé « en direct » n'apparaît qu'en mode flux réellement actif ; sinon la fréquence est affichée.
- [ ] Chaque publication affiche l'heure de publication, l'heure de collecte et un bouton « Ouvrir sur X ».
- [ ] Les conversations incomplètes affichent leur taux de couverture et le bandeau « partielle ».
- [ ] Une personne ne peut pas être ajoutée deux fois (même `x_user_id`).
- [ ] Le bouton « Ouvrir le graphique » utilise la chaîne et l'adresse, jamais le symbole.
- [ ] Aucune donnée de graphique n'est inventée ; les données manquantes sont signalées.
- [ ] Le plafond de budget X stoppe les collectes au seuil configuré (test automatisé).
- [ ] Les réponses 429 sont gérées sans boucle infinie (test automatisé).
- [ ] Aucune mention d'un token n'est présentée comme un soutien.
- [ ] Aucun vocabulaire promotionnel ni aucune prédiction dans l'interface (test sur liste de termes interdits).
- [ ] Avertissement financier présent en pied de page et sur chaque fiche token.
- [ ] Aucun appel réseau en mode démo, aucun code de signature, aucun secret dans les logs (tests automatisés).

---

## 21. CE QUE TU NE DOIS JAMAIS FAIRE

- Promettre un accès complet ou instantané à toutes les publications, conversations ou commentateurs de X.
- Scraper X, contourner ses limites ou ses conditions, multiplier les comptes ou les clés pour augmenter les quotas.
- Déduire l'identité d'un compte à partir d'un nom.
- Présenter une mention comme un soutien, une recommandation ou une preuve de légitimité.
- Profiler des commentateurs ordinaires.
- Relier un token à un événement sur la seule base de son nom ou de son symbole.
- Construire un lien de graphique à partir du symbole.
- Inventer des données de prix, des métriques, des quotas, des tarifs ou des points de terminaison. Si tu n'es pas certain qu'un point de terminaison ou un paramètre existe sous la forme décrite, dis-le et isole-le derrière une interface configurable.
- Prédire un prix, un succès ou une rentabilité ; garantir l'absence de rug pull ; qualifier un token de « sûr » ou « solide ».
- Demander une clé privée, une phrase de récupération ou une connexion de portefeuille ; exécuter une transaction.
- Réécrire l'application entière sans nécessité démontrée.

---

## 22. POUR COMMENCER

Commence **uniquement par la Phase 0** (section 1). Si le code du projet ne t'a pas été fourni dans ce message, demande-le-moi d'abord (archive ZIP ou arborescence + fichiers clés : configuration, schéma de base de données, connecteurs, client HTTP, routes de l'interface). Présente ensuite ton audit, ton analyse d'écart, ton plan et tes questions ouvertes avec leurs décisions par défaut, puis attends ma validation.
