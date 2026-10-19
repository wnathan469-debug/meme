# V2 — phase 13 : démonstration Nébula Mobile étendue

Le parcours V2 partage désormais un catalogue de **63 publications inventées**, quatre tokens fictifs, les mêmes identités de comptes et une horloge persistante. Veille, personnes, conversation, événement, preuves sociales et graphiques consultent les observations disponibles au même point du rejeu. Les scénarios V1 restent présents et distincts, conformément à la décision de conservation de l’audit.

**Aucun appel réseau externe, donnée X réelle, clé API, dépense réelle ou transaction crypto.** Le serveur REAL et le raccordement authentifié restent non livrés, comme indiqué en phase 12. Cette phase ne publie pas encore un nouvel installateur public : la release Windows 0.1.0 est conservée jusqu’à la phase 14.

## Catalogue et fournisseur simulé

`packages/demo/scenario.ts` réunit les fixtures existantes de Nébula, sans dupliquer une même publication reçue par plusieurs parcours. Les identifiants, texte, auteur, publication et première récupération concordent entre les vues. La conversation reste **35 réponses récupérées sur environ 120**, soit 29,17 %, avec citation séparée et maillons manquants. Son lot a été acquis à T+40 : avant ce point, la vue ne révèle ni réponses futures ni dénominateur lu dans une racine encore indisponible.

Les trois profils de parcours sont **@demo_analyste_julie, @demo_fondateur_marc et @demo_trader_k**. Ils sont disponibles dans la simulation de validation et doivent toujours être ajoutés/confirmés explicitement. Aucun compte n’est ajouté automatiquement, aucune note ou catégorie existante n’est écrasée. Les profils ordinaires sont fictifs et minimaux ; le fournisseur ne renvoie que les auteurs nécessaires à chaque page, sans âge ou profilage ajouté.

Quatre identités chaîne/adresse : Nébula Étincelle, Nеbula officiel (nom visuellement trompeur volontaire), Ancienne Étincelle sur Base, et **Écho Boréal sur Solana**. Un symbole seul ne devient pas une preuve d’association ou une route de graphique. La première mention de l’adresse Solana est acquise à T+41,25, après une création fictive à T+20. Les pools et transactions ne sont pas révélés avant leur création ; leurs dates, marqueurs et formats d’adresse correspondent à la chaîne. Les marqueurs de publication ouvrent la publication exacte dans la veille, plutôt qu’une conversation générique.

Trois nouvelles publications à T+61,25 / 62,25 / 63,25 permettent d’essayer une alerte créée au point initial T+60, sans rejouer automatiquement des observations antérieures à la création de la règle. Elles portent des ID distincts des 60 publications antérieures.

`createScenarioProvider(clock)` utilise **la même interface XProvider** : recherche, pagination, profil, publications d’utilisateur, conversation, citations et flux de rejeu. Le catalogue est servi dans l’ordre d’acquisition et filtré par l’horloge injectée ; les pages ne révèlent pas les observations futures. La composition privée DEMO utilise ce catalogue à T+60. Les changements de l’horloge du renderer ne pilotent pas un serveur : il n’existe toujours pas de liaison serveur authentifiée dans cette édition.

Le flux est fini et accéléré, sans transport HTTP. Annulation explicite et erreurs typées 429, accès refusé, déconnexion et budget atteint sont testées ; une panne peut interrompre le flux entre deux publications. Aucun retry réseau ou service en arrière-plan n’est lancé. Les anciens petits jeux de contrat à trois publications et le fournisseur de conversation dédié restent disponibles pour vérifier les garanties antérieures.

## Horloge et états partagés

`DemoSessionProvider` conserve une session versionnée dans **`memeradar-demo-session-phase13-v1`**, séparée des préférences, personnes, sources et alertes existantes. Le curseur accepte les minutes entières de T+0 à T+4 320, soit trois jours. Navigation, précédent/suivant et rechargement conservent l’instant. « Rejouer ×300 » avance de cinq minutes simulées par seconde et s’arrête à la borne. Les boutons d’alertes ou d’avancement des diagnostics modifient la même horloge.

Le sélecteur **État global de la démo** partage fonctionnement normal, couverture partielle, quota 429, flux déconnecté, budget strict atteint, erreur et X non configuré. Les sélections correspondantes dans Sources ou Conversations se retrouvent dans les autres vues. Chargement/vide/données anciennes et fenêtre de conversation restent des diagnostics locaux explicitement simulés ; ils ne certifient pas un état fournisseur réel. Un ancien paramètre URL de panne ne peut pas réactiver silencieusement une panne globale après son effacement.

Les dates du quota sont ancrées au choix de la simulation, et ne reviennent pas arbitrairement au début du scénario. Une réinitialisation de quota passée ne prouve pas qu’une nouvelle réponse a été observée : il n’y a pas de requête automatique pour inventer un quota rétabli. Le retour à l’état normal est explicite. Le scénario de budget global se place au plafond courant ; augmenter un montant ne transforme pas automatiquement cette simulation en succès.

Revenir en arrière réinitialise l’état technique global à normal et masque les observations non encore acquises. Cela **ne supprime pas** comptes, notes, paramètres, compteurs de tests ni décisions d’alertes. Les décisions déjà calculées ne sont pas réécrites : si l’horloge précède leur dernière évaluation, leur archive est masquée et un message demande de rejoindre ce point avant une nouvelle évaluation. « Recommencer » repositionne le rejeu, sans effacement silencieux de l’historique.

Un stockage de session invalide est conservé ; les commandes d’horloge et de simulation sont verrouillées avec un motif visible. Les autres stockages conservent leurs protections antérieures. La nouvelle session devient l’autorité de l’horloge et des simulations ; les anciennes clés restent intactes et leurs réglages sont réutilisés. Aucun nouvel IPC, service réseau ou format de préférence Windows.

