# V2 — phase 5 : conversations et commentateurs

La phase 5 ajoute un service privé de chargement de conversations et une page **Conversations** de démonstration. Elle conserve les parcours V1 et les personnes de la phase 4. Aucun appel réel à X, aucune dépense fournisseur, aucun déploiement et aucune migration d’une base utilisateur n’ont été effectués.

Le paquet Windows public 0.1.0 reste inchangé. La construction native sera vérifiée en CI, mais la diffusion d’une nouvelle V2 installable reste prévue en phase 14.

## Parcours de démonstration

Depuis **Personnes suivies**, ajouter/confirmer `demo_analyste_julie`, puis choisir **Voir la conversation** sur une publication. La navigation **Conversations**, ou `#page=conversations&conversation=DEMO_POST_ROOT`, ouvre le même scénario.

Le chargement demande une confirmation explicite après une estimation **démo : 0 USD, zéro appel réseau**. Annuler ne charge aucune donnée. Le scénario intégré contient une racine, **35 réponses uniques sur environ 120 déclarées** et une citation distincte. Couverture : **29,17 %**, toujours accompagnée du bandeau partiel. L’instantané entièrement fictif est daté du 15 janvier 2026 et ne dépend pas du curseur de la chronologie V1.

Les vues arbre et liste proposent recherche textuelle, ordre chronologique ou interactions disponibles et adresses candidates. L’arbre conserve les parents avant leurs descendants et applique le tri aux branches sœurs ; maillons manquants, cycles et profondeur excessive sont signalés. Les adresses fictives sont signalées comme candidates non vérifiées. Les liens fictifs ne sont pas activés. Les réponses et les citations sont séparées ; le taux de couverture est calculé avant filtrage. Un filtre vide ne devient jamais une preuve d’absence d’autres commentaires.

Les contrôles simulés montrent fenêtre dépassée, 429, budget épuisé, racine indisponible et dénominateur inconnu. Les résultats déjà chargés restent lisibles lors d’un refus simulé. Les statistiques se limitent aux réponses de cette conversation : neuf comptes distincts et un groupe de cinq textes identiques dans ces fixtures. Une coordination est seulement une hypothèse agrégée, non prouvée. L’âge des comptes n’est pas collecté : la proportion de comptes récents reste inconnue.

## Service privé, devis et reprise

`createXWorker` expose désormais `conversations`, composé pour un propriétaire et une origine. Il n’expose pas de serveur HTTP et ne remplace pas l’authentification du futur hôte.

```ts
const quote = await worker.conversations.quote(conversationId, 4, true);
// Présenter le coût maximal et les limites à l’utilisateur avant de continuer.
const snapshot = await worker.conversations.execute(quote.id, quote.maxCostMicros);
const localSnapshot = await worker.conversations.local(conversationId);
```

`quote` ne fait aucun appel de contenu au fournisseur ni aucune écriture de conversation. Il consulte les capacités déjà configurées/observées, valide l’identifiant et les opérateurs autorisés, puis estime les requêtes, publications et auteurs facturables en incluant les reprises et la racine lorsqu’elle est accessible. Une racine et dix pages au maximum par mode ; citations exclues du devis si leur capacité est indisponible. Sans tarification/budget REAL : refus avant appel payant, pas d’estimation à zéro. Les tarifs restent configurables et doivent être vérifiés par l’opérateur.

La confirmation est requise pour chaque chargement, y compris sous un éventuel seuil de confort : choix plus conservateur que la confirmation des seules grandes conversations. Ticket propriétaire/processus, capacité bornée avant les opérations asynchrones, expiration cinq minutes et usage unique. Mauvais montant, tarif modifié, ticket d’un autre service ou expiré : refus avant collecte. Ces tickets doivent être routés vers leur processus ou persistés avant une future exposition multi-processus.

`execute` prend un verrou partagé par propriétaire/conversation pour éviter deux chargements concurrents facturables de la même vue. Les modes lookup, conversation et quotes gardent leurs baux et curseurs séparés. Les pages sont bornées ; un devis suivant reprend la pagination non terminée. Les réponses terminées utilisent leur identifiant de reprise ; les citations ne disposent pas de `since_id` et peuvent nécessiter de relire des pages déjà observées. Les doublons ne gonflent pas les comptes. Aucune boucle implicite pour aller chercher une conversation prétendument complète.

