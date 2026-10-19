# Offre proposée — Railway Pro pour le pilote MemeRadar

Proposition du 19 octobre 2026, à la demande de l’utilisateur sans compte d’hébergement. **Aucun achat ni déploiement autorisé par cette proposition.** Les approbations financières restent inchangées. Windows 0.2.0 reste en démo.

## Recommandation concrète

**Railway Pro, un projet personnel MemeRadar, une seule instance de chaque service, budget cible hébergement de 35 USD/mois hors taxes et change.** Pro est l’offre orientée production et permet les collaborateurs avec permissions ; Hobby vise les projets personnels et reste une alternative moins chère lorsque la consommation est faible. Aucun besoin d’installer des outils sur le PC Windows.

Services proposés :

- API avec environ 0,5 GB de RAM ; HTTPS public uniquement après adaptation testée au proxy Railway.
- PostgreSQL privé, environ 1 GB de RAM, volume initial de 5 GB.
- Redis privé, environ 0,125 GB de RAM, volume initial de 1 GB ; non utilisé par l’API actuelle, prévu pour les workers ultérieurs.
- Job de sauvegarde PostgreSQL chiffrée, toutes les six heures, environ 0,25 GB pendant son exécution ; clé privée de restauration conservée hors serveur.
- Snapshots du volume et copie des dumps chiffrés dans un bucket privé distinct du volume. Le transfert automatique vers le bucket et sa restauration restent à développer/tester. Ce bucket reste chez le même fournisseur ; prévoir aussi une copie indépendante et son coût avant de revendiquer une protection contre la perte du compte/prestataire.
- Surveillance depuis un service indépendant et canal d’alerte à sélectionner avant mise en service. Ni offre externe gratuite ni coût nul garantis. Si ces éléments font dépasser l’enveloppe, demander un nouvel arbitrage avant achat.

Aucune mise en veille pour le pilote continu, aucun environnement de prévisualisation facturable, aucune réplication, aucun usage du Railway Agent/IA facturé séparément. Un seul compte utilisateur est prévu ; ne donner accès à un intervenant qu’au travers des permissions du prestataire, jamais en partageant le mot de passe.

## Prix confirmés dans la documentation officielle

Les pages commerciales Railway, Render et DigitalOcean sont toujours refusées par le proxy de cet environnement (CONNECT 403). **Les fichiers du dépôt officiel Railway sont accessibles et ont été relus avec succès**, au commit `72354493198302677fb6be6c692dd75c64cae2c6`. Cela vérifie le contenu documentaire, pas le devis personnalisé du compte, ses taxes ou l’écran de souscription.

| Poste | Tarif publié, USD |
|---|---:|
| Pro : abonnement mensuel avec 20 USD de consommation inclus | 20/mois minimum |
| RAM des conteneurs | 10/GB/mois |
| CPU consommé des conteneurs | 20/vCPU/mois |
| Volume | 0,15/GB/mois |
| Snapshots : données incrémentales propres aux sauvegardes | Même tarif que les volumes |
| Trafic sortant des services | 0,05/GB |
| Bucket privé | 0,015/GB/mois ; opérations et sortie du bucket annoncées sans frais |

Les 20 USD inclus **ne s’ajoutent pas** à nouveau aux ressources : 27 USD de consommation couverte donnent 27 USD au total avant taxes, pas 47 USD. Si cette consommation reste à 15 USD, le minimum Pro reste 20 USD. Les uploads d’un service vers un bucket passent par le réseau public et comptent dans la sortie du service. La documentation comporte des conditions particulières ; les relire avant souscription.

### Scénario de dimensionnement, pas un devis garanti

| Hypothèse mensuelle en unités facturables | Calcul, USD |
|---|---:|
| RAM moyenne totale 1,875 GB, en comptant prudemment le job toute la période | 18,75 |
| CPU moyen total 0,25 vCPU | 5,00 |
| Volumes 6 GB | 0,90 |
| Snapshots incrémentaux 10 GB | 1,50 |
| Bucket 10 GB | 0,15 |
| Sortie réseau des services 10 GB | 0,50 |
| **Consommation hypothétique et minimum Pro dépassé** | **26,80** |
| **Budget cible proposé** | **35,00** |

Ce calcul n’est ni une mesure de l’application sur Railway, ni une réservation de capacité, ni une garantie de facture. CPU, mémoire réellement facturable, rétention, volumes et trafic doivent être observés. Le coût d’une surveillance extérieure, d’une copie indépendante, d’un domaine éventuel, des taxes et du change n’est pas établi. Viser d’abord un sous-domaine fourni par la plateforme, sans achat de domaine. Le pilote n’a encore aucune garantie de disponibilité.

