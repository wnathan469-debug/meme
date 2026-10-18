import React, { useState } from "react";
import {
  demoRiskReport,
  type RiskDemoState,
} from "../../../packages/risks/demo-data";
import {
  RISK_NOTICE,
  SOCIAL_NOTICE,
  statusLabels,
  type RiskIdentity,
} from "../../../packages/risks/model";
import { displayText } from "../../../packages/charts/model";
export function RiskPanel({
  identity,
  minute,
  zone,
  disabled,
}: {
  identity: RiskIdentity;
  minute: number;
  zone: string;
  disabled: boolean;
}) {
  const [simulation, setSimulation] = useState<RiskDemoState>("normal");
  const report = demoRiskReport(
    identity,
    minute,
    disabled ? "missing" : simulation,
  );
  const date = (at: string) =>
    `${new Intl.DateTimeFormat("fr-CA", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(at))} (${zone}) · ${at} UTC`;
  return (
    <section
      className="panel risk-analysis"
      aria-label="Analyse des risques du token"
    >
      <h3>Analyse des risques du token</h3>
      <p className="notice">{RISK_NOTICE}</p>
      <p>
        DÉMO — Contrôles fictifs, sans appel à une blockchain ni transaction.
        Chaque contrôle a sa propre portée ; aucun score global de sécurité.
      </p>
      <label>
        État des contrôles démo{" "}
        <select
          aria-label="État des contrôles de risque démo"
          value={simulation}
          onChange={(e) => setSimulation(e.target.value as RiskDemoState)}
        >
          <option value="normal">Scénario documenté</option>
          <option value="missing">Données manquantes</option>
          <option value="failed">Vérification échouée</option>
          <option value="stale">Observations anciennes</option>
          <option value="conflict">Sources contradictoires</option>
        </select>
      </label>
      {disabled && (
        <p role="status">Source d’analyse exclue : aucune donnée réutilisée.</p>
      )}
      <p>
        Validité locale d’une observation : cinq minutes. « Aucun signal détecté
        » concerne seulement le contrôle effectué à la date indiquée.
      </p>
      <div className="risk-grid">
        {report.map((r) => (
          <article className="risk-check" key={r.check} aria-label={r.title}>
            <h4>{r.title}</h4>
            <strong>{statusLabels[r.status]}</strong>
            <p>{r.explanation}</p>
            {!r.evidence.length && (
              <p>
                Source : aucune observation disponible ou contrôle sans objet.
                Date : non disponible.
              </p>
            )}
            {r.evidence.map((o, i) => (
              <details key={o.source + String(i)}>
                <summary>Preuve et limites · {displayText(o.source)}</summary>
                <p>{displayText(o.detail)}</p>
                <p>
                  Source : {displayText(o.source)} ·{" "}
                  <code>{displayText(o.url)}</code>
                </p>
                <p>
                  Observation : {date(o.observedAt)}
                  <br />
                  Récupération : {date(o.fetchedAt)}
                </p>
                <p>
                  Couverture :{" "}
                  {o.complete
                    ? "complète pour ce contrôle"
                    : "partielle ou indéterminée"}
                  .
                </p>
                <p>Limites : {displayText(o.limitations)}</p>
              </details>
            ))}
          </article>
        ))}
      </div>
      <aside className="notice" aria-label="Activité sociale et légitimité">
        <h4>Activité sociale et légitimité</h4>
        <p>{SOCIAL_NOTICE}</p>
      </aside>
    </section>
  );
}
