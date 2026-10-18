import { SourcesV2 } from "./SourcesV2";
import { AlertsV2 } from "./AlertsV2";
import { OpenChart } from "./TokenLink";
import { SocialProofs } from "./SocialProofs";
import { EVENT_TITLE as V2_EVENT_TITLE } from "../../../packages/events/model";
import {
  EventInsights,
  EventFeatureCard,
  EventAlertDrafts,
  EventAlertForm,
} from "./EventInsights";
import { Conversations } from "./Conversations";
import { demoConversationId } from "../../../packages/conversations/demo-data";
import { People } from "./People";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  events,
  tokens,
  sources,
  initialAlerts,
  at,
} from "../../../packages/core/demo";
import {
  WARNING,
  RISK_WARNING,
  LABELS,
  INDICATOR_LABELS,
  associate,
  indicators,
  replayAlerts,
} from "../../../packages/core/domain";
import type {
  DemoAlert,
  Event,
  Token,
  Indicator,
  Metric,
} from "../../../packages/core/domain";
import { defaultState, loadState, persistState, ruleSchema } from "./state";
import type { SavedState } from "./state";
import "./style.css";
const TokenAnalysis = React.lazy(() =>
  import("./TokenAnalysis").then((m) => ({ default: m.TokenAnalysis })),
);

type Page =
  | "dashboard"
  | "events"
  | "tokens"
  | "alerts"
  | "sources"
  | "settings"
  | "people"
  | "conversations"
  | "analysis";
