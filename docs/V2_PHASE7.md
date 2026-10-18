# V2 — phase 7 : preuves sociales et liens avec les tokens

La phase 7 ajoute l’extraction d’adresses et de pages de tokens, les publications classées par méthode, une première apparition **observée** et une association sociale explicable. Le moteur V1, ses trois événements, ses cartes de tokens et ses préférences restent conservés.

Aucun appel réel à X, aucun accès à une chaîne, aucune dépense, aucun déploiement et aucune migration de base utilisateur. Les validations utilisent des bases jetables. Aucun ordre de transaction ni portefeuille n’est ajouté. L’installateur public 0.1.0 est inchangé ; la livraison publique V2 attend la phase finale.

## Dans l’application

Une section **Preuves sociales des tokens · DÉMO V2** apparaît dans **Tokens détectés** et dans l’événement enrichi Nébula Mobile. Elle reprend les 60 publications fictives du scénario de phase 6, dont la conversation partielle de phase 5, et présente trois identités fictives distinctes :

- Nébula Étincelle : adresse exacte/page de token dans une publication liée, association plausible, première publication connue à T+12, récupération à T+12,25.
- Nеbula officiel : symbole partagé, revendication officielle et alphabets mêlés ; aucune preuve forte, données insuffisantes. Le caractère cyrillique est intentionnel pour illustrer un risque d’homoglyphie.
- Ancienne Étincelle : adresse reprise dans une publication liée, association plausible, mais création antérieure à l’événement explicitement signalée.

Chaque fiche montre la chaîne, l’adresse complète, les raisons, les contre-indications et les limites. Les publications sont ordonnées **adresse exacte > page de token > cashtag > nom**, avec filtre de méthode, date publiée et heure de récupération. Les URL fictives restent du texte inactif, sans ouverture réseau. Les liens internes relient événement, preuves du token et conversation ; le filtre de token de la conversation est opérationnel.

Les filtres de texte, chaîne et niveau de la page Tokens s’appliquent aussi à cette section. Un lien de conversation identifie le token par son UUID du registre et affiche ensuite sa chaîne/adresse ; la route publique chaîne/adresse et les graphiques sont le périmètre de phase 8. Les cartes V1 restent séparées pour préserver leurs mesures historiques. La démo complètement unifiée reste prévue en phase 13.

Le curseur temporel ne montre que les publications déjà récupérées ; les dates de création futures restent inconnues. Exclure X rend les preuves indisponibles, sans conclure à zéro mention. Exclure la source de chaîne masque les créations et empêche d’en tirer une contre-indication chronologique. Aucun contrat officiel vérifié n’est inventé dans ce scénario : aucun token de la démo n’est confirmé.

Un débordement du tableau V1 sur petit écran a aussi été corrigé : son libellé accessible est maintenant contenu dans la zone défilante du tableau. Le parcours à 390 px vérifie l’absence de débordement de la page, tout en conservant le défilement du tableau.

## Extraction et identité

`packages/social/identity.ts` et `model.ts` sont des fonctions pures, sans fournisseur réseau ni nouvelle dépendance.