Les accès **X et autres données ne sont pas inclus**. Leur ancien budget proposé reste non approuvé et ne prouve pas l’adéquation aux tarifs réels de X. L’offre d’hébergement ne suffit pas à rendre l’installateur actuel connecté ou à autoriser la collecte.

## Contrôle des coûts proposé

- Alerte Compute à 28 USD et limite Compute à 35 USD par cycle, à configurer et vérifier dans le compte avant activation payante.
- Selon la documentation, la limite dure arrête les workloads ; un plafond atteint rend donc MemeRadar indisponible. Les données ne doivent pas être effacées pour redémarrer.
- Vérifier la portée du compteur, le stockage conservé, les taxes et les autres postes avant de promettre un montant total maximal. Aucun plafond tout compris de 35 USD n’est garanti ici.
- Ne pas employer le Railway Agent. Sa consommation dispose d’un compteur et d’une limite distincts : la limite Compute ne la couvre pas.
- Pas de mise en service si un poste obligatoire ne rentre pas dans l’enveloppe validée. L’abonnement Pro engage un minimum de 20 USD par mois même sous-utilisé ; l’annulation n’efface pas une consommation déjà effectuée.

## Ordre des actions, sans payer maintenant

1. Présenter ce choix et son budget à l’utilisateur. Il peut créer un compte sur [railway.com](https://railway.com/) avec GitHub, sans sélectionner un abonnement payant ni lancer un service. Ne transmettre aucun secret dans la conversation.
2. Après choix de Railway, adapter et tester le serveur pour le HTTPS géré et son proxy, les secrets, le réseau privé et la restauration. **Le conteneur actuel exige TLS dans Node : le déposer tel quel derrière le port HTTP Railway ne fonctionne pas.** Aucun contournement en HTTP local/production. L’offre ne transforme pas le Docker Compose existant en déploiement Railway prêt à l’emploi.
3. Vérifier dans le portail les tarifs applicables, taxes, disponibilité des services, région, sauvegardes, estimation et limites. Un devis ou tarif affiché divergent remplace le présent calcul et exige une nouvelle validation.
4. Présenter la configuration finale testée et les engagements financiers avant toute souscription. L’accord sur la préparation technique n’est pas un accord d’achat.
5. Seulement après autorisation explicite, déployer sans clé X et sans collecte, vérifier HTTPS depuis Internet, restauration et alerte externe. Mesurer l’usage et ajuster avant la collecte réelle.

## Sources officielles lues, figées au commit vérifié

- [Plans, crédits inclus et tarifs](https://github.com/railwayapp/docs/blob/72354493198302677fb6be6c692dd75c64cae2c6/content/docs/pricing/plans.md)
- [Limites, alertes et arrêt des services](https://github.com/railwayapp/docs/blob/72354493198302677fb6be6c692dd75c64cae2c6/content/docs/pricing/cost-control.md)
- [Sauvegardes de volumes et tarification](https://github.com/railwayapp/docs/blob/72354493198302677fb6be6c692dd75c64cae2c6/content/docs/volumes/backups.md)
- [Buckets privés, prix et limites](https://github.com/railwayapp/docs/blob/72354493198302677fb6be6c692dd75c64cae2c6/content/docs/storage-buckets.md)
- [Factures, taxes et estimation après observation](https://github.com/railwayapp/docs/blob/72354493198302677fb6be6c692dd75c64cae2c6/content/docs/pricing/faqs.md)

## État et limites

Modification documentaire uniquement. Calcul vérifié : 18,75 + 5 + 0,90 + 1,50 + 0,15 + 0,50 = 26,80 USD ; max(20 ; 26,80) = 26,80 USD, marge théorique de 8,20 USD jusqu’à l’objectif de 35. Aucun nouveau test applicatif nécessaire ou annoncé. Aucun compte créé, abonnement, service, appel fournisseur, tarif d’accès X validé ou nouvel installateur.

| Élément | Statut |
|---|---|
| Données de l’application Windows publiée | Simulé (démo) |
| Serveur et outils de déploiement local | Code écrit, non raccordé |
| Adaptation Railway, hébergement public et sauvegarde extérieure | Non commencé |
| Collecte réelle et installateur connecté | Non commencé |