La racine est recherchée séparément quand la capacité le permet, afin d’obtenir son compteur public avec sa date d’observation. Si cette capacité est indisponible ou refuse l’accès, la recherche de conversation autorisée reste utilisable. Une racine fournie par la recherche est aussi une observation valide. Une racine absente ne devient ni un post inventé ni un dénominateur déduit du nombre d’éléments de la page. Une ancienne observation ne remplace pas un compteur plus récent. Un ancien compteur connu reste daté, sans être présenté comme un compteur actuel.

Toutes les requêtes de ce service, y compris le lookup racine, utilisent le budget **conversations**. Les champs d’auteur demandés sont limités à ID, pseudo et nom affiché. Les champs additionnels éventuellement renvoyés sont écartés et les commentateurs ne rejoignent pas le cache de profils du client. Les contrôles existants de coût, quota, 401/403/429 et coupe-circuit restent actifs ; aucun scraping, contournement ou appel d’enquête sur les commentateurs.

Une erreur de budget, de registre, de réseau ou de quota interrompt le chargement ; les pages déjà validées restent consultables, l’erreur et les exécutions sont visibles. Les citations ne sont pas tentées après cet arrêt. Les références invalides ne déclenchent aucune récupération supplémentaire automatique. Chaque action supplémentaire exige un nouveau devis.

## Couverture et confidentialité

Le compteur récupéré compte les réponses uniques disponibles reliées à la règle du propriétaire, pas les résultats d’un autre utilisateur. Racine, citations et republications sont exclues. La métrique déclarée vient uniquement d’une racine effectivement observée. Division et arrondi utilisent des entiers exacts ; dénominateur absent ou nul : pourcentage inconnu. Compteur incohérent, avec davantage de réponses récupérées que déclarées : incohérence signalée et pourcentage inconnu. Même un pourcentage observé de 100 % ne constitue pas une garantie d’exhaustivité.

Quand une fenêtre est connue et que la racine est plus ancienne, le statut indique `outside_api_window`. Des réponses récentes peuvent encore être accessibles : la recherche autorisée reste possible. Aucune fenêtre commerciale par défaut n’est inventée. Une capacité ou un quota inconnu reste explicitement inconnu.

Le détail privé lit au plus 1 000 publications disponibles et 100 exécutions. Le nombre de réponses récupérées est calculé sur tous les liens disponibles du propriétaire, indépendamment de cette limite d’affichage. `truncated` et `summaryIsSample` signalent le cas où le résumé ne porte que sur l’échantillon affiché. Les auteurs absents restent inconnus ; aucun pseudo n’est déduit d’un nom affiché.

Pour un commentateur ordinaire, le stockage de conversation ne contient que son ID fournisseur, pseudo, nom affiché et date d’observation, plus les métadonnées techniques d’origine/propriétaire. Il ne crée aucune ligne dans `tracked_people`, `x_users` ou l’historique des pseudos global. Pas de nombre d’abonnés, âge, note privée, fiche de profil ou agrégation de son activité hors conversation. Une personne explicitement suivie peut être reconnue par son ID déjà enregistré, sans envoyer sa catégorie ou ses notes au fournisseur. Le résumé ne renvoie aucun classement individuel de commentateurs.

Le modèle de filtres sait sélectionner les associations de tokens/événements déjà enregistrées et les personnes suivies. Les cartes prévoient les liens correspondants lorsque ces associations existent. Les fixtures de cette phase n’inventent aucun lien : les sélecteurs token/événement y sont désactivés. La création automatique des preuves et leur branchement complet restent les phases 6–7 et 12. Les liens REAL de publication utilisent le domaine fixe X ; le renderer démo conserve son blocage des sorties réseau.

## Migration 0007 et sécurité

Migration additive `0007_conversation_views`, sans modification de 0001–0006 :

- `conversation_views` : état, règle, compteur déclaré et fenêtre propres à chaque propriétaire/origine. Le compteur partagé historique de `conversations` n’est pas utilisé pour inventer une couverture privée.
- `conversation_authors` : identités minimales nécessaires à l’affichage, limitées à la vue du propriétaire.