- EVM : exactement `0x` + 40 caractères hexadécimaux ; adresse nulle refusée. La casse mixte exige EIP-55, avec **Keccak-256 et son padding Ethereum**, différent de SHA3-256. Les formes entièrement minuscules/majuscules sont admises par la règle EIP-55. L’identité de comparaison est minuscule.
- Le Keccak est borné aux 40 caractères ASCII du checksum, sans API générale de cryptographie. Les huit vecteurs [ERC-55 officiels](https://github.com/ethereum/ercs/blob/master/ERCS/erc-55.md) sont testés, ainsi qu’une casse incorrecte. Le standard a été consulté via son dépôt source officiel.
- Solana : alphabet base58, longueur 32–44 caractères, décodage à exactement 32 octets. Adresse système et plusieurs identifiants de programmes fréquents exclus. Une adresse valide peut encore être un portefeuille, un pool ou un autre compte : **la syntaxe ne prouve pas un mint**. Seuls les tokens déjà présents dans le registre peuvent recevoir une mention résolue.
- Origines séparées : les adresses reconnaissables `0xDEMO…` / `DEMo…` sont autorisées uniquement en DEMO ; elles ne passent jamais la validation REAL. Une vraie adresse est refusée par la validation DEMO.
- Cashtags : extraction ASCII bornée, casse normalisée ; noms : mots normalisés Unicode, casse et ponctuation. Ce sont uniquement des indices faibles, jamais une association suffisante.
- Republications et types inconnus exclus. Les doublons d’éléments et de mentions sont éliminés. L’extraction conserve au maximum 100 éléments par publication et considère au maximum 200 URL candidates.

Une adresse EVM seule n’identifie **aucune chaîne**. Elle reste candidate ambiguë, même si une seule chaîne du registre contient cette adresse. La chaîne vient soit d’une URL de token autorisée portant la même adresse, soit d’un contexte explicitement configuré par l’opérateur pour une règle précise. Plusieurs URL de chaînes différentes rendent l’adresse en texte ambiguë ; chaque URL conserve sa propre identité. Un nom ou un cashtag ne choisit jamais la chaîne. Solana est identifiée par sa syntaxe propre, sans prétendre connaître le type du compte.

### URL autorisées

HTTPS uniquement, sans identifiants, port non standard, fragment ou paramètres non prévus. Chemins exacts :

| Domaine | Chemin accepté | Chaîne |
|---|---|---|
| etherscan.io | `/token/{adresse}` | ethereum |
| basescan.org | `/token/{adresse}` | base |
| bscscan.com | `/token/{adresse}` | bsc |
| arbiscan.io | `/token/{adresse}` | arbitrum |
| solscan.io | `/token/{adresse}` | solana |
| birdeye.so | `/token/{adresse}?chain=solana` | solana |
| demo.memeradar.invalid, DEMO seulement | `/token/{chaîne}/{adresse-fictive}` | chaîne explicite |

Les cinq chaînes prises en charge sont celles du schéma existant. URL d’explorateur `/address/` ou `/account/`, liens de pools DEX Screener, raccourcisseurs, domaines ressemblants, chemins encodés non reconnus et autres fournisseurs restent non résolus. Aucune redirection n’est suivie. Les URL développées déjà fournies dans les entités X peuvent être analysées, sans nouvelle requête.

Le texte des URL est retiré avant la recherche d’adresses en texte brut : une adresse située dans une URL de domaine malveillant ne devient pas une « adresse exacte » en contournant la liste de domaines. Les limites de mots évitent de tronquer une chaîne plus longue en fausse adresse.

## Service privé et persistance

`createXWorker` expose `social`, un `PgSocialRepository` composé pour un propriétaire et une origine. Aucun serveur HTTP public ni connexion de l’interface au serveur n’est ajouté. L’hôte doit authentifier l’utilisateur avant cette composition ; jamais d’ID propriétaire fourni librement par le corps d’une requête.

```ts
await worker.events.rebuild(eventId); // Liens interprétés de phase 6.
await worker.social.rebuild();       // Registre et publications déjà collectés.
const associations = await worker.social.forEvent(eventId);
const detail = await worker.social.read(tokenId, eventId);
// Variante : contexte de chaîne choisi explicitement pour une règle possédée.
await worker.social.rebuild({ ruleId, contextChain: "base" });
```

Le rapprochement reste hors ligne : il ne découvre pas de contrat, ne crée pas de token et ne modifie pas les liens publics `token_event_links`. Il compare les publications disponibles appartenant aux règles du propriétaire avec les identités chaîne/adresse déjà enregistrées. Les noms ou cashtags partagés peuvent créer plusieurs **mentions faibles**, sans promouvoir ces tokens en associations.

`forEvent` expose uniquement les tokens ayant une adresse exacte ou une page de token dans une publication liée à l’événement, puis calcule leur état privé. `read` permet aussi d’inspecter un token connu ne possédant que des indices faibles. La chronologie publique de `events.read` conserve les associations préenregistrées ; les nouvelles associations privées sont disponibles via `social.forEvent`, à composer par l’hôte lors du branchement serveur ultérieur.

`rebuild` est transactionnel et idempotent, verrouillé par propriétaire/origine. Il remplace ses propres mentions de version `social-extraction@1.0.0` et enregistre les candidats non résolus pour inspection opérateur en base. Il est à appeler explicitement après collecte/actualisation ; aucun traitement payant ou job implicite n’est activé. Un contexte de chaîne appliqué à une règle remplace les résultats de ce propriétaire pour les publications concernées : il s’agit de la configuration actuelle, sans historique bitemporel inventé.

Bornes : 10 000 publications par reconstruction, 1 000 tokens du registre par origine, 10 000 lignes de mentions par lecture et 100 tokens associés par `forEvent`. Un dépassement refuse l’opération, sans publier silencieusement un échantillon. Les SQL sont paramétrés ; une pagination à plus grande échelle reste à ajouter lorsque les volumes le justifient.

### Première observation et niveau

`first_social_seen_at` et `first_social_post_id` sont calculés dans le **résultat privé**, parmi les publications disponibles avec preuve forte. La date est celle de la publication la plus ancienne connue, départagée par collecte puis ID ; `first_observed_at` est la première récupération d’une preuve forte. Les dates avec offsets sont comparées par instant réel. Une date manquante reste inconnue et une publication récupérée après l’instant demandé n’apparaît pas.

Les colonnes globales historiques `tokens.first_social_*` ne sont pas remplies à partir d’une collecte privée : cela révélerait à d’autres utilisateurs les résultats de ce propriétaire. Les anciennes mentions ne sont ni effacées ni automatiquement requalifiées ; le nouveau calcul exige la version d’extraction validée.

Règle additive `social-association@1.0.0`, distincte du moteur V1 :

| Éléments disponibles | Niveau |
|---|---|
| Adresse exacte liée à l’événement, compte officiel attesté et publication manuellement vérifiée | Confirmé |
| Adresse exacte ou page de token dans une publication liée, sans preuve officielle vérifiée | Plausible |
| Preuve forte sans lien d’événement établi | Faible |
| Nom/cashtag seuls ou aucune preuve forte | Données insuffisantes |

Les scores stockés des méthodes (0,9 / 0,8 / 0,2) sont des poids heuristiques de rapprochement, pas des probabilités ; ils ne décident pas seuls du niveau. « Confirmé » porte sur l’association documentée, **jamais sur un soutien, la légitimité, la sécurité ou le rendement**.

### Vérification officielle explicite

L’identité d’un compte, un badge, un pseudo, un nombre d’abonnés ou la présence d’une adresse dans une réponse ne suffit pas. Un opérateur authentifié doit vérifier le sens de la publication, sa relation à l’événement et le fait qu’elle publie cette adresse comme contrat de l’entité ; une mise en garde, un démenti, une citation ou un exemple technique ne doit pas être attesté.

```ts
await worker.social.attestOfficialPublication({
  eventId, tokenId, postId,
  purpose: "contract_publication",
  reviewedAt: new Date().toISOString(),
});
// L’ID d’attestation est fourni dans detail.attestations.
await worker.social.revokeOfficialPublication(attestationId);
```

Cette action exige une mention **adresse exacte** résolue, une publication disponible avec date, une liaison privée à la révision actuelle de l’événement et l’auteur stable dans les comptes officiels manuellement attestés de phase 6. Une URL de token seule ou un cashtag est refusé. Les dates futures sont refusées. L’URL de preuve est construite depuis l’ID X stable, jamais saisie comme une URL arbitraire. Le service ne vérifie pas automatiquement le contenu de cette preuve et n’analyse pas son intention par LLM. Cette fonction est réservée à l’hôte/opérateur ; aucun bouton de confirmation réelle n’est livré dans la démo.

La revue est liée à l’empreinte du texte, aux entités, au type et à l’auteur de la publication, ainsi qu’à la révision de la configuration. Modification du contenu, indisponibilité, retrait de l’attestation, identité officielle retirée ou nouvelle révision font cesser la confirmation. La preuve créée plus tard ne confirme pas rétroactivement une lecture ancienne.

### Contre-indications et limites

Création antérieure au signal, absence de preuve forte et revendication officielle sans publication vérifiée sont signalées. Le mélange de caractères latins avec cyrilliques/grecs est un indicateur conservateur d’homoglyphie possible, pas un détecteur complet ni une preuve d’usurpation. Aucune comparaison exhaustive à un registre de marques n’est prétendue. Les comptes X normalisés ne fournissent pas leur date de création : la concentration de comptes récents est explicitement **non évaluée**, sans profilage de commentateurs ni nombre inventé.

## Migration 0009 et isolation

Migration additive `0009_social_tokens` : **62 tables applicatives**, plus le registre de migrations. Les versions 0001–0008 restent inchangées.

- `post_token_mentions` reçoit propriétaire, version et éléments de preuve. Unicité incluant le propriétaire, avec conservation des anciennes lignes globales.
- `social_token_candidates` conserve les candidats par publication/propriétaire et l’empreinte de leur source, sans dupliquer le texte complet.
- `social_contract_attestations` conserve la revue explicite et sa portée événement/token/publication/propriétaire/origine.

RLS forcée sur les trois tables ; contexte utilisateur et origine obligatoires. Les anciennes mentions globales restent lisibles dans leur origine. Les nouveaux éléments privés exigent leur propriétaire, et les dépôts de recherche, personnes, conversations et événements filtrent explicitement ces accès même lors des tests en connexion administrateur. Les changements d’origine sont refusés par les triggers communs.

L’empreinte de texte, les entités, le type et l’auteur sont comparés à la publication actuelle avant d’utiliser une nouvelle mention. Une publication supprimée/indisponible ou modifiée cesse immédiatement de contribuer à la lecture ; la reconstruction nettoie ensuite ses mentions et candidats privés concernés. Les attestations peuvent être conservées comme métadonnées de revue mais ne valent plus comme preuve active. Cela ne constitue pas encore une politique automatique de rétention complète : l’hôte doit programmer les reconstructions/purges conformément à ses paramètres.

Le rollback refuse toute utilisation des nouvelles données, sans suppression utilisateur. Les migrations avant/arrière, l’intégrité V1 et la correspondance ORM/snapshot avec le SQL migré sont testées.

## Vérifications

- Construction TypeScript/Vite et formatage réussis ; aucune dépendance ajoutée.
- **176 tests unitaires/contrats** réussis, dont 15 nouveaux : huit vecteurs ERC-55, checksum invalide, base58/longueur, séparation DEMO/REAL, domaines trompeurs, URL de pool, chaîne ambiguë, cashtags, noms, niveaux, dates/offsets et rejeu fictif.
- **70 tests PostgreSQL V2** réussis, dont sept nouveaux : extraction idempotente, candidats ambigus, association par événement, isolation entre propriétaires dans les lecteurs, preuve officielle explicite/révocation, contenu modifié/indisponible, RLS sans bypass et rollback conservateur.
- **Sept contrôles Redis** réussis ; les tests unitaires partagés ne sont pas comptés deux fois. Total TypeScript distinct : **253**.
- **Sept parcours Chromium** réussis, dont un nouveau parcours des preuves : adresse, méthodes, première observation, faibles indices, liens événement/conversation/token, sources exclues et largeur 390 px sans requête externe.
- Shell Electron Linux : sandbox/IPC, persistance V1/notes/règles, nouvelles preuves et navigation, blocage réseau réussis.
- Référence SQL V1 : 51 contrôles avant/après rollback, échec atomique et concurrence réussis.
- Audit de production : zéro vulnérabilité ; diagnostics sans appel fournisseur.

Les quatre seuils de couverture globaux restent à 80 %, dépassés par les suites unitaires et PostgreSQL. Résultats CI Linux et Windows à consigner après exécution. Une compilation native et un ZIP vérifié ne remplacent pas un essai d’installation sur le PC de l’utilisateur.

## Sources livrées et suite

Nouveaux : `packages/social/{identity,model,demo-data}.ts`, `packages/db/{social-repository,social-visibility}.ts`, migration `0009_social_tokens.up/down.sql`, `apps/web/src/SocialProofs.tsx`, tests unitaires et PostgreSQL sociaux, ce document.

Adaptés : composition worker/runtime ; lecteurs de mentions, manifeste et ORM ; scénario événement/conversation ; vues événements/tokens/conversations et styles ; parcours web/Electron ; références de migration et configurations de tests ; README, DATA_MODEL, SECURITY, LIMITATIONS et DECISIONS.

Prochaine étape après validation : **phase 8 — page d’analyse et graphique du token**, route par chaîne/adresse, pools, OHLCV, volumes et marqueurs avec trous visibles. Aucun graphique de prix réel ni source live n’est annoncé par cette phase 7.
