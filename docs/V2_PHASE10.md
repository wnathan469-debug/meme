# V2 — phase 10 : alertes, fréquence et historique privé

Cette phase ajoute un moteur de décisions explicables, des notifications **dans l’application**, des résumés et un historique durable. Les règles d’attention V1, les trois alertes pédagogiques et les brouillons d’événement de phase 6 restent distincts et conservés.

L’interface livrée est **une démonstration locale, sans réseau**. Aucun courriel, webhook ou bot sortant ; ces canaux restent optionnels et non implémentés. Aucun appel X, fournisseur de marché ou blockchain, aucune dépense et aucune transaction crypto. Le branchement des vues au serveur authentifié et aux collecteurs reste en phase 12 ; l’installateur public 0.1.0 reste inchangé jusqu’à la livraison finale V2.

## Parcours dans l’application

Dans **Alertes → Centre d’alertes V2**, trois règles fictives initiales concernent Nébula, la hausse des mentions et un changement de risque. L’horloge des alertes est indépendante du curseur des graphiques, affichée explicitement en heure de Toronto et UTC. Les boutons font avancer les observations locales de cinq minutes, une heure ou un jour. Aucune surveillance ou notification système en arrière-plan n’est annoncée.

Le formulaire crée et modifie les règles : nom, type, personne suivie, termes, seuil/réarmement, association minimale, qualité minimale, âge maximal, délai de récupération, regroupement immédiat, plafond horaire, livraison immédiate/périodique/quotidienne, fuseau et heures silencieuses. Les termes sont combinés par **ou** : mots/phrases littéraux, `#hashtag`, `$cashtag`, `chaîne:adresse`. Ils ne sont pas exécutés comme expressions régulières. Une adresse est comparée selon sa chaîne, jamais déduite d’un symbole.

Les notifications regroupées donnent accès aux raisons, sources et liens des observations. L’historique affiche observation/récupération/évaluation, dates locale et UTC, qualité, état, échéance et raison d’une suppression. Les alertes liées aux tokens rappellent l’avertissement financier et ouvrent directement la fiche et le graphique par chaîne/adresse. Les publications fictives renvoient à la conversation locale ; les publications REAL utilisent une URL X construite à partir de leur ID validé. Aucune URL de transaction ou commande d’achat n’est générée.

**Marquer comme lue** et **Signaler un faux positif** conservent la preuve. Un faux positif encore en attente n’est pas livré. Un faux positif déjà livré ne libère pas le quota horaire. Les décisions supprimées sont consultables avec leur raison. La pause d’une règle et celle d’une personne sont vérifiées avant admission et avant livraison. Le centre relit le statut local des personnes ; le serveur relit leur statut et leur ID stable sous verrou partagé.

Réglages, état du moteur, notifications et retours sont conservés dans le stockage local du profil navigateur/Electron, sous une nouvelle clé versionnée DEMO, séparée des préférences V1 et des personnes. Un stockage illisible est préservé et les modifications désactivées. Aucun nouvel IPC ni migration des fichiers de préférences. La démonstration est limitée à trois jours, 30 règles et deux millions de caractères JSON pour ce profil ; aucun effacement automatique de l’historique.

## Déclenchements

| Type | Données et condition |
|---|---|
| Publication d’une personne suivie | UUID privé de la personne et ID stable de l’auteur concordants, compte validé et actif ; termes optionnels. Personne en pause, supprimée ou non validée : suspension. |
| Mot-clé / hashtag sur X | Correspondance littérale dans le texte, les hashtags, cashtags ou adresses identifiées d’une publication collectée. Pas de regex ou d’inférence de soutien. |
| Hausse des mentions | Nombre courant / moyenne d’au moins trois fenêtres de référence comparables et entièrement couvertes. 200 % = deux fois la moyenne. Ligne de base nulle/manquante ou couverture incomplète : pas de signal inventé. |
| Événement associé à un sujet | Termes du sujet présents dans les données interprétées de l’événement ; lien direct à celui-ci. |
| Nouveau token | Association au moins égale au minimum configuré (faible/plausible/confirmée). Donnée insuffisante : jamais acceptée. Une association ne légitime pas le token. |
| Liquidité | Variation absolue ≥ seuil, sur deux observations comparables du même pool et fournisseur. Zéro initial ou données manquantes : pas de pourcentage inventé. |
| Activité de transactions | Variation absolue des compteurs de fenêtres comparables, avec couverture complète exigée ; aucune assimilation d’un extrait de transactions récentes à un compteur exhaustif. |
| Risque | Changement d’un statut de contrôle ; sans état antérieur, seul un nouveau signal positif déclenche. Échec, données insuffisantes ou retrait d’un signal restent des changements documentés, pas une preuve de fraude ou de sécurité. |
| Quota | Consommation / limite du même compteur ≥ seuil ; limite inconnue/nulle : pas de signal inventé. |
| Budget | Consommation ≥ plafond, seuil fixé à 100 % ; la fréquence d’alerte ne modifie pas les plafonds de dépense. |
| Déconnexion | État explicite déconnecté ; réarmement après rétablissement observé. |
| Erreur fournisseur | État explicite en erreur ; pas de corps d’erreur brut, secret ou URL de requête persistés. |

