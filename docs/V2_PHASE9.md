# V2 — phase 9 : analyse des risques du token

La fiche chaîne/adresse présente désormais **17 contrôles distincts**, leurs cinq statuts, les observations, sources, heures locales et UTC, dates de récupération, couverture et limites. Les instantanés V1 restent conservés dans une section historique séparée. Les messages « Activité sociale et légitimité » et l’avertissement exigé par la spécification sont affichés intégralement.

Le parcours utilisateur livré reste une **démonstration hors ligne**. Aucune blockchain, API de risque ou API X n’a été interrogée pendant la validation ; aucune dépense ni transaction crypto. Le raccordement au serveur authentifié reste en phase 12 et la publication du nouvel installateur Windows en phase finale. Le téléchargement public 0.1.0 ne contient pas ces nouveautés.

## Utilisation

Ouvrir le graphique d’un token, puis descendre à **Analyse des risques du token**. Le scénario local montre des signaux, un contrôle sans signal, un échec, des données insuffisantes et les contrôles non applicables à la chaîne. Ouvrir « Preuve et limites » pour chaque source. Le sélecteur permet de reproduire données manquantes, service en échec, observations anciennes et sources contradictoires. L’exclusion de l’indexeur masque les preuves de risque, y compris les instantanés historiques V1. Le curseur temporel ne dévoile pas les preuves acquises après l’instant simulé. Aucune couleur, note globale ou activité sociale ne certifie la légitimité.

## Contrôles et règles

| Contrôle | Portée et décision |
|---|---|
| Concentration | Top 1/10/20 calculés en unités brutes, dénominateur = offre totale brute à la date du relevé. Pools, destruction et verrouillages exclus uniquement avec rôle vérifié. Signal : top 1 ≥ 10 % ou top 10 ≥ 50 %. Inventaire partiel : proportions observées minimales, aucune conclusion d’absence ; rôles inconnus : résultat insuffisant. Un inventaire annoncé complet doit aussi couvrir toute l’offre. |
| Mouvements | Signal par transfert ≥ 1 % de l’offre brute, ou sortie d’un créateur identifié. Adresse, quantité, direction, transaction et attribution du créateur conservées. Pas de déduction de vente, d’identité civile ou de fraude. Sans couverture complète de la fenêtre, pas d’absence affirmée. |
| Liquidité | Baisse ≥ 20 % entre deux observations comparables du même pool et fournisseur. Aucun arrondi pour décider du seuil. Zéro initial ou valeur absente : insuffisant. Aucune cause de variation déduite. L’hôte doit fournir une paire datée et comparable. |
| LP | Déverrouillé ou verrouillage expiré : signal. Verrouillé sans échéance, positions non couvertes, état inconnu : insuffisant. Une preuve cesse d’être utilisable à son échéance, même avant cinq minutes. Brûlé/verrouillé exige une preuve couvrant toutes les positions concernées ; les positions concentrées ne sont pas déduites d’un LP ERC-20. |
| EVM | Propriétaire classique, création supplémentaire, liste noire, pause, frais modifiables, proxy et code non vérifié. Un proxy détecté ne prouve pas qu’il est modifiable ; une absence de propriétaire classique ne couvre pas les rôles indirects. |
| Solana | Autorités de création et de gel, extensions Token-2022, autorité de mise à jour Metaplex. Une autorité `null` doit être explicite. Programme mint vérifié, compte initialisé et type mint exigés. Programme inconnu ou compte incomplet rejeté. Extensions non décodées ≠ liste vide. Présence d’une extension ≠ malveillance. |
| Ventes / honeypot | Deux contrôles distincts. Indicateurs d’un tiers identifié ou données manquantes ; aucune simulation locale ou vente réelle prétendue. Un échec de contrôle ne prouve pas un honeypot. |

Les seuils sont des règles heuristiques locales versionnées, pas des seuils réglementaires ou une estimation de perte. Calculs de quantités et pourcentages avec BigInt, sans conversion financière en Number ; proportions affichées tronquées au maximum à 36 décimales. Inventaires et fenêtres bornés, aucune recherche globale automatique.

## Statuts et provenance

