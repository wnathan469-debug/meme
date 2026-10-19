import { advanceScenario } from "../../../packages/demo/alerts";
import { useDemoSession } from "./DemoSession";
import { sessionAt } from "../../../packages/demo/scenario";
import React, { useState } from "react";
import { z } from "zod";
import {
  kinds,
  defaultRule,
  ruleSchema,
  candidateLinks,
  type AlertRule,
  type AlertKind,
} from "../../../packages/alerts/model";
import {
  emptyState,
  parseState,
  stateSchema,
  feedback,
  type AlertState,
} from "../../../packages/alerts/engine";
import {
  seedAlertRules,
  advanceDemo,
  demoStart,
} from "../../../packages/alerts/demo-data";
import { WARNING } from "../../../packages/core/domain";
import { displayText } from "../../../packages/charts/model";
const key = "memeradar-demo-alerts-phase10-v1";
const schema = z.object({
  version: z.literal(1),
  clock: z.iso.datetime(),
  rules: z.array(ruleSchema).max(30),
  states: z.record(z.string(), stateSchema),
});
type Store = {
  version: 1;
  clock: string;
  rules: AlertRule[];
  states: Record<string, AlertState>;
};
function load(): Store {
  const text = localStorage.getItem(key);
  if (!text)
    return {
      version: 1,
      clock: demoStart,
      rules: seedAlertRules(),
      states: {},
    };
  if (text.length > 2000000) throw new Error("Stockage trop grand");
  const s = schema.parse(JSON.parse(text));
  for (const state of Object.values(s.states))
    for (const e of parseState(state).entries)
      if (e.candidate.origin !== "DEMO") throw new Error("Origin mismatch");
  return {
    ...s,
    states: Object.fromEntries(
      Object.entries(s.states).map(([k, v]) => [k, parseState(v)]),
    ),
  };
}
const reasons: Record<string, string> = {
  rule_paused: "Règle en pause",
  person_paused: "Personne en pause, supprimée ou non validée",
  quiet_hours: "Heures silencieuses",
  data_quality: "Qualité insuffisante",
  condition_not_met: "Condition non remplie ou données insuffisantes",
  future_observation: "Observation future ou incohérente",
  stale_observation: "Observation trop ancienne",
  hysteresis: "Attente du réarmement",
  cooldown: "Délai de récupération",
  hourly_limit: "Plafond horaire atteint",
  out_of_order: "Observation antérieure au dernier état connu",
};
export function AlertsV2() {
  const session = useDemoSession();
  const [initial] = useState(() => {
    try {
      return { data: load(), error: "" };
    } catch {
      return {
        data: { version: 1 as const, clock: demoStart, rules: [], states: {} },
        error:
          "Stockage des alertes illisible : données conservées, modifications désactivées.",
      };
    }
  });
  const [store, setStore] = useState<Store>(initial.data),
    [draft, setDraft] = useState<AlertRule>(() =>
      defaultRule(crypto.randomUUID()),
    ),
    [termsText, setTermsText] = useState("Nébula"),
    [message, setMessage] = useState(initial.error),
    [suppressed, setSuppressed] = useState(false);
  function readPeople() {
    try {
      const raw = JSON.parse(
        localStorage.getItem("memeradar-demo-people-v2") ?? '{"people":[]}',
      );
      return z
        .array(
          z.object({
            id: z.uuid(),
            username: z.string(),
            xUserId: z.string().nullable(),
            status: z.enum(["active", "paused"]),
            validation: z.string(),
          }),
        )
        .max(1000)
        .parse(raw.people);
    } catch {
      return [];
    }
  }
  const people = readPeople();
  const save = (next: Store) => {
    if (initial.error) return false;
    try {
      schema.parse(next);
      const text = JSON.stringify(next);
      if (text.length > 2000000) throw new Error();
      localStorage.setItem(key, text);
      setStore(next);
      return true;
    } catch {
      setMessage(
        "Enregistrement impossible ou limite atteinte ; état précédent conservé.",
      );
      return false;
    }
  };
  const date = (at: string, zone = "America/Toronto") =>
    `${new Intl.DateTimeFormat("fr-CA", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(at))} (${zone}) · ${at} UTC`;
  const context = (r: AlertRule) => {
    const p = readPeople().find((p) => p.id === r.personId);
    return {
      personPaused:
        !p || p.status !== "active" || p.validation !== "validated_via_api",
      authorId: p?.xUserId ?? null,
    };
  };
  function run(minutes: number) {
    try {
      if (Date.parse(sessionAt(session.state)) < Date.parse(store.clock))
        throw new Error();
      const end = new Date(
        Date.parse(sessionAt(session.state)) + minutes * 60000,
      ).toISOString();
      if (Date.parse(end) > Date.parse(demoStart) + 3 * 86400000)
        throw new Error();
      const states = Object.fromEntries(
        store.rules.map((r) => [
          r.id,
          advanceScenario(
            r,
            store.states[r.id] ?? emptyState(),
            end,
            context(r),
          ),
        ]),
      );
      if (save({ ...store, clock: end, states })) {
        session.setMinute(
          Math.round((Date.parse(end) - Date.parse(demoStart)) / 60000),
        );
        setMessage(
          "Scénario évalué : notifications et raisons conservées localement.",
        );
      }
    } catch {
      setMessage(
        "Évaluation refusée : état invalide ou limite du scénario atteinte (trois jours, 1 000 décisions par règle).",
      );
    }
  }
  const historyVisible =
    Date.parse(sessionAt(session.state)) >= Date.parse(store.clock);
  const field = <K extends keyof AlertRule>(k: K, v: AlertRule[K]) =>
    setDraft({ ...draft, [k]: v });
  const editing = store.rules.some((r) => r.id === draft.id);
  return (
    <section className="panel alerts-v2" aria-label="Centre d’alertes V2">
      <h2>Centre d’alertes V2</h2>
      <p>
        DÉMO hors ligne — Notifications dans l’application uniquement.
        L’évaluation est manuelle ; aucune surveillance en arrière-plan ni envoi
        externe.
      </p>
      <p>
        Horloge partagée : {date(sessionAt(session.state))}. Dernière évaluation
        des alertes : {date(store.clock)}. Les décisions sont conservées ;
        revenir en arrière ne les efface pas.
      </p>
      {Date.parse(sessionAt(session.state)) < Date.parse(store.clock) && (
        <p role="status">
          Le curseur précède les décisions conservées. Les éléments futurs sont
          masqués ; reprenez l’horloge à la dernière évaluation avant de traiter
          de nouvelles observations.
        </p>
      )}
      <div className="row">
        <button
          disabled={!!initial.error || !!session.error}
          onClick={() => run(5)}
        >
          Avancer les alertes de 5 minutes
        </button>
        <button
          disabled={!!initial.error || !!session.error}
          onClick={() => run(60)}
        >
          Avancer les alertes d’une heure
        </button>
        <button
          disabled={!!initial.error || !!session.error}
          onClick={() => run(1440)}
        >
          Avancer les alertes d’un jour
        </button>
      </div>
      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}
      <form
        aria-label="Configurer une alerte V2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = ruleSchema.safeParse({
            ...draft,
            terms: termsText
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          });
          if (!p.success) {
            setMessage(
              "Règle invalide : termes/personne requis, réarmement inférieur au seuil, limites et heures valides.",
            );
            return;
          }
          const rules = editing
            ? store.rules.map((r) => (r.id === draft.id ? p.data : r))
            : [...store.rules, p.data];
          const states = store.states[draft.id]
            ? store.states
            : {
                ...store.states,
                [draft.id]: {
                  ...emptyState(),
                  clock: sessionAt(session.state),
                },
              };
          if (save({ ...store, rules, states })) {
            setMessage(
              "Règle V2 enregistrée. Les livraisons en attente conservent leur échéance initiale.",
            );
            setDraft(defaultRule(crypto.randomUUID()));
            setTermsText("Nébula");
          }
        }}
      >
        <h3>{editing ? "Modifier une règle V2" : "Créer une règle V2"}</h3>
        <div className="form-grid">
          <label>
            Nom de l’alerte V2
            <input
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Type d’alerte V2
            <select
              value={draft.kind}
              disabled={editing}
              onChange={(e) => field("kind", e.target.value as AlertKind)}
            >
              {Object.entries(kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {draft.kind === "person_post" && (
            <label>
              Personne suivie pour l’alerte
              <select
                value={draft.personId ?? ""}
                disabled={editing}
                onChange={(e) => field("personId", e.target.value || null)}
              >
                <option value="">Choisir une personne</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.username} ·{" "}
                    {p.status === "active" ? "active" : "en pause"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Termes (séparés par des virgules)
            <input
              maxLength={1000}
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
            />
          </label>
          <label>
            Mode de livraison V2
            <select
              value={draft.delivery}
              onChange={(e) =>
                field("delivery", e.target.value as AlertRule["delivery"])
              }
            >
              <option value="immediate">Immédiat</option>
              <option value="interval">Résumé toutes les N minutes</option>
              <option value="daily">Résumé quotidien</option>
            </select>
          </label>
          <label>
            Intervalle du résumé (minutes)
            <input
              type="number"
              min={1}
              max={10080}
              value={draft.intervalMinutes}
              onChange={(e) => field("intervalMinutes", Number(e.target.value))}
            />
          </label>
          <label>
            Heure du résumé quotidien
            <input
              type="time"
              value={draft.dailyAt}
              onChange={(e) => field("dailyAt", e.target.value)}
            />
          </label>
          <label>
            Fuseau des alertes
            <select
              value={draft.zone}
              onChange={(e) => field("zone", e.target.value)}
            >
              <option>America/Toronto</option>
              <option>Europe/Paris</option>
              <option>UTC</option>
            </select>
          </label>
          <label>
            Seuil (%)
            <input
              type="number"
              min={1}
              max={10000}
              value={draft.threshold}
              onChange={(e) => field("threshold", Number(e.target.value))}
            />
          </label>
          <label>
            Réarmement (%)
            <input
              type="number"
              min={0}
              max={9999}
              value={draft.resetBelow}
              onChange={(e) => field("resetBelow", Number(e.target.value))}
            />
          </label>
          <label>
            Qualité minimale (%)
            <input
              type="number"
              min={0}
              max={100}
              value={draft.minQuality}
              onChange={(e) => field("minQuality", Number(e.target.value))}
            />
          </label>
          <label>
            Association minimale du token
            <select
              value={draft.minAssociation}
              onChange={(e) =>
                field(
                  "minAssociation",
                  e.target.value as AlertRule["minAssociation"],
                )
              }
            >
              <option value="WEAK">Faible</option>
              <option value="PLAUSIBLE">Plausible</option>
              <option value="CONFIRMED">Confirmée</option>
            </select>
          </label>
          <label>
            Maximum d’alertes par heure
            <input
              type="number"
              min={1}
              max={100}
              value={draft.maxPerHour}
              onChange={(e) => field("maxPerHour", Number(e.target.value))}
            />
          </label>
          <label>
            Délai de récupération (secondes)
            <input
              type="number"
              min={0}
              max={86400}
              value={draft.cooldownSeconds}
              onChange={(e) => field("cooldownSeconds", Number(e.target.value))}
            />
          </label>
          <label>
            Regroupement immédiat (secondes)
            <input
              type="number"
              min={0}
              max={3600}
              value={draft.groupSeconds}
              onChange={(e) => field("groupSeconds", Number(e.target.value))}
            />
          </label>
          <label>
            Âge maximal à l’admission (secondes)
            <input
              type="number"
              min={60}
              max={86400}
              value={draft.maxAgeSeconds}
              onChange={(e) => field("maxAgeSeconds", Number(e.target.value))}
            />
          </label>
          <label>
            Début du silence
            <input
              type="time"
              value={draft.quiet.start}
              onChange={(e) =>
                field("quiet", { ...draft.quiet, start: e.target.value })
              }
            />
          </label>
          <label>
            Fin du silence
            <input
              type="time"
              value={draft.quiet.end}
              onChange={(e) =>
                field("quiet", { ...draft.quiet, end: e.target.value })
              }
            />
          </label>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.quiet.enabled}
            onChange={(e) =>
              field("quiet", { ...draft.quiet, enabled: e.target.checked })
            }
          />
          Activer les heures silencieuses
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => field("enabled", e.target.checked)}
          />
          Activer cette règle V2
        </label>
        <p>
          Mentions : 200 % = deux fois la moyenne d’une ligne de base complète.
          Liquidité/transactions : variation absolue ; quota : part consommée ;
          budget : plafond fixe à 100 %. Les autres types utilisent leurs
          conditions propres. #hashtag, $cashtag et chaîne:adresse sont acceptés
          ; plusieurs termes sont reliés par « ou ». Une personne en pause ne
          déclenche aucune alerte.
        </p>
        <button type="submit" disabled={!!initial.error || !!session.error}>
          Enregistrer l’alerte V2
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(defaultRule(crypto.randomUUID()));
              setTermsText("Nébula");
            }}
          >
            Annuler la modification
          </button>
        )}
      </form>
      <section aria-label="Règles d’alerte V2">
        <h3>Mes règles V2</h3>
        {store.rules.map((r) => (
          <article key={r.id}>
            <strong>{displayText(r.name)}</strong> · {kinds[r.kind]} ·{" "}
            {r.enabled ? "active" : "en pause"} · {r.delivery} · plafond{" "}
            {r.maxPerHour}/h{" "}
            <button
              onClick={() => {
                setDraft(r);
                setTermsText(r.terms.join(", "));
              }}
            >
              Modifier {r.name}
            </button>
            <button
              disabled={!!initial.error || !!session.error}
              onClick={() => {
                if (
                  save({
                    ...store,
                    rules: store.rules.map((a) =>
                      a.id === r.id ? { ...a, enabled: !a.enabled } : a,
                    ),
                  })
                )
                  setMessage(
                    "État de la règle enregistré ; les éléments en attente sont revérifiés à la prochaine évaluation.",
                  );
              }}
            >
              {r.enabled ? "Suspendre" : "Reprendre"} {r.name}
            </button>
          </article>
        ))}
      </section>
      <section aria-label="Notifications V2 dans l’application">
        <h3>Notifications dans l’application</h3>
        {store.rules.flatMap((r) =>
          (store.states[r.id]?.notifications ?? [])
            .filter(
              (n) =>
                historyVisible &&
                Date.parse(n.at) <= Date.parse(sessionAt(session.state)),
            )
            .map((n) => (
              <article className="alert-card" key={n.id}>
                <strong>
                  {displayText(r.name)} · {n.entryIds.length} observation(s)
                  regroupée(s)
                </strong>
                <p>
                  {date(n.at, r.zone)} · {n.read ? "Lue" : "Non lue"}
                </p>
                <details>
                  <summary>Voir les observations du résumé</summary>
                  {n.entryIds.map((id) => {
                    const e = store.states[r.id].entries.find(
                      (e) => e.id === id,
                    )!;
                    return (
                      <div key={id}>
                        <p>{displayText(e.reason)}</p>
                        <p>
                          {displayText(e.candidate.source)} ·{" "}
                          {date(e.candidate.at, r.zone)}
                        </p>
                        {candidateLinks(e.candidate).map((l) => (
                          <p key={l.href}>
                            <a href={l.href}>{l.label}</a>
                          </p>
                        ))}
                        {e.candidate.token && <p>{WARNING}</p>}
                      </div>
                    );
                  })}
                </details>
                <button
                  disabled={n.read || !!initial.error}
                  onClick={() =>
                    save({
                      ...store,
                      states: {
                        ...store.states,
                        [r.id]: feedback(
                          store.states[r.id],
                          n.id,
                          "read",
                          store.clock,
                        ),
                      },
                    })
                  }
                >
                  Marquer comme lue
                </button>
              </article>
            )),
        )}
        {(!historyVisible ||
          !Object.values(store.states).some((s) => s.notifications.length)) && (
          <p>Aucune notification livrée. Avancez l’horloge des alertes.</p>
        )}
      </section>
      <section aria-label="Historique des alertes V2">
        <h3>Décisions et observations</h3>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={suppressed}
            onChange={(e) => setSuppressed(e.target.checked)}
          />
          Afficher les décisions supprimées V2
        </label>
        {store.rules.flatMap((r) =>
          (store.states[r.id]?.entries ?? [])
            .filter(
              (e) =>
                historyVisible &&
                Date.parse(e.at) <= Date.parse(sessionAt(session.state)),
            )
            .filter((e) => suppressed || e.status !== "suppressed")
            .map((e) => (
              <article key={e.id} className="alert-card">
                <strong>{displayText(r.name)}</strong>
                <p>{displayText(e.reason)}</p>
                <p>
                  État :{" "}
                  {e.status === "false_positive"
                    ? "Faux positif signalé"
                    : e.status === "pending"
                      ? "En attente du résumé/regroupement"
                      : e.status === "suppressed"
                        ? `Supprimée : ${reasons[e.suppression!] ?? e.suppression}`
                        : e.status === "acknowledged"
                          ? "Lue"
                          : "Notifiée"}
                </p>
                <p>
                  Observé : {date(e.candidate.at, r.zone)}
                  <br />
                  Récupéré : {date(e.candidate.collectedAt, r.zone)}
                  <br />
                  Évalué : {date(e.at, r.zone)}
                </p>
                <p>
                  Source : {displayText(e.candidate.source)} ·{" "}
                  {displayText(e.candidate.sourceUrl)} · Qualité :{" "}
                  {e.candidate.quality} %
                </p>
                {e.dueAt && e.status === "pending" && (
                  <p>Échéance : {date(e.dueAt, r.zone)}</p>
                )}
                <div className="row">
                  {candidateLinks(e.candidate).map((l) => (
                    <a key={l.href} href={l.href}>
                      {l.label}
                    </a>
                  ))}
                  {e.status !== "suppressed" &&
                    e.status !== "false_positive" && (
                      <button
                        disabled={!!initial.error || !!session.error}
                        onClick={() => {
                          if (
                            save({
                              ...store,
                              states: {
                                ...store.states,
                                [r.id]: feedback(
                                  store.states[r.id],
                                  e.id,
                                  "false_positive",
                                  store.clock,
                                ),
                              },
                            })
                          )
                            setMessage(
                              "Faux positif enregistré sans supprimer la preuve.",
                            );
                        }}
                      >
                        Signaler un faux positif
                      </button>
                    )}
                </div>
                {e.candidate.token && <p className="notice">{WARNING}</p>}
              </article>
            )),
        )}
      </section>
    </section>
  );
}
