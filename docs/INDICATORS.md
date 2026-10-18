# Indicateurs — édition démo

Les règles ci-dessous concernent uniquement les fixtures locales. Entrées, facteurs, manques, version et horodatage sont visibles dans la fiche. Pas de score agrégé ni de recommandation financière.

| Indicateur | Règle pédagogique |
|---|---|
| ATTENTION | Mentions de la tranche de cinq minutes : ≤20 faible, 21–50 modéré, 51–90 élevé, >90 très élevé |
| EVENT_LINK | Association plausible → modéré, faible → faible, absence de métadonnées/date → données insuffisantes |
| DATA_QUALITY | Prix et liquidité présents → modéré ; sinon données insuffisantes. Pas de recoupement réel |
| ONCHAIN_RISK | Au moins un signal de sévérité élevée → élevé ; autres contrôles disponibles → modéré ; tous échoués/manquants → données insuffisantes |
| ANALYSIS_CONFIDENCE | Marché et au moins un contrôle disponibles → modéré ; sinon données insuffisantes |

Les règles sont versionnées `*-demo@1.0.0`. Dans la vue, l'exclusion de la source concernée ou une position avant T+60 min fait apparaître les observations non encore disponibles comme données insuffisantes. Les champs temporels sont ceux de l'horloge simulée, pas des observations actuelles du monde réel.

## Association

`association-demo@1.0.0` : métadonnées/date absentes → INSUFFICIENT_DATA. Correspondance thématique, création entre 0 et 120 min, preuve supplémentaire de fixture et absence de revendication officielle → PLAUSIBLE. Autres cas → WEAK. La revendication officielle produit un avertissement. Aucun jeu de la démo ne peut atteindre CONFIRMED ; seul le futur moteur live pourra le faire sur preuve officielle vérifiée.

## Alertes

La règle personnalisée se déclenche à partir du seuil inclusif, se désarme jusqu'au retour strictement sous le seuil bas et respecte le délai en minutes. L'état est recalculé depuis le début de la série à chaque rejeu. Des déclenchements pédagogiques supprimés sont conservés tous les trois buckets au-dessus du seuil ; ceci illustre l'historique de suppression sans prétendre représenter chaque décision d'un moteur live. L'identifiant règle/événement/bucket est déterministe et unique. Les trois alertes Tesla prédéfinies sont séparées de cette règle.

Les calculs d'attention utilisent des compteurs entiers. Les prix USD restent des chaînes décimales exactes jusqu'à l'affichage ; aucune opération financière n'est implémentée.