- **signal_detected** : au moins une observation positive récente ; un signal explicite peut être conservé même dans un inventaire partiel.
- **no_signal_detected** : observations explicites négatives, récentes, sans contradiction et complètes pour ce contrôle seulement.
- **check_failed** : observation explicite d’échec, en l’absence de signal positif récent.
- **not_applicable** : exclusivement déterminé par la famille EVM/Solana ; jamais utilisé pour masquer des données absentes.
- **insufficient_data** : absence, couverture partielle, valeur inconnue, contradiction ou preuve périmée.

Une observation est valable cinq minutes au maximum, ou jusqu’à son échéance explicite si elle arrive avant. Ce TTL local n’atteste pas de la fraîcheur de la blockchain sous-jacente. Les dernières observations de chaque source sont conservées ; signal positif et négatif récents contradictoires donnent « données insuffisantes », avec les deux preuves. Aucun moyennage ni sélection de la source la plus favorable. Les preuves anciennes restent lisibles avec leur statut dégradé ; les observations/récupérations futures ne sont pas exposées.

## Adaptateurs en lecture seule

`GoPlusRiskProvider` propose uniquement `GET https://api.gopluslabs.io/api/v1/token_security/{chain_id}?contract_addresses={adresse}` pour Ethereum, Base, BSC et Arbitrum. Transport HTTPS existant : hôte exact, DNS public épinglé, redirection interdite, délai 10 s, corps 2 Mo. Construction et lecture du cache : zéro requête. Activation explicite de l’hôte et confirmation de rafraîchissement nécessaires. Contrôle PostgreSQL partagé `goplus-risk-v1` : 20 tentatives/minute au maximum ; 429 avec attente partagée 1–3 600 s, repli 60 s, aucun retry automatique. Ce plafond local ne garantit ni le quota fournisseur ni l’accès anonyme futur.

Les champs GoPlus ne sont interprétés que pour les chaînes littérales `"0"` et `"1"` ; vide, booléen, nombre ou champ absent restent inconnus. Les contrôles de permissions négatifs exigent un code ouvert sans proxy ; un résultat de vente/honeypot négatif exige la présence en DEX. Un résultat positif explicite reste visible. Adresse de résultat et adresse demandée doivent correspondre. Propriétaire nul explicite et propriétaire absent sont distincts. La date GoPlus représente la réception du rapport ; bloc/date de son analyse sous-jacente restent inconnus.

