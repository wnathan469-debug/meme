import { useDemoSession } from "./DemoSession";
import { sessionSource } from "../../../packages/demo/scenario";
import React, { useEffect, useState } from "react";
import {
  providers,
  states,
  settingsSchema,
  usd,
  parseUsd,
  percent,
  type ProviderId,
  type ProviderSettings,
} from "../../../packages/sources/model";
import {
  initialSources,
  demoSourcesSchema,
  demoSource,
  saveDemoSettings,
  checkDemoProbe,
  confirmDemoProbe,
  type DemoSources,
} from "../../../packages/sources/demo-data";
import { ProviderError, type ErrorCode } from "../../../packages/shared/errors";
import { displayText } from "../../../packages/charts/model";
const key = "memeradar-demo-sources-phase11-v1";
function load() {
  const text = localStorage.getItem(key);
  if (!text) return initialSources();
  if (text.length > 200000) throw new Error();
  return demoSourcesSchema.parse(JSON.parse(text));
}
export function SourcesV2({ zone }: { zone: string }) {
  const [initial] = useState(() => {
    try {
      return { s: load(), error: "" };
    } catch {
      return {
        s: initialSources(),
        error:
          "Stockage Sources et API illisible : fichier conservé, modifications désactivées.",
      };
    }
  });
  const session = useDemoSession();
  const [stored, setS] = useState<DemoSources>(initial.s);
  const s: DemoSources = { ...stored, ...sessionSource(session.state) };
  const [message, setMessage] = useState(initial.error),
    [draft, setDraft] = useState<Record<ProviderId, ProviderSettings>>({
      x: s.entries.x.settings,
      gecko: s.entries.gecko.settings,
      goplus: s.entries.goplus.settings,
    }),
    [quote, setQuote] = useState<{
      provider: ProviderId;
      ceiling: string;
      revision: number;
      expiresAt: number;
    } | null>(null);
  useEffect(() => setQuote(null), [session.state.minute, session.state.fault]);
  const date = (at: string | null) =>
    at
      ? `${new Intl.DateTimeFormat("fr-CA", { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(at))} (${zone}) · ${at} UTC`
      : "Non disponible";
  function save(next: DemoSources) {
    if (initial.error) return false;
    try {
      const valid = demoSourcesSchema.parse(next);
      localStorage.setItem(key, JSON.stringify(valid));
      setS(valid);
      return true;
    } catch {
      setMessage("Enregistrement impossible ; données précédentes conservées.");
      return false;
    }
  }
  function prepare(p: ProviderId) {
    try {
      setQuote({
        provider: p,
        ceiling: checkDemoProbe(s, p),
        revision: s.entries[p].revision,
        expiresAt: Date.now() + 120000,
      });
      setMessage(
        "Devis prêt : aucun appel n’a été effectué. Confirmez explicitement pour simuler le test.",
      );
    } catch (e) {
      setQuote(null);
      setMessage(e instanceof Error ? e.message : "Test indisponible.");
    }
  }
  function confirm(p: ProviderId) {
    const q = quote;
    setQuote(null);
    if (
      !q ||
      q.provider !== p ||
      q.revision !== s.entries[p].revision ||
      q.expiresAt <= Date.now()
    ) {
      setMessage(
        "Devis expiré ou réglages modifiés : préparez un nouveau test.",
      );
      return;
    }
    try {
      if (save(confirmDemoProbe(s, p)))
        setMessage(
          "Test démo enregistré : zéro requête réelle et zéro dépense réelle.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Test refusé.");
    }
  }
  const set = (p: ProviderId, next: ProviderSettings) =>
    setDraft({ ...draft, [p]: next });
  return (
    <section className="sources-v2" aria-label="Sources et API V2">
      <h2>Sources et API</h2>
      <p className="notice">
        DÉMO — États, quotas, prix et coûts entièrement fictifs. Aucun secret à
        saisir. Les tests ci-dessous ne contactent aucun fournisseur.
      </p>
      <label>
        État des API démo
        <select
          value={s.scenario}
          disabled={!!initial.error || !!session.error}
          onChange={(e) => {
            setQuote(null);
            if (
              save({
                ...s,
                scenario: e.target.value as DemoSources["scenario"],
              })
            )
              session.setFault(e.target.value as DemoSources["scenario"]);
          }}
        >
          <option value="normal">Fonctionnement normal</option>
          <option value="quota">Quota épuisé · 429</option>
          <option value="budget">Budget atteint</option>
          <option value="disconnect">Flux déconnecté</option>
          <option value="error">Fournisseur en erreur</option>
          <option value="unconfigured">X non configuré</option>
        </select>
      </label>
      <p>
        Chaque état charge un instantané fictif ; aucun diagnostic réel n’en est
        déduit. Heure du scénario : {date(s.clock)}.
      </p>
      <button
        disabled={!!initial.error || !!session.error}
        onClick={() => {
          setQuote(null);
          if (session.state.minute <= 4318)
            session.setMinute(session.state.minute + 2);
        }}
      >
        Avancer les diagnostics de deux minutes
      </button>
      {message && <p role="status">{message}</p>}
      <div className="source-admin-grid">
        {(Object.keys(providers) as ProviderId[]).map((p) => {
          const v = demoSource(s, p),
            d = draft[p];
          return (
            <section
              className="panel"
              key={p}
              aria-label={`Fournisseur ${providers[p].name}`}
            >
              <h3>{providers[p].name} · DÉMO</h3>
              <strong>{states[v.state]}</strong>
              <p>{v.reason}</p>
              <p>
                Mode configuré :{" "}
                {v.collectionMode === "polling"
                  ? "interrogation périodique"
                  : "lecture explicite"}
                . Ce mode n’indique pas qu’un collecteur réel fonctionne.
              </p>
              <p>
                Dernière réussite : {date(v.lastSuccess)}
                <br />
                Dernière erreur : {date(v.lastError)}
                <br />
                Attente : {date(v.blockedUntil)}
              </p>
              <form
                aria-label={`Réglages ${providers[p].name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    const data = new FormData(e.currentTarget);
                    const candidate =
                      p === "x"
                        ? {
                            ...d,
                            budget: {
                              ...d.budget,
                              daily: parseUsd(String(data.get("daily"))),
                              monthly: parseUsd(String(data.get("monthly"))),
                            },
                          }
                        : d;
                    const next = saveDemoSettings(
                      s,
                      p,
                      settingsSchema.parse(candidate),
                    );
                    setQuote(null);
                    if (save(next))
                      setMessage(
                        "Réglages enregistrés. Les priorités modifiées s’appliquent aux règles de ce groupe.",
                      );
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "Réglages invalides.",
                    );
                  }
                }}
              >
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    disabled={!!initial.error || !!session.error}
                    onChange={(e) =>
                      set(p, { ...d, enabled: e.target.checked })
                    }
                  />
                  Activer {providers[p].name}
                </label>
                {p === "x" && (
                  <>
                    <p>
                      Plafonds USD, six décimales maximum. Refus si le nouveau
                      plafond est inférieur aux engagements, réservations en
                      cours incluses.
                    </p>
                    <div className="form-grid">
                      <label>
                        Plafond quotidien X (USD)
                        <input
                          name="daily"
                          defaultValue={
                            (BigInt(d.budget.daily) / 1000000n).toString() +
                            "." +
                            String(BigInt(d.budget.daily) % 1000000n).padStart(
                              6,
                              "0",
                            )
                          }
                          inputMode="decimal"
                          required
                          onChange={(e) => {
                            try {
                              set(p, {
                                ...d,
                                budget: {
                                  ...d.budget,
                                  daily: parseUsd(e.target.value),
                                },
                              });
                            } catch {
                              setMessage(
                                "Montant USD invalide : au plus six décimales.",
                              );
                            }
                          }}
                        />
                      </label>
                      <label>
                        Plafond mensuel X (USD)
                        <input
                          name="monthly"
                          defaultValue={
                            (BigInt(d.budget.monthly) / 1000000n).toString() +
                            "." +
                            String(
                              BigInt(d.budget.monthly) % 1000000n,
                            ).padStart(6, "0")
                          }
                          inputMode="decimal"
                          required
                          onChange={(e) => {
                            try {
                              set(p, {
                                ...d,
                                budget: {
                                  ...d.budget,
                                  monthly: parseUsd(e.target.value),
                                },
                              });
                            } catch {
                              setMessage(
                                "Montant USD invalide : au plus six décimales.",
                              );
                            }
                          }}
                        />
                      </label>
                      <label>
                        Avertissement à (%)
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={d.budget.warningPercent}
                          onChange={(e) =>
                            set(p, {
                              ...d,
                              budget: {
                                ...d.budget,
                                warningPercent: Number(e.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    </div>
                    <details>
                      <summary>Fréquences par priorité</summary>
                      <p>
                        Modifier une priorité applique sa fréquence aux règles
                        actuelles de ce groupe et au choix par défaut des
                        nouvelles règles. Les limites minimales de l’hôte et du
                        fournisseur restent applicables.
                      </p>
                      {(["critical", "high", "normal", "low"] as const).map(
                        (priority, i) => (
                          <label key={priority}>
                            {["Critique", "Haute", "Normale", "Basse"][i]}{" "}
                            (secondes)
                            <input
                              type="number"
                              min={60}
                              max={86400}
                              value={d.priorities[priority]}
                              onChange={(e) =>
                                set(p, {
                                  ...d,
                                  priorities: {
                                    ...d.priorities,
                                    [priority]: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        ),
                      )}
                    </details>
                  </>
                )}
                <details>
                  <summary>Durées du cache</summary>
                  <p>
                    Ces durées ne changent pas la date des observations. Elles
                    ne transforment aucune donnée ancienne en donnée fraîche.
                  </p>
                  {(p === "x"
                    ? ["posts", "profiles"]
                    : p === "gecko"
                      ? ["market"]
                      : ["risks"]
                  ).map((type) => (
                    <label key={type}>
                      {
                        (
                          {
                            posts: "Devis de recherche X",
                            profiles: "Profils X",
                            market: "Marché",
                            risks: "Risques",
                          } as Record<string, string>
                        )[type]
                      }{" "}
                      (secondes)
                      <input
                        type="number"
                        min={type === "posts" ? 60 : 0}
                        max={
                          type === "profiles" || type === "risks"
                            ? 300
                            : type === "posts"
                              ? 3600
                              : 86400
                        }
                        value={d.cache[type as keyof typeof d.cache]}
                        onChange={(e) =>
                          set(p, {
                            ...d,
                            cache: {
                              ...d.cache,
                              [type]: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </details>
                <button
                  type="submit"
                  disabled={!!initial.error || !!session.error}
                >
                  Enregistrer les réglages {providers[p].name}
                </button>
              </form>
              <h4>Consommation observée · périodes UTC</h4>
              <p>
                Jour : {v.day.calls} appels/tentatives,{" "}
                {v.day.posts ?? "publication : sans objet"}
                {p === "x" ? " publications récupérées" : ""}. Mois :{" "}
                {v.month.calls} appels/tentatives,{" "}
                {v.month.posts ?? "publications : sans objet"}.
              </p>
              <p>
                {p === "x"
                  ? `Coût estimé du jour : ${usd(v.day.cost!)} ; du mois : ${usd(v.month.cost!)}.`
                  : "Coût non mesuré : appels publics sans authentification ; aucun tarif payant n’est garanti."}{" "}
                Estimation, à vérifier dans le tableau de bord du fournisseur.
              </p>
              {p === "x" && (
                <>
                  <p>
                    Comptage partiel : {v.day.unknown_posts} tentative(s) du
                    jour sans nombre de publications établi. Réservations
                    incluses ci-dessous, distinctes des coûts réglés.
                  </p>
                  {v.balances.map((b) => (
                    <p key={b.budget_key}>
                      {b.budget_key.startsWith("day:")
                        ? "Engagement quotidien"
                        : "Engagement mensuel"}{" "}
                      : {usd(b.spent_micros)} / {usd(b.limit_micros)} ·{" "}
                      {percent(b.spent_micros, b.limit_micros) ??
                        "pourcentage indéfini (plafond zéro)"}{" "}
                      %{" "}
                      {BigInt(b.spent_micros) >= BigInt(b.limit_micros)
                        ? "· plafond atteint, appels payants bloqués"
                        : ""}
                    </p>
                  ))}
                  <p>
                    Tarif fictif USD : requête {usd(v.pricing!.request)},
                    publication {usd(v.pricing!.post)}, utilisateur{" "}
                    {usd(v.pricing!.user)}. Référence fictive :{" "}
                    {date(v.pricing!.verifiedAt)}.
                  </p>
                  {Object.entries(v.settings.budget.features).map(
                    ([feature, cap]) => (
                      <p key={feature}>
                        Plafond par fonction {feature} : {usd(cap!.daily)} /
                        jour et {usd(cap!.monthly)} / mois ; plafond global
                        également applicable.
                      </p>
                    ),
                  )}
                </>
              )}
              <h4>Quotas et journal nettoyé</h4>
              {v.diagnostics.map((log) => (
                <article key={log.id}>
                  <p>
                    {date(log.at)} · point de terminaison : {log.endpoint} ·
                    HTTP {log.status ?? "non reçu"}
                  </p>
                  <p>
                    {log.code
                      ? `${log.code} — ${new ProviderError(log.code as ErrorCode).message}`
                      : "Réponse de test observée (fictive)."}
                  </p>
                  {log.quota && (
                    <p>
                      Quota : {log.quota.remaining ?? "inconnu"} /{" "}
                      {log.quota.limit ?? "inconnu"} restant(s),
                      réinitialisation {date(log.quota.resetAt)}.
                    </p>
                  )}
                </article>
              ))}
              {v.capabilities && (
                <details open>
                  <summary>Capacités X — observations fictives</summary>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Capacité</th>
                          <th>État</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(v.capabilities).map(([name, c]) => (
                          <tr key={name}>
                            <td>{name}</td>
                            <td>
                              {
                                (
                                  {
                                    available: "Disponible",
                                    limited: "Limitée",
                                    unavailable: "Indisponible",
                                    untested: "Non testée",
                                  } as Record<string, string>
                                )[c.state]
                              }
                            </td>
                            <td>{date(c.observedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    Une capacité disponible ne garantit pas l’accès aux comptes
                    protégés, aux données supprimées ou à l’ensemble de X.
                  </p>
                </details>
              )}
              <button
                disabled={!!initial.error || !!session.error}
                onClick={() => prepare(p)}
              >
                Préparer le test {providers[p].name}
              </button>
              {quote?.provider === p && (
                <div
                  className="notice"
                  role="region"
                  aria-label={`Devis du test ${providers[p].name}`}
                >
                  <p>
                    Maximum fictif : {usd(quote.ceiling)} · une requête,{" "}
                    {p === "x"
                      ? "au plus un profil utilisateur, aucune publication"
                      : "métadonnées publiques uniquement"}
                    . Zéro requête réelle et zéro dépense réelle en démo. Devis
                    valable deux minutes, à usage unique.
                  </p>
                  <button onClick={() => confirm(p)}>
                    Confirmer le test démo {providers[p].name}
                  </button>
                  <button onClick={() => setQuote(null)}>
                    Annuler le test
                  </button>
                </div>
              )}
              <p>
                Attente progressive avec gigue et coupe-circuit partagés ; 429
                et réinitialisations respectés. Une nouvelle tentative est
                contrôlée, jamais une boucle de test automatique. Une requête
                déjà envoyée peut rester facturée.
              </p>
              <p>
                <a
                  href={providers[p].docs}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Documentation {providers[p].name}
                </a>{" "}
                ·{" "}
                <a
                  href={providers[p].terms}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Conditions {providers[p].name}
                </a>
              </p>
            </section>
          );
        })}
      </div>
      <section className="panel" aria-label="Fréquences par règle X">
        <h3>Fréquences des règles X fictives</h3>
        <p>
          Règles locales de ce scénario, distinctes des brouillons des autres
          vues. Changer la fréquence ne réactive pas une règle en pause.
        </p>
        {s.rules.map((r) => (
          <label key={r.id}>
            {displayText(r.name)} · {r.priority}
            <input
              aria-label={`Fréquence ${r.name}`}
              type="number"
              min={60}
              max={86400}
              disabled={!!initial.error || !!session.error}
              value={r.seconds}
              onChange={(e) => {
                const seconds = Number(e.target.value);
                if (
                  Number.isInteger(seconds) &&
                  seconds >= 60 &&
                  seconds <= 86400
                )
                  save({
                    ...s,
                    rules: s.rules.map((a) =>
                      a.id === r.id ? { ...a, seconds } : a,
                    ),
                  });
              }}
            />{" "}
            secondes
          </label>
        ))}
      </section>
    </section>
  );
}