const navigation: { id: Page; icon: string; label: string }[] = [
  { id: "dashboard", icon: "◈", label: "Tableau de bord" },
  { id: "events", icon: "◎", label: "Événements" },
  { id: "tokens", icon: "⬡", label: "Tokens détectés" },
  { id: "analysis", icon: "▥", label: "Analyse token" },
  { id: "alerts", icon: "♧", label: "Alertes" },
  { id: "conversations", icon: "◌", label: "Conversations" },
  { id: "people", icon: "♙", label: "Personnes suivies" },
  { id: "sources", icon: "◫", label: "Sources et API" },
  { id: "settings", icon: "⚙", label: "Paramètres" },
];
function readRoute() {
  const hash = location.hash.slice(1);
  const params = new URLSearchParams(
    hash.startsWith("/tokens") ? (hash.split("?")[1] ?? "") : hash,
  );
  const raw = params.get("page");
  const chartPath = location.hash.slice(1).startsWith("/tokens")
    ? location.hash.slice(1).split("?")[0]
    : null;
  return {
    chartPath,
    page: chartPath
      ? ("analysis" as Page)
      : navigation.some((n) => n.id === raw)
        ? (raw as Page)
        : "dashboard",
    query: params.get("q") ?? "",
    chain: params.get("chain") ?? "Toutes",
    confidence: params.get("confidence") ?? "Tous",
    event: chartPath ? null : params.get("event"),
    token: chartPath ? null : params.get("token"),
    conversation: chartPath ? null : params.get("conversation"),
  };
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Origin() {
  return <Badge tone="demo">DÉMO</Badge>;
}
function DemoLink({ url }: { url: string }) {
  return (
    <span className="source-url" title={`${url} — lien fictif désactivé`}>
      {url} <span aria-label="lien fictif">↗</span>
    </span>
  );
}
function Time({ iso, zone }: { iso: string; zone: string }) {
  return (
    <time dateTime={iso} title={iso}>
      {new Intl.DateTimeFormat("fr-CA", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))}
    </time>
  );
}
function Chart({ values, minute }: { values: number[]; minute: number }) {
  const shown = values.slice(0, Math.floor(minute / 5) + 1);
  const max = Math.max(130, ...values);
  const points = shown
    .map((v, i) => `${20 + (i * 720) / 24},${142 - (v / max) * 120}`)
    .join(" ");
  return (
    <div className="chart">
      <svg
        viewBox="0 0 760 175"
        role="img"
        aria-label={`Mentions fictives sur ${minute} minutes ; dernière tranche : ${shown.at(-1) ?? 0}`}
      >
        {[20, 70, 120].map((y) => (
          <line key={y} x1="20" x2="740" y1={y} y2={y} className="grid-line" />
        ))}
        <polygon
          points={`20,142 ${points} ${20 + ((shown.length - 1) * 720) / 24},142`}
          className="chart-area"
        />
        <polyline points={points} className="chart-line" />
        {[0, 30, 60, 90, 120].map((v) => (
          <text key={v} x={20 + v * 6} y="169" textAnchor="middle">
            {v} min
          </text>
        ))}
      </svg>
    </div>
  );
}
function Money({ metric, minute }: { metric: Metric; minute: number }) {
  if (metric.value === null || minute < 60)
    return (
      <span
        className="missing"
        title={
          minute < 60
            ? "Observation disponible à T+60 min"
            : metric.missing_reason
        }
      >
        Non disponible
      </span>
    );
  const display = metric.value.includes(".")
    ? metric.value.replace(".", ",") + " $"
    : new Intl.NumberFormat("fr-CA").format(Number(metric.value)) + " $";
  return (
    <span
      title={`${metric.source} · ${metric.observed_at} · valeur exacte ${metric.value}`}
    >
      {display}
    </span>
  );
}
function App() {
  const [route, setRoute] = useState(readRoute);
  const [saved, setSaved] = useState<SavedState>(defaultState);
  const [ready, setReady] = useState(false),
    [warning, setWarning] = useState(""),
    [notice, setNotice] = useState("");
  const [minute, setMinute] = useState(60),
    [playing, setPlaying] = useState(false),
    [tab, setTab] = useState<"history" | "rules">("history");
  const [showSuppressed, setShowSuppressed] = useState(false),
    [newWatch, setNewWatch] = useState("");
  const [ruleDraft, setRuleDraft] = useState(defaultState.rule);
  const saveQueue = useRef(Promise.resolve());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    loadState().then((result) => {
      setSaved(result.state);
      setRuleDraft(result.state.rule);
      setWarning(result.warning ?? "");
      setReady(true);
    });
  }, []);
  useEffect(() => {
    const listener = () => setRoute(readRoute());
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = saved.theme;
  }, [saved.theme]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () =>
        setMinute((value) => {
          if (value >= 120) {
            setPlaying(false);
            return 120;
          }
          return Math.min(120, value + 5);
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [playing]);
  const go = (page: Page, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams({ page, ...extra });
    location.hash = params.toString();
  };
  const filter = (key: string, value: string) => {
    if (route.chartPath) {
      const p = new URLSearchParams(location.hash.split("?")[1] ?? "");
      if (value) p.set(key, value);
      else p.delete(key);
      location.hash = route.chartPath + (p.size ? "?" + p.toString() : "");
      return;
    }
    const params = new URLSearchParams(location.hash.slice(1));
    params.set("page", route.page);
    if (value) params.set(key, value);
    else params.delete(key);
    location.hash = params.toString();
  };
  const change = (next: SavedState) => {
    if (warning) {
      setNotice(
        "Réinitialisez les préférences dans les paramètres avant de remplacer le fichier conservé.",
      );
      return;
    }
    setSaved(next);
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => persistState(next))
      .then(() => setNotice("Préférences enregistrées sur cet appareil."))
      .catch(() =>
        setNotice(
          "Échec de l’enregistrement. Vos modifications restent disponibles pour cette session.",
        ),
      );
  };
  const event = events.find((e) => e.id === route.event);
  const token = tokens.find((t) => t.id === route.token);
  const selected = token ? events.find((e) => e.id === token.event_id) : event;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if ((event || token) && !dialog.open) {
      lastFocus.current = document.activeElement as HTMLElement;
      dialog.showModal();
    }
    if (!event && !token && dialog.open) {
      dialog.close();
      lastFocus.current?.focus();
    }
  }, [event, token, ready]);
  const close = () => {
    const params = new URLSearchParams(location.hash.slice(1));
    params.delete("event");
    params.delete("token");
    location.hash = params.toString();
  };
  const allAlerts = useMemo(
    () =>
      [
        ...initialAlerts.filter((a) => a.minute <= minute),
        ...replayAlerts(events, saved.rule, minute),
      ].sort((a, b) => b.minute - a.minute || a.id.localeCompare(b.id)),
    [minute, saved.rule],
  );
  const visibleAlerts = allAlerts.filter(
    (a) => showSuppressed || !a.suppressed,
  );
  const totalMentions = events.reduce(
    (sum, e) =>
      sum +
      e.mentions
        .slice(0, Math.floor(minute / 5) + 1)
        .reduce((a, b) => a + b, 0),
    0,
  );
  const filteredEvents = events.filter((e) =>
    `${e.title} ${e.category}`
      .toLowerCase()
      .includes(route.query.toLowerCase()),
  );
  const filteredTokens = tokens.filter(
    (t) =>
      `${t.name} ${t.symbol} ${t.address}`
        .toLowerCase()
        .includes(route.query.toLowerCase()) &&
      (route.chain === "Toutes" || t.chain === route.chain) &&
      (route.confidence === "Tous" || associate(t).level === route.confidence),
  );
  const socialDisabled = saved.disabledSources.includes("social");
  const chartValues = events[0].mentions.map((_, i) =>
    events.reduce((s, e) => s + e.mentions[i], 0),
  );
  const sourceAvailable = (item: Event["items"][number]) =>
    !saved.disabledSources.includes(
      item.tier === "A" ? "press" : item.tier === "B" ? "media" : "social",
    );
  const eventCard = (e: Event) => (
    <button
      key={e.id}
      className="event-card"
      onClick={() => go("events", { event: e.id })}
    >
      <div className="row">
        <span className={`event-icon ${e.id}`}>
          {e.id === "tesla" ? "↗" : e.id === "nebula" ? "✦" : "⚑"}
        </span>
        <Origin />
        <span className="muted right">{e.category}</span>
      </div>
      <h3>{e.title}</h3>
      <p>{e.summary.split(". ")[0]}.</p>
      <div className="card-bottom">
        <span>
          <i className="dot" />{" "}
          {socialDisabled
            ? "Attention partielle"
            : `${e.mentions[Math.floor(minute / 5)]} mentions / 5 min`}
        </span>
        <span>{tokens.filter((t) => t.event_id === e.id).length} tokens →</span>
      </div>
    </button>
  );
  const alertCard = (a: DemoAlert) => (
    <article
      key={a.id}
      className={`alert-card ${a.suppressed ? "suppressed" : ""}`}
    >
      <span className="alert-symbol">{a.suppressed ? "⊘" : "!"}</span>
      <div className="grow">
        <div className="row wrap">
          <strong>{a.title}</strong>
          <Origin />
          {a.suppressed && <Badge>Supprimée</Badge>}
          {saved.dismissedAlerts.includes(a.id) && (
            <Badge>Faux positif signalé</Badge>
          )}
        </div>
        <p>{a.reason}</p>
        <div className="row wrap small muted">
          <span>
            T+{a.minute} min · <Time iso={at(a.minute)} zone={saved.timezone} />
          </span>
          <span>Observé / calculé sur des données fictives</span>
        </div>
        <p className="small">
          {events.find((e) => e.id === a.event_id)?.title}
        </p>
        <div className="row wrap">
          <button
            className="text-button"
            onClick={() =>
              go(
                a.token_id ? "tokens" : "events",
                a.token_id ? { token: a.token_id } : { event: a.event_id },
              )
            }
          >
            Voir les éléments →
          </button>
          <button
            className="text-button muted"
            disabled={saved.dismissedAlerts.includes(a.id)}
            onClick={() =>
              change({
                ...saved,
                dismissedAlerts: [...saved.dismissedAlerts, a.id].slice(-500),
              })
            }
          >
            Signaler un faux positif
          </button>
        </div>
      </div>
    </article>
  );
  if (!ready)
    return (
      <div className="loading" role="status">
        Chargement de MemeRadar…
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="#page=dashboard" className="brand">
          <span className="brand-mark">◉</span>
          <span>
            Meme<span className="accent">Radar</span>
            <small>OBSERVER. RELIER. COMPRENDRE.</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">M</span>
          <div>
            Espace personnel<small>Observatoire local</small>
          </div>
          <span className="right">⌄</span>
        </div>
        <p className="nav-label">EXPLORER</p>
        <nav aria-label="Navigation principale">
          {navigation.map((n) => (
            <a
              key={n.id}
              href={`#page=${n.id}`}
              aria-current={route.page === n.id ? "page" : undefined}
              className={route.page === n.id ? "active" : ""}
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
              {n.id === "alerts" && (
                <span className="nav-count">
                  {
                    allAlerts.filter(
                      (a) =>
                        !a.suppressed && !saved.dismissedAlerts.includes(a.id),
                    ).length
                  }
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private">
            <span>▣</span>
            <div>
              Vos données restent ici<small>Aucun portefeuille connecté</small>
            </div>
          </div>
          <div className="version">
            MemeRadar 0.1.0 <span>Édition démo</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <div className="demo-banner">
          <span>◈</span>
          <strong>MODE DÉMO</strong>
          <span>— données entièrement fictives</span>
          <span className="right desktop-only">
            Aucun appel réseau externe <span className="dot" />
          </span>
        </div>
        <header className="topbar">
          <div className="breadcrumb">
            Observatoire <span>/</span>{" "}
            <strong>
              {navigation.find((n) => n.id === route.page)?.label}
            </strong>
          </div>
          <div className="row">
            <span className="status-pill">
              <i className="dot" /> Hors ligne
            </span>
            <button
              className="icon-button"
              aria-label="Changer de thème"
              onClick={() =>
                change({
                  ...saved,
                  theme: saved.theme === "dark" ? "light" : "dark",
                })
              }
            >
              {saved.theme === "dark" ? "☀" : "☾"}
            </button>
            <span className="avatar">MR</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">VEILLE & ANALYSE EXPLICABLE</p>
              <h1>{navigation.find((n) => n.id === route.page)?.label}</h1>
              <p className="subtitle">
                {route.page === "dashboard"
                  ? "Les tendances se propagent. Gardez une trace des faits."
                  : route.page === "conversations"
                    ? "Reliez les réponses et gardez les limites de couverture visibles."
                    : route.page === "people"
                      ? "Suivez des identités, conservez vos notes privées et distinguez les observations."
                      : route.page === "events"
                        ? "De l’actualité aux associations : retracez chaque source."
                        : route.page === "tokens"
                          ? "Une identité, des preuves et des limites pour chaque token."
                          : route.page === "analysis"
                            ? "Prix, liquidité et mentions : des observations datées, avec leurs limites."
                            : route.page === "alerts"
                              ? "Des déclenchements documentés, sans recommandations financières."
                              : route.page === "sources"
                                ? "Comprenez la couverture et la provenance des données."
                                : "Personnalisez votre observatoire sur cet appareil."}
              </p>
            </div>
            <Badge tone="demo">Environnement fictif</Badge>
          </div>
          {warning && (
            <div className="warning-box" role="alert">
              {warning}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Fermer le message"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <section className="replay" aria-label="Rejeu de la démonstration">
            <div>
              <span className="replay-symbol">◷</span>
              <strong>Chronologie démo</strong>
              <span className="muted">15 janv. 2026 · T+{minute} min</span>
            </div>
            <div className="row">
              <button
                className="secondary small"
                onClick={() => {
                  setMinute(0);
                  setPlaying(false);
                }}
              >
                Recommencer
              </button>
              <button
                className="secondary small"
                onClick={() => setPlaying(!playing)}
              >
                {playing ? "Ⅱ Pause" : "▷ Rejouer ×300"}
              </button>
            </div>
            <input
              aria-label="Temps simulé en minutes"
              type="range"
              min="0"
              max="120"
              step="5"
              value={minute}
              onChange={(e) => {
                setMinute(Number(e.target.value));
                setPlaying(false);
              }}
            />
          </section>
          {route.page === "analysis" &&
            (route.chartPath ? (
              <React.Suspense
                fallback={<p role="status">Chargement du graphique local…</p>}
              >
                <TokenAnalysis
                  path={route.chartPath}
                  minute={minute}
                  zone={saved.timezone}
                  theme={saved.theme}
                  socialDisabled={socialDisabled}
                  indexerDisabled={saved.disabledSources.includes("indexer")}
                />
              </React.Suspense>
            ) : (
              <section className="panel">
                <h2>Choisissez un token à analyser</h2>
                <p>
                  Ouvrez son graphique depuis une carte ou une mention ; la
                  chaîne et l’adresse identifient la fiche.
                </p>
                <a href="#page=tokens">Voir les tokens détectés</a>
              </section>
            ))}
          {route.page === "dashboard" && (
            <>
              <div className="stats">
                <Stat
                  label="Événements suivis"
                  value="03"
                  note="Trois scénarios entièrement fictifs"
                  icon="◎"
                />
                <Stat
                  label="Tokens associés"
                  value="08"
                  note="Aucun lien officiel confirmé"
                  icon="⬡"
                />
                <Stat
                  label="Mentions observées"
                  value={
                    socialDisabled
                      ? "Partielles"
                      : new Intl.NumberFormat("fr-CA").format(totalMentions)
                  }
                  note="Cumul du rejeu • données fictives"
                  icon="〰"
                />
                <Stat
                  label="Alertes visibles"
                  value={String(
                    allAlerts.filter((a) => !a.suppressed).length,
                  ).padStart(2, "0")}
                  note={`${allAlerts.filter((a) => a.suppressed).length} déclenchements supprimés`}
                  icon="♧"
                />
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Évolution de l’attention</h2>
                      <p>Mentions par tranche de 5 minutes · calculé</p>
                    </div>
                    <Badge>3 scénarios</Badge>
                  </div>
                  {socialDisabled ? (
                    <Empty
                      title="Source sociale exclue"
                      text="Réactivez-la dans Sources pour afficher cette série fictive."
                    />
                  ) : (
                    <Chart values={chartValues} minute={minute} />
                  )}
                  <div className="chart-legend">
                    <i className="dot" /> Mentions observées{" "}
                    <span className="muted right">
                      Source : jeu local ·{" "}
                      <Time iso={at(minute)} zone={saved.timezone} />
                    </span>
                  </div>
                </section>
                <section className="panel guide">
                  <span className="guide-icon">⌕</span>
                  <h2>Un lien n’est pas une preuve.</h2>
                  <p>
                    Le nom d’un token ne suffit jamais à démontrer une
                    association officielle. Consultez les sources et les
                    contre-indications.
                  </p>
                  <div className="guide-divider" />
                  <span className="small muted">TROIS NIVEAUX DE LECTURE</span>
                  <div className="row wrap">
                    <Badge>◉ Observé</Badge>
                    <Badge>∑ Calculé</Badge>
                    <Badge>◇ Interprété</Badge>
                  </div>
                </section>
              </div>
              <section>
                <div className="section-heading">
                  <div>
                    <h2>
                      Événements en observation <span className="count">3</span>
                    </h2>
                    <p>
                      Fiabilité des sources et popularité sont évaluées
                      séparément.
                    </p>
                  </div>
                  <button className="text-button" onClick={() => go("events")}>
                    Tous les événements ↗
                  </button>
                </div>
                <div className="event-grid">
                  {events.map(eventCard)}
                  <EventFeatureCard query="" />
                </div>
                <p className="small muted">
                  Les indicateurs agrégés couvrent les trois scénarios d’origine
                  ; Nébula Mobile présente ses mesures distinctes dans sa fiche.
                </p>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Derniers signaux</h2>
                    <p>Alertes issues de scénarios fictifs</p>
                  </div>
                  <button className="text-button" onClick={() => go("alerts")}>
                    Voir l’historique →
                  </button>
                </div>
                {allAlerts
                  .filter((a) => !a.suppressed)
                  .slice(0, 3)
                  .map(alertCard)}
                {!allAlerts.some((a) => !a.suppressed) && (
                  <Empty
                    title="Aucun déclenchement à cet instant"
                    text="Avancez le rejeu ou adaptez les seuils dans Alertes."
                  />
                )}
              </section>
            </>
          )}
          {route.page === "events" && (
            <>
              <Filters query={route.query} onQuery={(v) => filter("q", v)} />
              <div className="event-grid">
                {filteredEvents.map(eventCard)}
                <EventFeatureCard query={route.query} />
              </div>
              <EventInsights
                id={route.event}
                minute={minute}
                zone={saved.timezone}
                socialDisabled={socialDisabled}
                indexerDisabled={saved.disabledSources.includes("indexer")}
                pressDisabled={saved.disabledSources.includes("press")}
              />
              {!filteredEvents.length &&
                !V2_EVENT_TITLE.toLowerCase().includes(
                  route.query.toLowerCase(),
                ) && (
                  <Empty
                    title="Aucun événement correspondant"
                    text="Essayez un autre mot-clé."
                  />
                )}
            </>
          )}
          {route.page === "tokens" && (
            <>
              <SocialProofs
                minute={minute}
                zone={saved.timezone}
                socialDisabled={socialDisabled}
                indexerDisabled={saved.disabledSources.includes("indexer")}
                query={route.query}
                chain={route.chain}
                confidence={route.confidence}
                selected={
                  route.token?.startsWith("00000000-0000-4000-8000-00000000007")
                    ? route.token
                    : null
                }
              />
              <Filters query={route.query} onQuery={(v) => filter("q", v)}>
                <label>
                  Chaîne
                  <select
                    value={route.chain}
                    onChange={(e) => filter("chain", e.target.value)}
                  >
                    {["Toutes", "Base", "Solana"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Association
                  <select
                    value={route.confidence}
                    onChange={(e) => filter("confidence", e.target.value)}
                  >
                    <option value="Tous">Tous les niveaux</option>
                    {(["PLAUSIBLE", "WEAK", "INSUFFICIENT_DATA"] as const).map(
                      (v) => (
                        <option key={v} value={v}>
                          {LABELS[v]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </Filters>
              <div className="panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Token / identité</th>
                      <th>Chaîne</th>
                      <th>Association</th>
                      <th>Liquidité fictive</th>
                      <th>Contrôles</th>
                      <th>
                        <span className="sr-only">Détails</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTokens.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <button
                            className="token-name"
                            onClick={() => go("tokens", { token: t.id })}
                          >
                            {t.name}
                          </button>
                          <div className="row small">
                            <Origin />
                            <span className="muted">{t.symbol}</span>
                          </div>
                        </td>
                        <td>
                          {t.chain}
                          <OpenChart chain={t.chain} address={t.address} />
                        </td>
                        <td>
                          <Badge
                            tone={
                              associate(t).impersonation ? "risk" : "neutral"
                            }
                          >
                            {associate(t).impersonation
                              ? "⚠ Imitateur potentiel"
                              : LABELS[associate(t).level]}
                          </Badge>
                        </td>
                        <td>
                          {saved.disabledSources.includes("indexer") ? (
                            <span className="missing">Non disponible</span>
                          ) : (
                            <Money metric={t.liquidity} minute={minute} />
                          )}
                        </td>
                        <td>
                          {t.risks.some((r) => r.severity === "high") ? (
                            <Badge tone="risk">! Signal élevé</Badge>
                          ) : (
                            <Badge>Données insuffisantes</Badge>
                          )}
                        </td>
                        <td>
                          <button
                            className="text-button"
                            aria-label={`Ouvrir ${t.name}`}
                            onClick={() => go("tokens", { token: t.id })}
                          >
                            →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filteredTokens.length && (
                  <Empty
                    title="Aucun token correspondant"
                    text="Modifiez la recherche ou les filtres."
                  />
                )}
              </div>
              <p className="small muted">
                Métriques observées à T+60 min · source : indexeur fictif local.
                Les prix ne servent pas de classement.
              </p>
            </>
          )}
          {route.page === "alerts" && (
            <>
              <AlertsV2 />
              <EventAlertDrafts />
              <div className="tabs">
                <button
                  className={tab === "history" ? "selected" : ""}
                  onClick={() => setTab("history")}
                >
                  Historique <span>{allAlerts.length}</span>
                </button>
                <button
                  className={tab === "rules" ? "selected" : ""}
                  onClick={() => setTab("rules")}
                >
                  Ma règle d’attention
                </button>
              </div>
              {tab === "history" ? (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Historique du rejeu</h2>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={showSuppressed}
                        onChange={(e) => setShowSuppressed(e.target.checked)}
                      />{" "}
                      Inclure les alertes supprimées
                    </label>
                  </div>
                  {visibleAlerts.map(alertCard)}
                  {!visibleAlerts.length && (
                    <Empty
                      title="Aucune alerte à cet instant"
                      text="Avancez le temps simulé. Les alertes sont recalculées de façon déterministe."
                    />
                  )}
                </section>
              ) : (
                <section className="panel form-panel">
                  <h2>Configurer le seuil</h2>
                  <p>
                    Cette règle s’applique aux trois séries fictives. Son
                    historique est recalculé à chaque modification. Les trois
                    alertes pédagogiques du scénario Tesla restent distinctes.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const result = ruleSchema.safeParse(ruleDraft);
                      if (!result.success) {
                        setNotice(
                          "Vérifiez les seuils : réarmement inférieur au déclenchement, délai entre 0 et 1 440 minutes.",
                        );
                        return;
                      }
                      change({ ...saved, rule: result.data });
                    }}
                  >
                    <label>
                      Nom de la règle
                      <input
                        value={ruleDraft.name}
                        maxLength={100}
                        required
                        onChange={(e) =>
                          setRuleDraft({ ...ruleDraft, name: e.target.value })
                        }
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Déclencher à partir de (mentions / 5 min)
                        <input
                          type="number"
                          min="2"
                          max="1000"
                          required
                          value={ruleDraft.threshold}
                          onChange={(e) =>
                            setRuleDraft({
                              ...ruleDraft,
                              threshold: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Réarmer en dessous de
                        <input
                          type="number"
                          min="0"
                          max="999"
                          required
                          value={ruleDraft.resetBelow}
                          onChange={(e) =>
                            setRuleDraft({
                              ...ruleDraft,
                              resetBelow: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Délai de récupération (minutes)
                        <input
                          type="number"
                          min="0"
                          max="1440"
                          required
                          value={ruleDraft.cooldown}
                          onChange={(e) =>
                            setRuleDraft({
                              ...ruleDraft,
                              cooldown: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={ruleDraft.enabled}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            enabled: e.target.checked,
                          })
                        }
                      />{" "}
                      Règle activée
                    </label>
                    <button className="primary" type="submit">
                      Enregistrer la règle
                    </button>
                  </form>
                  <div className="info-box">
                    Les courriels et webhooks sont indisponibles dans cette
                    édition hors ligne.
                  </div>
                </section>
              )}
            </>
          )}
          {route.page === "sources" && (
            <>
              <SourcesV2 zone={saved.timezone} />
              <div className="info-box">
                Les connecteurs ci-dessous lisent uniquement les fixtures
                locales. Les interrupteurs filtrent les publications affichées ;
                ils n’activent aucune collecte réelle.
              </div>
              <div className="source-grid">
                {sources.map((s) => (
                  <section className="panel" key={s.id}>
                    <div className="row">
                      <span className="source-icon">◫</span>
                      <Badge>Niveau {s.tier}</Badge>
                      <Origin />
                    </div>
                    <h2>{s.name}</h2>
                    <p>{s.type}</p>
                    <div className="source-meta">
                      <span>Statut</span>
                      <strong>
                        {saved.disabledSources.includes(s.id)
                          ? "Exclue de la vue"
                          : "Fixture disponible"}
                      </strong>
                      <span>Dernière observation</span>
                      <Time
                        iso={at(Math.min(minute, 60))}
                        zone={saved.timezone}
                      />
                      <span>Quota / CGU fournisseur</span>
                      <span>Sans objet — source inventée</span>
                    </div>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={!saved.disabledSources.includes(s.id)}
                        onChange={(e) =>
                          change({
                            ...saved,
                            disabledSources: e.target.checked
                              ? saved.disabledSources.filter(
                                  (id) => id !== s.id,
                                )
                              : [...saved.disabledSources, s.id],
                          })
                        }
                      />{" "}
                      Inclure dans les vues de sources
                    </label>
                    <DemoLink
                      url={`https://demo.memeradar.invalid/sources/${s.id}`}
                    />
                  </section>
                ))}
              </div>
            </>
          )}
          {route.page === "conversations" && (
            <Conversations
              key={route.conversation}
              id={route.conversation ?? demoConversationId}
            />
          )}
          {route.page === "people" && <People />}
          {route.page === "settings" && (
            <div className="settings-grid">
              <section className="panel form-panel">
                <h2>Préférences locales</h2>
                <label>
                  Apparence
                  <select
                    value={saved.theme}
                    onChange={(e) =>
                      change({
                        ...saved,
                        theme: e.target.value as SavedState["theme"],
                      })
                    }
                  >
                    <option value="dark">Sombre</option>
                    <option value="light">Clair</option>
                  </select>
                </label>
                <label>
                  Fuseau horaire
                  <select
                    value={saved.timezone}
                    onChange={(e) =>
                      change({
                        ...saved,
                        timezone: e.target.value as SavedState["timezone"],
                      })
                    }
                  >
                    {["America/Toronto", "Europe/Paris", "UTC"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Mode de fonctionnement
                  <input readOnly value="Démonstration hors ligne" />
                </label>
                <div className="info-box">
                  Le mode réel n’est pas livré dans cette version. Aucune clé
                  API, aucun compte et aucun portefeuille ne sont nécessaires.
                </div>
              </section>
              <section className="panel form-panel">
                <h2>Ma liste de suivi</h2>
                <p>
                  Mots-clés personnels, conservés localement. Cliquez sur un
                  mot-clé pour rechercher les événements correspondants.
                </p>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const term = newWatch.trim();
                    if (
                      term &&
                      !saved.watchlist.includes(term) &&
                      saved.watchlist.length < 50
                    ) {
                      change({
                        ...saved,
                        watchlist: [...saved.watchlist, term],
                      });
                      setNewWatch("");
                    }
                  }}
                >
                  <input
                    aria-label="Nouveau mot-clé"
                    maxLength={80}
                    value={newWatch}
                    onChange={(e) => setNewWatch(e.target.value)}
                    placeholder="Entreprise, sujet, mot-clé…"
                  />
                  <button
                    className="primary"
                    disabled={saved.watchlist.length >= 50}
                    type="submit"
                  >
                    Ajouter
                  </button>
                </form>
                <div className="watchlist">
                  {saved.watchlist.map((word) => (
                    <div key={word}>
                      <button onClick={() => go("events", { q: word })}>
                        {word}
                      </button>
                      <button
                        aria-label={`Retirer ${word}`}
                        onClick={() =>
                          change({
                            ...saved,
                            watchlist: saved.watchlist.filter(
                              (v) => v !== word,
                            ),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {!saved.watchlist.length && <p>Aucun sujet suivi.</p>}
              </section>
              <section className="panel">
                <h2>Stockage et confidentialité</h2>
                <p>
                  Seuls vos préférences, mots-clés, règle et signalements sont
                  enregistrés. Les scénarios fictifs sont intégrés à
                  l’application. Le rejeu redémarre à T+60 min à chaque
                  lancement.
                </p>
                <p className="small muted">
                  Windows : %APPDATA%\MemeRadar\preferences-v1.json. En
                  prévisualisation navigateur : stockage local du navigateur.
                  Aucun envoi de télémétrie ni mise à jour automatique.
                </p>
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await persistState(defaultState);
                      setWarning("");
                      setSaved(defaultState);
                      setRuleDraft(defaultState.rule);
                      setNotice("Préférences réinitialisées.");
                    } catch {
                      setNotice(
                        "Réinitialisation impossible : vérifiez les droits du dossier de données.",
                      );
                    }
                  }}
                >
                  Réinitialiser les préférences
                </button>
              </section>
              <section className="panel">
                <h2>Couverture de cette édition</h2>
                <p>
                  Application de démonstration, pas un service de surveillance
                  réel. Les cinq indicateurs sont pédagogiques ; les
                  fournisseurs, analyses RPC, comptes serveur, SMTP et webhooks
                  restent hors de cette édition.
                </p>
                <Badge>Version 0.1.0 · Windows x64</Badge>
              </section>
            </div>
          )}
          <footer>
            <span className="footer-icon">ⓘ</span>
            <p>{WARNING}</p>
          </footer>
        </main>
      </div>
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        aria-labelledby="detail-title"
      >
        <div className="detail">
          <div className="row">
            <Origin />
            <Badge>{token ? "Fiche token" : "Fiche événement"}</Badge>
            <button
              className="icon-button right"
              onClick={close}
              aria-label="Fermer la fiche"
            >
              ×
            </button>
          </div>
          <h2 id="detail-title">{token?.name ?? event?.title}</h2>
          {token && selected ? (
            <TokenDetail
              token={token}
              event={selected}
              minute={minute}
              zone={saved.timezone}
              onEvent={() => go("events", { event: token.event_id })}
              onNotice={setNotice}
              indexerDisabled={saved.disabledSources.includes("indexer")}
              socialDisabled={socialDisabled}
            />
          ) : (
            event && (
              <>
                <p>{event.summary}</p>
                <div className="detail-meta">
                  <div>
                    <span>Fiabilité des sources</span>
                    <strong>
                      Niveau {event.reliability} ·{" "}
                      {event.reliability === "A"
                        ? "source officielle fictive"
                        : "média fictif"}
                    </strong>
                  </div>
                  <div>
                    <span>Popularité · calculé</span>
                    <strong>{LABELS[event.popularity]}</strong>
                  </div>
                  <div>
                    <span>Délai de détection</span>
                    <strong>
                      {(Date.parse(event.first_detected_at) -
                        Date.parse(event.first_published_at)) /
                        60_000}{" "}
                      minutes
                    </strong>
                  </div>
                </div>
                <h3>Attention observée · données fictives</h3>
                {socialDisabled ? (
                  <Empty
                    title="Série exclue"
                    text="La source sociale est exclue dans vos préférences."
                  />
                ) : (
                  <Chart values={event.mentions} minute={minute} />
                )}
                <h3>Tokens associés</h3>
                <div className="linked-tokens">
                  {tokens
                    .filter((t) => t.event_id === event.id)
                    .map((t) => (
                      <div key={t.id}>
                        <button
                          className="secondary"
                          onClick={() => go("tokens", { token: t.id })}
                        >
                          <span>{t.name}</span>
                          <Badge>{LABELS[associate(t).level]}</Badge>
                          <span>→</span>
                        </button>
                        <OpenChart chain={t.chain} address={t.address} />
                      </div>
                    ))}
                </div>
                <EventAlertForm
                  key={event.id}
                  eventId={event.id}
                  defaultSubject={event.entity}
                />
                <h3>Chronologie et sources</h3>
                <p className="small muted">
                  Observations fictives disponibles jusqu’à T+{minute} min. Les
                  liens .invalid sont désactivés.
                </p>
                <div className="timeline">
                  {event.items
                    .filter(
                      (item) => item.minute <= minute && sourceAvailable(item),
                    )
                    .map((item) => (
                      <article key={item.id}>
                        <span className="timeline-dot" />
                        <div className="row wrap">
                          <strong>{item.title}</strong>
                          <Badge>Observé</Badge>
                          <Badge>Niveau {item.tier}</Badge>
                        </div>
                        <p>
                          <Time iso={item.observed_at} zone={saved.timezone} />{" "}
                          · {item.source}
                        </p>
                        <DemoLink url={item.url} />
                      </article>
                    ))}
                </div>
              </>
            )
          )}
        </div>
      </dialog>
    </div>
  );
}
function TokenDetail({
  token,
  event,
  minute,
  zone,
  onEvent,
  onNotice,
  indexerDisabled,
  socialDisabled,
}: {
  token: Token;
  event: Event;
  minute: number;
  zone: string;
  onEvent: () => void;
  onNotice: (message: string) => void;
  indexerDisabled: boolean;
  socialDisabled: boolean;
}) {
  const link = associate(token);
  const results = indicators(token, event, minute).map((i) =>
    (indexerDisabled &&
      ["DATA_QUALITY", "ONCHAIN_RISK", "ANALYSIS_CONFIDENCE"].includes(
        i.indicator,
      )) ||
    (socialDisabled && i.indicator === "ATTENTION") ||
    (minute < 60 &&
      ["DATA_QUALITY", "ONCHAIN_RISK", "ANALYSIS_CONFIDENCE"].includes(
        i.indicator,
      ))
      ? {
          ...i,
          level: "INSUFFICIENT_DATA" as const,
          factors: [],
          missing_inputs: [
            {
              name: "observations",
              reason:
                minute < 60
                  ? "Disponibles à T+60 min"
                  : "Source exclue dans les préférences.",
            },
          ],
        }
      : i,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => setExpanded(null), [token.id]);
  return (
    <>
      <div className="warning-box small">{WARNING}</div>
      <div className="address-box">
        <div className="row">
          <Badge>{token.chain}</Badge>
          <span>Adresse fictive · Observé</span>
          <button
            className="text-button right"
            onClick={async () => {
              try {
                if (window.memeradar)
                  await window.memeradar.copyAddress(token.address);
                else await navigator.clipboard.writeText(token.address);
                onNotice("Adresse fictive copiée.");
              } catch {
                onNotice(
                  "Copie indisponible. Vous pouvez sélectionner l’adresse complète.",
                );
              }
            }}
          >
            Copier l’adresse
          </button>
        </div>
        <code>{token.address}</code>
      </div>
      <OpenChart chain={token.chain} address={token.address} />
      <h3>
        Association avec l’événement <Badge>{LABELS[link.level]}</Badge>
      </h3>
      <button className="text-button" onClick={onEvent}>
        {event.title} →
      </button>
      {link.impersonation && (
        <div className="warning-box">
          ⚠ Ce token utilise le nom d’une entité connue. Aucune preuve d’un lien
          officiel n’a été trouvée.
        </div>
      )}
      <div className="form-grid">
        <div>
          <h4>Éléments en faveur · Interprété</h4>
          <ul>
            {link.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Contre-indications</h4>
          <ul>
            {link.counter_reasons.length ? (
              link.counter_reasons.map((r) => <li key={r}>{r}</li>)
            ) : (
              <li>
                Aucune preuve d’une association officielle. Le scénario ne
                vérifie pas un token réel.
              </li>
            )}
          </ul>
        </div>
      </div>
      <p className="small muted">
        {link.algorithm_version} · Calculé sur les fixtures locales
      </p>
      <h3>Cinq indicateurs indépendants</h3>
      <div className="indicators">
        {results.map((i: Indicator) => (
          <section key={i.indicator} className="indicator">
            <div className="row">
              <strong>{INDICATOR_LABELS[i.indicator]}</strong>
              <Badge
                tone={
                  i.indicator === "ONCHAIN_RISK" && i.level === "HIGH"
                    ? "risk"
                    : "neutral"
                }
              >
                {LABELS[i.level]}
              </Badge>
            </div>
            <button
              className="text-button small"
              aria-expanded={expanded === i.indicator}
              onClick={() =>
                setExpanded(expanded === i.indicator ? null : i.indicator)
              }
            >
              Pourquoi ce niveau ? {expanded === i.indicator ? "−" : "+"}
            </button>
            {expanded === i.indicator && (
              <div className="explanation">
                <p>
                  <strong>Entrées utilisées</strong>
                </p>
                {i.inputs_used.map((v) => (
                  <p key={v.name}>
                    {v.name} : {v.value} · {v.source} ·{" "}
                    <Time iso={v.observed_at} zone={zone} />
                  </p>
                ))}
                {i.factors.map((f) => (
                  <p key={f.name}>
                    {f.explanation} Contribution : {f.weight} ({f.effect}).
                  </p>
                ))}
                {i.missing_inputs.map((m) => (
                  <p key={m.name}>
                    Donnée manquante : {m.name} — {m.reason}
                  </p>
                ))}
                <p className="small muted">
                  {i.algorithm_version} ·{" "}
                  <Time iso={i.computed_at} zone={zone} />
                </p>
              </div>
            )}
          </section>
        ))}
      </div>
      <h3>Marché · Observé, entièrement fictif</h3>
      {indexerDisabled ? (
        <Empty
          title="Indexeur exclu"
          text="Aucune métrique affichée avec cette préférence."
        />
      ) : (
        <>
          <div className="detail-meta">
            <div>
              <span>Prix USD</span>
              <strong>
                <Money metric={token.price} minute={minute} />
              </strong>
            </div>
            <div>
              <span>Liquidité USD</span>
              <strong>
                <Money metric={token.liquidity} minute={minute} />
              </strong>
            </div>
            <div>
              <span>Volume sur 24 h</span>
              <strong>
                <Money metric={token.volume} minute={minute} />
              </strong>
            </div>
          </div>
          <p className="small muted">
            {token.price.source} · Observation :{" "}
            <Time iso={token.price.observed_at} zone={zone} /> ·{" "}
            {minute < 60
              ? "Pas encore disponible dans le rejeu"
              : minute > 75
                ? "Données anciennes (>15 min)"
                : "Données du scénario"}{" "}
            · volume non vérifié
          </p>
          <DemoLink url={token.price.url} />
        </>
      )}
      <h3>Signaux de risque</h3>
      <p className="small muted">{RISK_WARNING}</p>
      {indexerDisabled || minute < 60 ? (
        <Empty
          title="Données insuffisantes"
          text={
            indexerDisabled
              ? "Indexeur exclu."
              : "Contrôles disponibles à T+60 min."
          }
        />
      ) : (
        token.risks.map((r) => (
          <article className="risk-item" key={r.title}>
            <div className="row wrap">
              <strong>{r.title}</strong>
              <Badge tone={r.status === "signal_detected" ? "risk" : "neutral"}>
                {r.status === "signal_detected"
                  ? `! Signal détecté · ${r.severity === "high" ? "élevé" : "modéré"}`
                  : r.status === "check_failed"
                    ? "Vérification échouée"
                    : "Données insuffisantes"}
              </Badge>
            </div>
            <p>{r.evidence}</p>
            <p className="small muted">
              {r.limitations} · {r.source} ·{" "}
              <Time iso={r.observed_at} zone={zone} />
            </p>
          </article>
        ))
      )}
      <h3>Chronologie du token</h3>
      <div className="timeline">
        <article>
          <strong>Premier signal de l’événement</strong>
          <p>
            <Time iso={event.first_published_at} zone={zone} />
          </p>
        </article>
        <article>
          <strong>Création du token fictif</strong>
          <p>
            {token.minute === null
              ? "Non disponible"
              : `T${token.minute < 0 ? "−" : "+"}${Math.abs(token.minute)} min — ${token.minute < 0 ? "avant" : "après"} le signal`}
          </p>
        </article>
        <article>
          <strong>Création du pool / première transaction</strong>
          <p>Non disponible — aucune preuve de bloc ou transaction réelle.</p>
        </article>
        <article>
          <strong>Observation du marché fictif</strong>
          <p>T+60 min · pas de garantie d’exhaustivité.</p>
        </article>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: string;
}) {
  return (
    <section className="stat">
      <div className="row">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
function Filters({
  query,
  onQuery,
  children,
}: {
  query: string;
  onQuery: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="filters">
      <label className="search">
        <span>⌕</span>
        <input
          aria-label="Rechercher"
          placeholder="Rechercher un sujet, un nom, une adresse…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>
      {children}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>◎</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
