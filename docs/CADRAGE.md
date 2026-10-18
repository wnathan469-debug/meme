# Phase 1 — Cadrage de MemeRadar

Statut : cadrage validé pour passage à la phase 2. Ce document décrit la cible ; il ne déclare aucune fonctionnalité implémentée.

## Objectif et utilisateurs

Permettre aux chercheurs, journalistes et analystes de comprendre les liens revendiqués entre une actualité publique et des memecoins. Présenter des preuves consultables, leur fraîcheur et leurs limites, sans recommandation d'achat ou de vente.

## Exigences reformulées

1. Collecter des sources autorisées, normaliser les éléments, dédupliquer et regrouper les publications en événements. Séparer fiabilité des sources et popularité.
2. Découvrir des tokens sur Ethereum, Base, BNB Chain, Arbitrum et Solana. L'identité est le couple chaîne/adresse ; le nom ne prouve rien.
3. Expliquer les liens événement/token : confirmé uniquement avec publication officielle de l'adresse exacte, plausible, faible ou données insuffisantes. Détecter les indices d'usurpation et les chronologies incompatibles.
4. Fournir marché, concentration, permissions et liquidité avec provenance, précision numérique et statut de chaque contrôle. Une vérification échouée n'équivaut jamais à une absence de risque.
5. Calculer cinq indicateurs indépendants et versionnés : attention, lien événementiel, qualité des données, risque on-chain et confiance de l'analyse. Aucun score global ni prédiction.
6. Produire des alertes explicables, avec déduplication, cooldown, hystérésis, regroupement, heures silencieuses et historique des suppressions.
7. Livrer une interface française accessible : tableau de bord, événements, tokens, alertes, sources, paramètres ; filtres dans l'URL, thème clair/sombre, états vides/erreurs/partiels et données anciennes.
8. Garantir la traçabilité Observé/Calculé/Interprété du stockage jusqu'à l'interface. Une donnée absente reste absente, jamais remplacée par zéro.
9. Isoler DEMO et REAL en stockage et dans les dépôts. En démo, interdire les appels externes et afficher bandeau permanent et badges ; aucun lien de démonstration ne doit résoudre un véritable service.
10. Protéger API, secrets et contenus externes ; tester résilience, SSRF, validation, règles métier et parcours utilisateur. Ne jamais signer ni envoyer de transaction.

## Démonstration attendue

Une commande démarre une application sans clé API. Le scénario « [DÉMO] Annonce virale d'un nouveau véhicule par Tesla » ne fait aucune affirmation sur Tesla ou ses produits réels : communiqué fictif, 4 à 6 médias fictifs, 15 à 30 publications fictives, quatre tokens (plausible, faible, imitateur, données insuffisantes) et trois alertes dont une supprimée. Deux scénarios inventés supplémentaires couvrent un mème viral et un événement sportif. Le temps peut être rejoué de façon accélérée et déterministe.

Les adresses fictives sont reconnaissables et acceptées exclusivement par le chemin de validation DEMO ; elles ne doivent jamais être soumises à un RPC ou un explorateur réel. Un test distinct avec une entité inventée vérifie le cas CONFIRMED, sans donner de statut officiel à un token du scénario Tesla.

## Hypothèses et décisions par défaut

- Monolithe modulaire TypeScript, API Fastify, interface React/Vite, PostgreSQL 16, Redis/BullMQ, Drizzle et Zod. Justifications et alternatives dans DECISIONS.md ; architecture détaillée en phase 2.
- Instance privée avec un administrateur local, sans inscription publique ni gestion multi-tenant en V1. Accès distant authentifié ; pas d'exemption implicite en démo.
- Démo entièrement locale par défaut ; mode live explicitement activé et validé au démarrage. Aucun fournisseur, compte externe ou abonnement n'est présumé disponible.
- RSS/Atom et un fournisseur d'actualité constituent la première ingestion réelle. Les intégrations sociales sont optionnelles et limitées aux API autorisées. Le choix définitif des fournisseurs dépend de la revue documentaire de phase 4.
- Les cinq chaînes sont modélisées ; chaque capacité live annonce sa couverture réelle par chaîne et fournisseur. Une chaîne sans fournisseur compatible est indisponible, jamais présentée comme analysée.
- Pas de LLM en première intention : extraction par dictionnaire/regex, résumés extractifs et regroupement déterministe.
- UTC en stockage ; America/Toronto par défaut à l'affichage, modifiable. Rétention initiale proposée : extraits 30 jours, journaux techniques expurgés 14 jours ; durées finales à confirmer avant usage réel.
- Notifications internes obligatoires ; SMTP et webhook HMAC activables avec configuration explicite. Aucun message externe ne sera envoyé pendant le développement sans autorisation.

## Risques et réponses prévues

