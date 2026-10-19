import { useDemoSession } from "./DemoSession";
import { sessionSource } from "../../../packages/demo/scenario";
import React, { useState } from "react";
import { useUrlFilters } from "./useUrlFilters";
import { filterHref } from "./navigation";
import {
  watchFilters,
  selectWatch,
  watchTokens,
  cleanText,
  attentionRises,
} from "./watch-model";
import { storageSchema } from "./People";
import { OpenChart } from "./TokenLink";
import { OpenX } from "./PublicationLink";
import { DEMO_EVENT_ID } from "../../../packages/events/model";
import { eventAt, demoEventSnapshot } from "../../../packages/events/demo-data";
import {
  initialSources,
  demoSourcesSchema,
  demoSource,
} from "../../../packages/sources/demo-data";
import { usd, percent, states } from "../../../packages/sources/model";
function readPeople() {
  try {
    const raw = localStorage.getItem("memeradar-demo-people-v2");
    if (raw && raw.length > 2000000) throw new Error();
    return {
      data: raw
        ? storageSchema.parse(JSON.parse(raw))
        : { people: [], categories: [] },
      error: "",
    };
  } catch {
    return {
      data: { people: [], categories: [] },
      error:
        "Personnes suivies illisibles : filtre et résumés indisponibles, données conservées.",
    };
  }
}
const date = (at: string, zone: string) =>
  new Intl.DateTimeFormat("fr-CA", {
    timeZone: zone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(at));
export function WatchPage({
  minute,
  zone,
  socialDisabled,
}: {
  minute: number;
  zone: string;
  socialDisabled: boolean;
}) {
  const session = useDemoSession();
  const url = useUrlFilters(),
    [people] = useState(readPeople);
  const parsed = watchFilters.safeParse(
    Object.fromEntries(
      [...url.params].filter(([k]) => k in watchFilters.shape),
    ),
  );
  const f = parsed.success ? parsed.data : watchFilters.parse({});
  const localState = url.params.get("watchState") ?? "normal";
  const state =
      session.state.fault !== "normal"
        ? session.state.fault
        : [
              "normal",
              "quota",
              "budget",
              "disconnect",
              "error",
              "unconfigured",
              "partial",
            ].includes(localState)
          ? "normal"
          : localState,
    rows =
      socialDisabled || state === "empty"
        ? []
        : selectWatch(f, minute, people.data.people).filter(
            (p) => !url.params.get("post") || p.id === url.params.get("post"),
          );
  const states: Record<string, string> = {
    normal: "Instantané disponible",
    loading: "Chargement",
    empty: "Aucune publication",
    error: "Erreur",
    unconfigured: "X non configuré",
    quota: "Quota épuisé",
    stale: "Données anciennes",
    partial: "Couverture partielle",
    budget: "Budget atteint",
    disconnect: "Flux déconnecté",
  };
  const messages: Record<string, string> = {
    loading: "Chargement simulé des publications locales…",
    error:
      "Erreur simulée : les données intégrées restent disponibles après réessai.",
    unconfigured: "Accès X non configuré. Aucun appel réseau n’a été tenté.",
    quota:
      "Quota X fictif épuisé (429). Nouvelle tentative suspendue ; consultez Sources et API.",
    stale:
      "Données anciennes : instantané fictif, aucune synchronisation en direct.",
    partial: "Données partielles : la couverture de X n’est pas exhaustive.",
    budget: "Budget strict fictif atteint : nouvelles collectes suspendues.",
    disconnect:
      "Flux déconnecté simulé : instantané conservé, aucune donnée en direct.",
  };
  const blocked =
    !(state in states) ||
    ["loading", "error", "unconfigured", "quota", "budget"].includes(state);
  return (
    <section aria-label="Veille X locale" className="watch-page">
      {url.params.get("post") && (
        <p>
          Publication sélectionnée : {url.params.get("post")} ·{" "}
          <button onClick={() => url.set("post", "")}>
            Voir tout l’extrait
          </button>
        </p>
      )}
      <p className="notice">
        DÉMO — Publications inventées, recherche locale uniquement. Aucun appel
        à X ni dépense. Les filtres de ce jeu de publications sont conservés
        dans l’URL.
      </p>
      {people.error && <p role="alert">{people.error}</p>}
      <label>
        État de la veille démo
        <select
          value={state}
          onChange={(e) => {
            url.set(
              "watchState",
              ["loading", "empty", "stale"].includes(e.target.value)
                ? e.target.value
                : "",
            );
            session.setFault(
              [
                "quota",
                "budget",
                "disconnect",
                "error",
                "unconfigured",
                "partial",
              ].includes(e.target.value)
                ? (e.target.value as typeof session.state.fault)
                : "normal",
            );
          }}
        >
          {Object.entries(states).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <form
        className="panel form-grid"
        aria-label="Filtres de la veille X"
        onSubmit={(e) => e.preventDefault()}
      >
        <label>
          Mot-clé de la veille
          <input
            value={f.q}
            maxLength={300}
            onChange={(e) => url.set("q", e.target.value)}
          />
        </label>
        <label>
          Période observée
          <select
            value={f.period}
            onChange={(e) => url.set("period", e.target.value)}
          >
            <option value="all">Tout le rejeu</option>
            <option value="15">15 dernières minutes simulées</option>
            <option value="60">60 dernières minutes simulées</option>
          </select>
        </label>
        <label>
          Personne suivie
          <select
            value={f.personFilter}
            onChange={(e) => url.set("personFilter", e.target.value)}
          >
            <option value="">Toutes les personnes</option>
            {people.data.people.map((p) => (
              <option key={p.id} value={p.id}>
                @{p.username}
              </option>
            ))}
          </select>
        </label>
        <label>
          Catégorie suivie
          <select
            value={f.categoryFilter}
            onChange={(e) => url.set("categoryFilter", e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {people.data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hashtag exact
          <input
            value={f.tag}
            maxLength={100}
            onChange={(e) => url.set("tag", e.target.value)}
          />
        </label>
        <label>
          Événement associé
          <select
            value={f.eventFilter}
            onChange={(e) => url.set("eventFilter", e.target.value)}
          >
            <option value="">Tous les événements</option>
            <option value={DEMO_EVENT_ID}>Nébula Mobile</option>
          </select>
        </label>
        <label>
          Blockchain mentionnée
          <select
            value={f.chain}
            onChange={(e) => url.set("chain", e.target.value)}
          >
            {["Toutes", "Base", "Solana"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Qualité des publications
          <select
            value={f.quality}
            onChange={(e) => url.set("quality", e.target.value)}
          >
            <option value="all">Toutes, absences visibles</option>
            <option value="dated">Date de publication connue</option>
            <option value="metrics">Toutes les métriques connues</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            location.hash = filterHref(
              location.hash,
              Object.fromEntries(
                Object.keys(watchFilters.shape).map((k) => [k, null]),
              ),
            );
          }}
        >
          Effacer les filtres de veille
        </button>
      </form>
      {!parsed.success ? (
        <p role="alert">
          Filtres invalides. Effacez les filtres pour retrouver la vue ; aucun
          appel réseau.
        </p>
      ) : (
        <>
          <p className="small muted">
            Période calculée depuis {date(eventAt(minute), zone)} ·{" "}
            {eventAt(minute)} (UTC). Blockchain : seules les adresses complètes
            reconnues sont retenues, jamais un nom ou symbole. Les niveaux de
            risque et d’association se filtrent sur la page Tokens détectés.
          </p>
          {!(state in states) && (
            <p role="alert">État de veille invalide dans le lien.</p>
          )}
          {messages[state] && (
            <section
              className="notice"
              role={state === "error" ? "alert" : "status"}
            >
              <p>{messages[state]}</p>
              {["error", "loading"].includes(state) && (
                <button onClick={() => url.set("watchState", "normal")}>
                  Afficher l’instantané local
                </button>
              )}
              <a href="#page=sources">Voir Sources et API</a>
            </section>
          )}
          {socialDisabled && (
            <p role="status">
              Source sociale exclue : réactivez-la dans Sources et API pour
              afficher les publications.
            </p>
          )}
          {!blocked && (
            <>
              <p role="status">
                {rows.length} publications dans cet extrait fictif.
                Republications identifiées séparément.
              </p>
              <div className="watch-feed">
                {rows.map((p) => (
                  <article className="panel" key={p.id}>
                    <h2>{cleanText(p.author?.name ?? "Auteur non fourni")}</h2>
                    <p>
                      {p.author
                        ? `@${cleanText(p.author.username)}`
                        : "Profil inconnu"}{" "}
                      ·{" "}
                      <span className="badge">
                        {
                          {
                            original: "Original",
                            reply: "Réponse",
                            quote: "Citation",
                            repost: "Republication",
                            unknown: "Type inconnu",
                          }[p.type]
                        }
                      </span>
                    </p>
                    <p>{cleanText(p.text)}</p>
                    <p>
                      Publié :{" "}
                      {p.publishedAt ? date(p.publishedAt, zone) : "inconnu"} ·
                      Collecté : {date(p.collectedAt, zone)}{" "}
                      <span className="small">({p.collectedAt} UTC)</span>
                    </p>
                    <p>
                      J’aime : {p.metrics.likes ?? "inconnus"} · Réponses :{" "}
                      {p.metrics.replies ?? "inconnues"}. Les métriques absentes
                      ne valent pas zéro.
                    </p>
                    <div className="row wrap">
                      <OpenX id={p.id} origin={p.dataOrigin} />
                      {p.conversationId && (
                        <a
                          className="chart-open"
                          href={`#page=conversations&conversation=${p.conversationId}`}
                        >
                          Voir la conversation fictive
                        </a>
                      )}
                      <a href={`#page=events&event=${DEMO_EVENT_ID}`}>
                        Voir l’événement
                      </a>
                      {watchTokens(p.text).map((t) => (
                        <OpenChart
                          key={t.id}
                          chain={t.chain}
                          address={t.address}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              {!rows.length && (
                <section className="panel">
                  <h2>Aucune publication correspondante</h2>
                  <p>
                    Élargissez la période ou effacez les filtres. Une absence
                    dans cet extrait ne prouve pas une absence d’activité sur X.
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
export function DashboardV2({
  minute,
  zone,
  socialDisabled,
}: {
  minute: number;
  zone: string;
  socialDisabled: boolean;
}) {
  const session = useDemoSession();
  const [people] = useState(readPeople),
    [connection] = useState(() => {
      try {
        const raw = localStorage.getItem("memeradar-demo-sources-phase11-v1");
        if (raw && raw.length > 200000) throw new Error();
        return {
          s: raw ? demoSourcesSchema.parse(JSON.parse(raw)) : initialSources(),
          error: "",
        };
      } catch {
        return {
          s: initialSources(),
          error:
            "Diagnostics illisibles : état X et budget inconnus, données conservées.",
        };
      }
    });
  const x = demoSource(
      { ...connection.s, ...sessionSource(session.state) },
      "x",
    ),
    last = selectWatch({}, minute, people.data.people)
      .filter((p) =>
        people.data.people.some(
          (a) => a.xUserId === p.authorId && a.status === "active",
        ),
      )
      .slice(0, 3),
    snapshot = demoEventSnapshot(minute, socialDisabled);
  return (
    <section aria-label="Synthèse de la veille X" className="panel">
      <h2>Votre veille X</h2>
      <p>
        Données et budgets fictifs. Résumés calculés à l’ouverture de cette
        page.
      </p>
      {connection.error ? (
        <p role="alert">{connection.error}</p>
      ) : (
        <p>
          État X : {states[x.state]} · Engagement quotidien :{" "}
          {usd(x.balances[0].spent_micros)} / {usd(x.balances[0].limit_micros)}{" "}
          (
          {percent(x.balances[0].spent_micros, x.balances[0].limit_micros) ??
            "indéfini"}{" "}
          %). <a href="#page=sources">Examiner l’état et le budget</a>
        </p>
      )}
      <h3>Dernières publications des personnes actives</h3>
      {people.error && <p role="alert">{people.error}</p>}
      {socialDisabled ? (
        <p>Source sociale exclue : résumé indisponible.</p>
      ) : last.length ? (
        last.map((p) => (
          <p key={p.id}>
            {cleanText(p.author?.name ?? "Auteur inconnu")} :{" "}
            {cleanText(p.text)}{" "}
            <time dateTime={p.collectedAt}>{date(p.collectedAt, zone)}</time>
          </p>
        ))
      ) : (
        <p>
          Aucune publication correspondante.{" "}
          <a href="#page=people">Ajouter ou activer une personne</a>.
        </p>
      )}
      <h3>Mentions en hausse</h3>
      {attentionRises(snapshot).length ? (
        attentionRises(snapshot).map((b) => (
          <p key={b.start}>
            Nébula Mobile · T+{b.relativeMinutes} min : {b.mentions} mentions,{" "}
            {b.multiplier} × la ligne de base dans une tranche documentée.
          </p>
        ))
      ) : (
        <p>
          Aucune tranche comparable atteignant deux fois la ligne de base à cet
          instant.
        </p>
      )}
      <p>
        La comparaison nécessite une ligne de base et une couverture
        comparables. Les trous de collecte ne sont pas interprétés comme une
        baisse.
      </p>
      <a className="chart-open" href={`#page=events&event=${DEMO_EVENT_ID}`}>
        Consulter les mentions et la couverture Nébula
      </a>
      <p>
        {snapshot.posts.length} publications associées observées dans le
        scénario ; ce nombre seul n’établit pas une hausse.
      </p>
      <a className="chart-open" href="#page=watch">
        Ouvrir la veille X
      </a>
    </section>
  );
}
