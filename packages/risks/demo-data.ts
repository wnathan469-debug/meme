import { eventAt } from "../events/demo-data";
import {
  observation,
  holdersObservation,
  movementObservation,
  liquidityObservation,
  lpObservation,
} from "./adapters";
import {
  riskReport,
  type RiskIdentity,
  type RiskBatch,
  type Check,
} from "./model";
export type RiskDemoState =
  "normal" | "missing" | "failed" | "stale" | "conflict";
export function demoRiskBatches(
  id: RiskIdentity,
  minute: number,
  state: RiskDemoState = "normal",
): RiskBatch[] {
  if (id.origin !== "DEMO") throw new Error("Demo only");
  if (minute < 12 || state === "missing") return [];
  const at = eventAt(state === "stale" ? Math.max(12, minute - 10) : minute);
  const p = {
    source: "[DÉMO] Analyse locale fictive v1",
    url: "https://demo.memeradar.invalid/risks",
    observedAt: at,
    fetchedAt: at,
    limitations:
      "Scénario entièrement fictif, sans lecture de blockchain. Liste et fenêtre partielles ; aucun historique réel ni attestation de sécurité.",
  };
  if (state === "failed")
    return [
      {
        ...id,
        observations: [
          observation(
            p,
            "honeypot",
            "error",
            "Échec simulé du service de contrôle ; aucune conclusion sur le token.",
            false,
          ),
        ],
      },
    ];
  const addr = (i: number) =>
    id.chain === "solana"
      ? "DEMo" + "A".repeat(31) + String.fromCharCode(65 + i)
      : "0xDEMO" + "0".repeat(34) + String(i).padStart(2, "0");
  const observations = [
    holdersObservation(
      id,
      {
        supply: "100000000",
        complete: false,
        holders: [
          {
            address: addr(1),
            amount: "45000000",
            role: "pool",
            roleVerified: true,
          },
          {
            address: addr(2),
            amount: "16000000",
            role: "wallet",
            roleVerified: true,
          },
          {
            address: addr(3),
            amount: "5000000",
            role: "burn",
            roleVerified: true,
          },
          {
            address: addr(4),
            amount: "2000000",
            role: "lock",
            roleVerified: true,
          },
        ],
      },
      p,
    ),
    movementObservation(
      id,
      "100000000",
      [
        {
          wallet: addr(2),
          amount: "1100000",
          direction: "out",
          creator: true,
          tx: "DEMO_TX_CREATOR_12",
        },
      ],
      false,
      p,
    ),
    liquidityObservation("18000", "13500", p),
    lpObservation("unknown", false, null, p),
    observation(
      p,
      "honeypot",
      "error",
      "La simulation fictive ne fournit aucun résultat de vente exploitable.",
      false,
    ),
    observation(
      p,
      "sell_restriction",
      "unknown",
      "Restriction des ventes non déterminée ; aucun achat ni vente exécuté.",
      false,
    ),
  ];
  const values: [Check, "signal" | "clear" | "unknown", string][] =
    id.chain === "solana"
      ? [
          [
            "mint_authority",
            "signal",
            "Autorité de création encore présente dans le scénario.",
          ],
          [
            "freeze_authority",
            "clear",
            "Autorité de gel explicitement révoquée dans le scénario.",
          ],
          [
            "extensions",
            "signal",
            "Extension Token-2022 TransferFeeConfig fictive ; son existence ne prouve pas une fraude.",
          ],
          [
            "metadata_authority",
            "unknown",
            "Compte de métadonnées non récupéré ; autorité de mise à jour inconnue.",
          ],
        ]
      : [
          [
            "owner",
            "signal",
            "Propriétaire fictif non révoqué ; contrôle indirect non examiné.",
          ],
          [
            "mint",
            "signal",
            "Fonction de création supplémentaire présente dans le scénario.",
          ],
          ["blacklist", "unknown", "Code de liste noire non déterminé."],
          [
            "pause",
            "clear",
            "Aucune fonction de pause identifiée dans le contrat fictif examiné.",
          ],
          [
            "fees",
            "signal",
            "Frais modifiables par une autorité dans le scénario.",
          ],
          [
            "proxy",
            "unknown",
            "Implémentation ou administrateur de proxy non récupéré.",
          ],
          [
            "unverified",
            "signal",
            "Code fictif non vérifié auprès de la source du scénario.",
          ],
        ];
  for (const [c, r, d] of values)
    observations.push(observation(p, c, r, d, r !== "unknown"));
  const batch = { ...id, observations };
  return state === "conflict"
    ? [
        batch,
        {
          ...id,
          observations: [
            observation(
              { ...p, source: "[DÉMO] Seconde source contradictoire" },
              "holders",
              "clear",
              "Cette seconde source fictive contredit le calcul de concentration.",
            ),
          ],
        },
      ]
    : [batch];
}
export function demoRiskReport(
  id: RiskIdentity,
  minute: number,
  state: RiskDemoState = "normal",
) {
  return riskReport(id, demoRiskBatches(id, minute, state), eventAt(minute));
}