Le schéma compte **57 tables applicatives**, plus le registre des migrations. RLS forcée sur les deux nouvelles tables, contexte local à la transaction et clés étrangères incluant origine/propriétaire. Les règles internes `kind=conversation` sont exclues de la veille et des personnes. Requêtes paramétrées ; textes et noms rendus par React comme texte échappé.

La page, les liens de publications, les identités minimales d’affichage et le curseur se valident dans une même transaction. Une erreur de métadonnées annule l’ensemble de la page, sans perdre la position de reprise. Le hook SQL d’ingestion reste une extension interne de confiance, jamais une entrée HTTP. Retour arrière conservateur refusé si des vues/auteurs existent ; aucun effacement silencieux. Schéma ORM et snapshot régénérés depuis une base jetable migrée, puis comparés en lecture.

Le rôle de production doit être non superuser, sans BYPASSRLS, et le propriétaire doit venir d’une authentification de l’hôte. Aucun endpoint public authentifié n’est annoncé par cette phase. Les sauvegardes et la rétention requièrent les procédures d’exploitation ; aucun job de purge n’est activé. Les notes privées existantes ne sont ni transmises ni copiées dans les métadonnées de conversation.

## Validation locale

- Construction TypeScript/Vite et formatage : réussis.
- **154 tests unitaires/contrats**, dont sept nouveaux tests de conversation : réussis. Modèle de graphe, filtres et couverture contrôlé dans la cible unitaire ; le service/dépôt est contrôlé dans la cible PostgreSQL. Seuils globaux de couverture inchangés à 80 % sur les quatre mesures, tous dépassés.
- **53 tests PostgreSQL V2**, dont onze nouveaux tests de conversation : réussis. 35/120, compteur périmé, reprise, idempotence, origine/propriétaire, RLS sans bypass, métadonnées atomiques, fenêtre, devis exact et prix modifié, 429, budget et refus de downgrade.
- **Sept contrôles Redis** réussis dans la suite de 161 tests ; pas de double comptage des tests unitaires ci-dessus.
- **Cinq parcours navigateur Chromium** réussis : nouveaux parcours depuis une personne vers une conversation, confirmation au clavier, 35/120, arbre/liste, citations, filtres, simulations et largeur de 390 px sans sortie réseau.
- Shell Electron Linux : sandbox, IPC, préférences V1, persistance des notes après redémarrage, deep links, conversation 29,17 %, presse-papiers et refus réseau réussis. Cela ne remplace pas un essai d’installation sur un PC Windows.
- Référence SQL V1 : 51 contrôles avant/après rollback et vérifications de concurrence réussis. Migration V1 → 0007 et comparaison ORM réussies.
- Audit des dépendances de production : **zéro vulnérabilité**. Diagnostics hors ligne sans appel fournisseur.

Les résultats de CI distante Linux/Windows seront consignés après exécution. Aucune fixture n’est présentée comme une vérification d’accès réel à X.

## Fichiers livrés

Nouveaux : `packages/conversations/model.ts`, `service.ts`, `demo-data.ts` ; `packages/connectors/x/demo-conversations.ts` ; `packages/db/conversation-repository.ts` ; migrations `0007_conversation_views.up.sql` / `.down.sql` ; `apps/web/src/Conversations.tsx` ; `tests/unit/conversations.test.ts`, `tests/integration/conversations.test.ts` ; ce document.

Adaptés : `packages/connectors/x/client.ts`, `contracts.ts` ; `packages/db/x-collection-repository.ts`, manifeste, ORM et snapshot ; `apps/api/x-runtime.ts`, `apps/worker/x-worker.ts` ; `apps/web/src/main.tsx`, `People.tsx`, `style.css` ; tests de migrations et parcours web/Electron ; configuration TypeScript, Vitest et script de formatage ; README, DATA_MODEL, SECURITY, LIMITATIONS et DECISIONS. Aucune dépendance ajoutée, aucun fichier utilisateur supprimé.

Prochaine étape après validation : **phase 6 — événements**. Le branchement complet de l’interface au serveur privé et l’installateur V2 restent les jalons ultérieurs du plan approuvé.