Les comparaisons de quantités et de pourcentages utilisent les décimales exactes/BigInt existantes. Les nombres de mentions, transactions et unités de quota/budget doivent être entiers. Une variation affichée arrondie au seuil ne suffit pas si le rapport exact reste inférieur.

## Fréquence et anti-répétition

- Empreinte déterministe sans collision de concaténation : tuple JSON version/origine/règle/type/sujet/ID de l’observation. Répéter une observation, y compris après redémarrage ou dans deux workers concurrents, ne crée pas une deuxième livraison. Une répétition renvoie l’historique existant ; elle n’ajoute pas une fausse nouvelle alerte supprimée à chaque retry.
- Délai de récupération par règle et sujet. Les hausses et états techniques restent désarmés jusqu’à une observation sous le seuil de réarmement/rétablissement. Les observations insuffisantes, anciennes, futures ou reçues dans le désordre ne réarment pas le moteur. Un lot est ordonné par acquisition et ID stable.
- Plafond sur une fenêtre **glissante d’une heure**, par règle, en nombre d’observations acceptées et livrées, pas seulement en nombre de cartes regroupées. Réévaluation avant livraison : un résumé très retardé ne contourne pas le plafond. Les éléments excédentaires sont supprimés avec raison, pas reportés silencieusement.
- Regroupement immédiat et résumés périodiques : tranches fixes UTC avec échéance strictement postérieure à l’admission. Le mode immédiat sans regroupement livre dès l’évaluation. Chaque observation conserve sa date et sa preuve.
- Résumé quotidien : heure locale dans un fuseau IANA. Heure absente au printemps : première minute locale valide ultérieure ; heure répétée à l’automne : une seule première occurrence par date locale. Aucun ajout automatique de 86 400 secondes pour calculer une journée civile.
- Heures silencieuses locales, y compris à cheval sur minuit. Début égal à fin = silence toute la journée. Admission/livraison pendant le silence : suppression documentée, sans envoi groupé inattendu à la sortie du silence.
- L’âge maximal s’applique à l’admission de l’observation ; une attente de résumé prévue n’est pas traitée comme une collecte périmée. Les éléments en attente conservent leur échéance initiale quand le mode/intervalle est modifié, et restent soumis à la pause, à la qualité minimale et au plafond en vigueur lors de la livraison.
- Modifier une règle ne rejoue pas les observations déjà décidées. Le type et la personne cible sont immuables sur le serveur : créer une autre règle pour les changer. Un faux positif est un retour explicite, sans apprentissage automatique ou modification cachée des seuils.

Les suppressions distinguent règle/personne en pause, silence, qualité, condition non remplie/données absentes, futur incohérent, ancienneté, observation antérieure au dernier état, hystérésis, cooldown et plafond horaire. Aucun état inconnu n’est remplacé par zéro.

## Service privé et persistance

`PgAlertRepository(pool, authenticatedOwnerId, origin)` expose `save`, `list`, `read`, `process` et `feedback`. `createXWorker` le compose sous `alerts`. Construction et lecture n’émettent aucune requête fournisseur et ne démarrent aucun minuteur. L’hôte de confiance fournit des observations normalisées issues des collectes autorisées, avec ID stable, origine, sujet, qualité, couverture et dates. Il doit établir la comparabilité des fenêtres/pools et la disponibilité des preuves ; ce dépôt n’invente pas un scanner ou une collecte complète.

Pas de route HTTP publique ni d’ID propriétaire accepté librement depuis le renderer. Le raccordement de ces appels aux collecteurs, la planification opérationnelle et les vues serveur authentifiées sont attendus en phase 12. Les callbacks ne lisent pas les notes privées des personnes. Les alertes techniques refusent un corps d’erreur textuel et les URL de provenance avec query string. Les corps fournisseur ne doivent jamais être copiés dans des noms/IDs ; l’hôte ne fournit que des diagnostics nettoyés.