## Alertes, provenance et limites pédagogiques

Les alertes de mot-clé et de personne suivie utilisent maintenant les **vrais ID, texte et heures du catalogue fictif**, avec contrôle de l’auteur stable et de la pause. Une nouvelle règle démarre au point courant ; pas de notification rétroactive fabriquée. Répéter une évaluation conserve l’idempotence. Les liens d’observations DEMO ouvrent la publication précise dans Veille X ; aucun lien X réel n’est inventé.

Les exemples des autres types d’alertes restent des **cas pédagogiques préenregistrés**, datés sur la même origine temporelle ; ils ne sont pas présentés comme un calcul d’alerte exécuté à partir des courbes. De même, coûts/quotas sont des simulations, pas une facture déduite du nombre de publications affichées. Le marqueur d’alerte historique du graphique conserve son avertissement « moteur non exécuté ». Les agrégats V1 restent séparés de Nébula ; aucune fusion artificielle des anciens indicateurs.

Les courbes sont fictives, les trous ne sont pas interpolés et les contrôles de risque gardent leurs preuves et leur âge. Le jeu de marché reste borné aux observations T+8 à T+120 : au-delà, des périodes vides ou anciennes restent visibles, sans inventer des prix pour trois jours. Aucun score de profit, conseil financier, bouton d’achat ou liaison de portefeuille.

Le panneau **Parcours guidé Nébula Mobile** décrit : ajout explicite d’un profil fictif → veille → conversation partielle → réponse avec adresse → fiche et graphique → risques → alerte → quota 429 dans Sources. Le bandeau DEMO et l’avertissement financier restent visibles.

## Fichiers et tests

Créés : `packages/demo/{scenario,provider,alerts}.ts`, `apps/web/src/DemoSession.tsx`, `tests/unit/demo-scenario.test.ts`, ce document.

Modifiés : fournisseur/flux DEMO et composition privée, fixtures événement/social/graphiques/sources, provenance des liens d’alertes, vues et horloge de l’application, commandes de format/types/couverture, tests unitaires/intégration/navigateur/Electron et documentation. Aucun fichier supprimé, dépendance npm ou migration SQL ajoutée. Schéma inchangé : 69 tables applicatives et douze versions.

Modifications de tests existants justifiées :

- Le nombre de tokens Nébula passe de trois à quatre ; le filtre Solana trouve désormais une publication exacte.
- Le catalogue passe de 60 à 63 publications pour les trois observations postérieures à la création des nouvelles alertes.
- Le worker privé recherche désormais le catalogue complet : « fict » produit 20 publications en deux pages de dix, au lieu de trois en une page.
- La pause de Julie vérifie les trois nouvelles publications, toutes supprimées avec le motif de pause, plutôt qu’un seul exemple artificiel.
- Les marqueurs ouvrent la publication exacte : le test vérifie la route de veille et un seul résultat, en remplacement de la redirection systématique vers la racine de conversation.

Validation locale :

- **316 tests unitaires/contrats**, dont 17 nouveaux : catalogue/identités, contrats XProvider, acquisition et minimisation, pagination, 429/403/déconnexion/budget, flux stoppé et absence de fetch, horloge bornée, dates du quota, alertes canoniques et absence de pool futur. Couverture globale lignes **96,10 %**, branches **91,86 %**, seuils de 80 % conservés.
- **104 tests PostgreSQL** : non-régression, worker DEMO paginé, isolation et contraintes existantes. Couverture globale lignes **93,14 %**, branches **84,82 %**. Aucun schéma ou manifeste SQL modifié.
- **Sept tests Redis supplémentaires** réussis ; avec PostgreSQL, **427 tests TypeScript distincts** validés.
- **20 parcours Chromium**, dont trois nouveaux : parcours complet Nébula, horloge conservée/retour arrière et session corrompue préservée. Zéro requête externe et aucune erreur JavaScript inattendue dans le parcours complet. Les anciens parcours de données manquantes, thèmes, écran mobile, préférences et erreur de vue sont conservés.
- **Electron sous Xvfb** : horloge partagée conservée après rechargement et changement de page, quota partagé, reprise du rejeu, anciennes préférences et protections réseau/IPC.
- Compilation/typecheck, format et `git diff --check` réussis ; diagnostics X/collecte à zéro appel réseau ; audit des dépendances de production sans vulnérabilité signalée.

Le test d’erreur de module accepte désormais le paramètre de cache de Vite et vérifie qu’un chargement a effectivement été bloqué ; le défaut simulé ne peut plus être contourné par une URL horodatée du serveur de développement. Aucun test supprimé, assertion affaiblie, timeout augmenté ou retry ajouté.

Validations GitHub réussies sur le commit **86ce16874c43c76bbe258ceef3aecb8508e06ed0** :

- [Linux — compilation, format, contrats, 51 contrôles SQL V1, PostgreSQL, Redis, diagnostics et audit](https://github.com/wnathan469-debug/meme/actions/runs/39182738897).
- [Windows — compilation native, tests, installateur NSIS et ZIP vérifié après extraction](https://github.com/wnathan469-debug/meme/actions/runs/39182738907).

Les deux workflows sont terminés avec succès. L’artefact Windows CI est conservé pendant 14 jours ; sa fabrication et ses empreintes vérifiées ne constituent pas un essai d’installation sur le PC utilisateur. La publication a conservé les fichiers immuables de la release publique 0.1.0, déjà existante : ces anciens téléchargements ne contiennent pas la phase 13.

Il reste **une phase : 14 — validation finale, documentation de livraison et nouvel installateur public Windows**. Elle n’est pas commencée ici.