Références : [documentation GoPlus](https://docs.gopluslabs.io/reference/tokensecurityusingget_1), [SDK officiel — endpoint GET](https://github.com/GoPlusSecurity/goplus-sdk-python/blob/ea1a80e33f1804c59632d18cee12102ffa367671/swagger_client/api/token_controller_v_1_api.py), [modèle et descriptions des champs](https://github.com/GoPlusSecurity/goplus-sdk-python/blob/ea1a80e33f1804c59632d18cee12102ffa367671/swagger_client/models/response_wrapper_token_security_result.py). La documentation web est bloquée ici par HTTP CONNECT 403. Le SDK officiel a été consulté à ce commit, sans être exécuté, copié ni ajouté aux dépendances. Les contrats sont vérifiés sur fixtures ; aucun essai live. Droits, disponibilité, CGU, couverture et fraîcheur doivent être diagnostiqués avant activation opérationnelle.

`solanaMintBatch` et `solanaMetadataObservation` décodent des lectures déjà acquises et rattachées au mint par un hôte de confiance. Ils vérifient programmes SPL classique, Token-2022 et Metaplex, types et champs attendus. Ils **n’envoient aucun RPC**. L’autorité Metaplex ne couvre pas les métadonnées d’autres programmes. Sans lecteur authentifié et décodage approprié : données insuffisantes. Les adaptateurs de détenteurs, mouvements, liquidité et LP acceptent également des relevés normalisés dont l’hôte doit établir la provenance, la portée et le rattachement au bon token/pool. Aucun scanner historique de blockchain n’est livré.

`createRiskRuntime(pool, authenticatedOwnerId, origin, enabled=false)` expose lecture locale, ingestion de preuves publiques par l’opérateur de confiance et rafraîchissement GoPlus explicite. `createXWorker` expose `risks`, avec un quatrième argument d’activation indépendant du marché. Aucun endpoint HTTP public ni payload renderer d’ingestion. Les erreurs réseau sont renvoyées avec un code expurgé ; aucun corps fournisseur, secret ou note privée n’est persisté. Un échec réseau ne supprime pas l’historique, qui reste soumis à sa date de validité.

## Persistance et compatibilité

Réutilisation de la table **risk_findings existante depuis 0001** : pas de migration, pas de changement du snapshot ORM ni des migrations livrées. Le schéma reste à 66 tables applicatives et dix versions. Le JSON conserve l’observation complète, la version du vérificateur inclut l’empreinte SHA-256 de la source. Les acquisitions sont append-only ; répétition identique idempotente, modification d’une acquisition à même clé refusée. Token, chaîne et origine sont vérifiés avant stockage ; origines DEMO/REAL et URL fictives restent séparées. Au-delà de 100 contrôles/sources distincts, lecture refusée explicitement plutôt que tronquée silencieusement. Les preuves sont publiques sur la chaîne ; les notes, publications et données privées n’entrent pas dans ce dépôt.

Le retour au schéma V1 conserve la table et ses preuves. Aucun effacement ou migration de base utilisateur n’a été effectué. Aucun nouvel IPC, portefeuille, signature, SDK crypto, envoi de transaction ou dépendance npm.

## Fichiers et validation

Créés : `packages/risks/{model,adapters,goplus,demo-data}.ts`, `packages/db/risk-repository.ts`, `apps/api/risk-runtime.ts`, `apps/web/src/RiskPanel.tsx`, tests unitaires/contrats/intégration des risques et ce document.

Modifiés : fiche graphique et CSS (contrôles/lecture mobile, historique V1 filtré), composition du worker (service privé désactivé), configurations TypeScript/format/couverture (nouveau module), suites navigateur/Electron (nouveau parcours), README et documents sécurité/fournisseurs/modèle/décisions/limites. Aucun fichier supprimé.

Validation locale réussie :

- `npm test -- --coverage` : **227 tests unitaires/contrats**, dont 31 nouveaux ; seuils globaux de couverture ≥ 80 % respectés (lignes 95,31 %, branches 90,98 %).
- `npm run test:db:v2` : **87 tests PostgreSQL**, dont sept nouveaux ; rôle applicatif sans superuser/BYPASSRLS, idempotence, refus de modification, conflits, instant historique, dépassement de borne et conservation après retour V1. Couverture de base ≥ 80 % respectée.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` : **neuf parcours navigateur**, dont un nouveau sur les risques ; écran 390 px, preuves, exclusions et zéro requête externe. Un timeout transitoire sur le chargement initial de la page Préférences a été observé lors d’un passage intermédiaire ; suite complète réussie après stabilisation, sans hausse de timeout ni suppression de test.
- `npm run build`, `npm run format:check`, `git diff --check` : réussis.
- `npm run test:desktop` sous Xvfb : parcours Electron réussi, avec risque contradictoire/échec, avertissements et protections réseau/IPC existantes.
- `npm audit --omit=dev` : zéro vulnérabilité signalée.

Validations GitHub réussies sur le commit **c8d9e10aa8c9d5fb1395395a193d56ab1266b082** :

- [Linux — contrats, migrations, PostgreSQL, Redis, diagnostics sans appel X et audit](https://github.com/wnathan469-debug/meme/actions/runs/39159935389).
- [Windows — compilation native, tests, installateur NSIS et ZIP vérifié après extraction](https://github.com/wnathan469-debug/meme/actions/runs/39159935477).

Soit **321 tests TypeScript distincts** avec les sept tests Redis, plus les neuf parcours navigateur, le parcours Electron et les contrôles SQL V1. Le ZIP Windows est conservé dans l’artefact CI pendant 14 jours ; cette validation de fabrication ne remplace pas un essai d’installation sur le PC de l’utilisateur. Le travail de publication préserve les fichiers immuables de la release publique 0.1.0 : aucun lien de cette ancienne version ne représente la phase 9.

Prochaine phase : **10 — alertes et fréquence**, après validation utilisateur.