Migration additive **0011_alert_runtime** : **67 tables applicatives**, plus le registre ; onze versions. Versions 0001–0010 immuables. Une table privée `alert_runtime_states` conserve état, échéances, hystérésis, décisions et notifications par règle/propriétaire/origine. Clé étrangère composite vers la règle et son propriétaire, origine immuable, bornes JSON, RLS forcée. L’historique utilise `alerts` et `notification_deliveries` déjà présents. La politique RLS des règles de phase 6 est conservée ; celles des historiques, livraisons et anciens états de sujet sont ajoutées. Nouveau type SQL `transaction_activity`, anciens types/champs conservés.

Évaluation, état, décisions et livraisons in-app sont écrits dans une seule transaction, sous verrou de la règle. Les clés uniques assurent l’idempotence. La construction d’une alerte de token confronte l’UUID du sujet à la chaîne/adresse enregistrée ; origines DEMO/REAL et propriétaires restent séparés, même lorsque les méthodes sont appelées via une connexion administrateur. Une connexion applicative sans superuser/BYPASSRLS est requise en exploitation.

Bornes serveur : 100 observations par appel, 1 000 décisions et notifications par règle, 200 sujets, 100 règles par liste ; les dépassements sont explicites et la transaction précédente conservée. La rétention/archivage et le traitement de nouvelles observations à saturation doivent être organisés par l’hôte ; aucun historique n’est supprimé pour faire passer un test. Une notification `sent` sur le canal `in_app` signifie enregistrée dans la boîte de l’application, pas envoyée à Windows ou à un service externe.

Le rollback refuse toute règle phase 10 ou état d’exécution qui serait perdu. Le retour au schéma antérieur reste possible sur un schéma compatible sans données phase 10, avec restauration des contraintes/politiques précédentes. ORM et snapshot sont régénérés depuis PostgreSQL, jamais par `drizzle push`. Aucune base utilisateur n’a été migrée.

## Fichiers et vérifications

Créés : `packages/alerts/{model,engine,demo-data}.ts`, `packages/db/alert-repository.ts`, migration `0011_alert_runtime.{up,down}.sql`, `apps/web/src/AlertsV2.tsx`, tests unitaires et PostgreSQL des alertes, ce document.

Modifiés : composition du worker et version minimale du runtime, intégration Alertes/CSS, manifeste SQL et ORM/snapshot, configurations TypeScript/format/couverture, attentes de migration dans les tests existants, parcours navigateur/Electron, README et documents modèle/décisions/sécurité/limites. Aucun fichier supprimé ; aucune dépendance npm ajoutée.

Validation locale :

- `npm test -- --coverage` : **263 tests unitaires/contrats**, dont 36 nouveaux sur les alertes ; couverture globale lignes 95,70 %, branches 91,50 %.
- `npm run test:db:v2` : **94 tests PostgreSQL**, dont sept nouveaux ; concurrence, reprise, isolation par propriétaire et origine, RLS avec rôle non-superuser/non-BYPASSRLS, pause de personne, résumés et feedback, rollback conservateur. Couverture globale ≥ 80 % dans les quatre dimensions, ORM comparé au snapshot après génération.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --trace retain-on-failure` : **11 parcours réussis**, dont deux nouveaux ; résumé, plafond, preuve, faux positif, lecture/persistance, pause, stockage corrompu préservé et écran 390 px. Zéro requête externe dans le parcours de nouvelles alertes.
- Un timeout de chargement initial de la page Préférences V1 a été observé dans un passage intermédiaire ; le test passe isolément avec trace puis dans la suite complète. Aucun test supprimé, aucune hausse de timeout et aucun retry ajouté.
- `npm run test:desktop` sous Xvfb : notifications Electron conservées après rechargement, lecture et protections réseau/IPC existantes vérifiées.
- `npm run build`, `npm run typecheck`, `npm run format:check` et `git diff --check` réussis ; `npm audit --omit=dev` : zéro vulnérabilité signalée.

Validations GitHub réussies sur le commit **c8e56edabb696d23210bb532319695a6552753df** :

- [Linux — contrats, migration, PostgreSQL, Redis, diagnostics sans appel X et audit](https://github.com/wnathan469-debug/meme/actions/runs/39162472417).
- [Windows — tests, compilation native, installateur NSIS et ZIP vérifié après extraction](https://github.com/wnathan469-debug/meme/actions/runs/39162472427).

Avec les sept tests Redis, **364 tests TypeScript distincts**, plus les onze parcours navigateur, le parcours Electron et les contrôles SQL V1. L’artefact Windows CI est conservé pendant 14 jours ; fabriquer et vérifier ce paquet ne constitue pas un essai d’installation sur le PC utilisateur. La publication conserve les fichiers immuables de la release publique 0.1.0 : ces anciens téléchargements ne contiennent pas les nouveautés de phase 10.

Prochaine phase : **11 — Sources et API**, après validation utilisateur.