| Risque | Conséquence | Réponse et vérification prévue |
|---|---|---|
| Couverture incomplète, quotas et délais d'indexation | Tendances manquées, chronologie biaisée | Afficher couverture, latence, fraîcheur et complétude ; tester pannes et réponses partielles |
| Usurpation, homonymes et promotion coordonnée | Association trompeuse | Preuves et contre-indications ; test interdisant CONFIRMED sans adresse officielle exacte |
| Contrats modifiables ou résultats tiers contradictoires | Faux sentiment de sécurité | Résultats datés, statut d'échec distinct, limites et avertissement explicites |
| Mélange DEMO/REAL | Présentation de faits inventés | Contraintes d'origine et isolation des dépôts, tests négatifs et blocage réseau démo |
| Métadonnées hostiles et URL arbitraires | XSS, SSRF, suivi ou fuite de secrets | Échappement, CSP, validation, résolution sûre et redirections contrôlées ; tests adversariaux |
| Arrondis et montants extrêmes | Indicateurs erronés | Entiers bruts et décimaux exacts, tests aux limites |
| Reprises et tâches répétées | Alertes répétées, double comptage | Unicité en base, tâches idempotentes, déduplication et tests de redémarrage |
| Périmètre étendu et dépendances externes | V1 incomplète ou coûteuse | Progression par phases, tests reproductibles hors réseau, couverture des capacités documentée |
| CGU, droits d'auteur, données personnelles | Usage ou redistribution non autorisés | Vérifier chaque source ; conserver des extraits limités, agréger les comptes non notoires, appliquer rétention et purge |
| Qualification du service et responsabilité | Risque juridique | Validation professionnelle avant usage public/commercial : Loi 25, LPRPDE, RGPD selon périmètre, cadre AMF et responsabilité |

## Questions ouvertes et propositions

Ces questions ne bloquent pas le cadrage ; les défauts ci-dessous restent des propositions, sans engagement de dépense.

| Question | Décision proposée | Point de réexamen |
|---|---|---|
| Usage privé ou public ? | Privé, administrateur unique | Avant conception de l'authentification et avant publication |
| Budget et abonnements ? | Démo gratuite, aucun abonnement automatique | Inventaire fournisseurs en phase 4 |
| Réseaux prioritaires ? | Solana et Base pour les premiers parcours live, modèle prévu pour les cinq chaînes | Phases 4 et 7, sans supprimer les autres exigences |
| Fournisseur d'actualité ? | Évaluer GDELT en premier, RSS obligatoire | CGU, quotas, schémas et couverture vérifiés en phase 4 |
| Volumétrie et fraîcheur ? | Pas de promesse temps réel ; mesurer la latence réelle | Mesures sur petit corpus avant activation live |
| Hébergement et notifications ? | Docker Compose sur une instance ; notifications internes initiales | Architecture puis configuration des canaux |
| Rétention et juridiction ? | Durées proposées ci-dessus, usage au Canada présumé | Revue juridique préalable à tout usage public |

## Plan des phases suivantes

| Phase | Production | Validation attendue avant phase suivante |
|---|---|---|
| 2 | ARCHITECTURE.md, composants, flux, séquence et ER Mermaid ; frontières des modules | Dépendances, sécurité, modes et déploiement cohérents |
| 3 | Schéma complet, migrations, contraintes et index incluant origine/provenance | Migration sur base vide, intégrité référentielle et isolation DEMO/REAL |
| 4 | PROVIDERS.md, endpoints vérifiés, CGU, quotas/coûts datés, .env.example commenté | Distinguer capacités disponibles, optionnelles et bloquées ; aucune clé requise pour la démo |
| 5 | Monorepo, configuration stricte, logs expurgés, erreurs, HTTP résilient, CI | Installation verrouillée, types/lint, tests résilience/SSRF/blocage démo |
| 6 | Ingestion, normalisation, déduplication, entités, regroupement | Fixtures RSS/actualité, curseurs, reprises et idempotence |
| 7 | Découverte, identité, association, imitation et chronologie | Adresses, homoglyphes, quatre niveaux et preuve officielle obligatoire |
| 8 | Marché, concentration, permissions, liquidité, résultats tiers | Précision, fraîcheur, divergences, exclusions et échecs explicites |
| 9 | Attention, séries, complétude, personnalités et suivi | Fiabilité séparée de popularité ; aucune inférence de soutien non prouvée |
| 10 | Cinq indicateurs purs, explications et INDICATORS.md | Règles versionnées, entrées manquantes et couverture métier |
| 11 | Règles d'alertes, suppression, feedback et canaux configurables | Cooldown, hystérésis, regroupement, heures silencieuses et HMAC |
| 12 | API REST authentifiée, pagination, validation, limites, health/ready | Contrats, autorisation, CORS, erreurs et tests avec Postgres/Redis |
| 13 | Six vues françaises, graphiques, filtres URL, thèmes et accessibilité | Parcours Playwright, clavier, états vides/erreurs/partiels/anciens |
| 14 | Trois scénarios DEMO, seeds et rejeu accéléré | Démarrage sans clé, parcours Tesla complet et aucune sortie réseau |
| 15 | Documentation finale, SECURITY, LIMITATIONS, RUNBOOK et checklist live | Tests exécutés, couverture ≥ 80 % core/analysis/alerts, build et audit ; écarts explicitement signalés |

## Définition de terminé et limites actuelles

L'acceptation finale suit la section 21 de SPECIFICATION.md : lancement Compose démo sans clé, parcours complet, tests et couverture, impossibilité des appels externes démo, absence de capacités de signature, provenance et fraîcheur des métriques, indicateurs explicables, données manquantes explicites et avertissements permanents.

Avant usage réel : vérifier CGU et quotas, examiner manuellement un petit ensemble de tokens connus, comparer aux explorateurs officiels, faire une revue de sécurité et juridique, préparer surveillance et signalement d'erreurs. Les tests automatisés n'appelleront aucun fournisseur réel.

À cette phase : ni code applicatif, ni schéma, ni connecteur, ni garantie de disponibilité des fournisseurs. La validation demandée porte sur le périmètre et les décisions proposées, pas sur une application déjà opérationnelle.
