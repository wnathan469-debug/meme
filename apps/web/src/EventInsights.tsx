import { demoSocialSnapshot } from "../../../packages/social/demo-data";
import { SocialProofs } from "./SocialProofs";
import React, { useRef, useEffect, useState } from "react";
import { z } from "zod";
import {
  DEMO_EVENT_ID,
  EVENT_TITLE,
  alertInput,
} from "../../../packages/events/model";
import {
  demoEventSnapshot,
  eventDemoWindows,
} from "../../../packages/events/demo-data";
const key = "memeradar-demo-event-alerts-v2";
const draftSchema = alertInput.extend({
  id: z.uuid(),
  eventId: z.union([z.uuid(), z.enum(["tesla", "nebula", "boreal"])]),
  createdAt: z.iso.datetime(),
  enabled: z.literal(false),
});
const drafts = z.array(draftSchema).max(1000);
type Draft = z.infer<typeof draftSchema>;
function loadDrafts() {
  const raw = localStorage.getItem(key);
  return raw ? drafts.parse(JSON.parse(raw)) : [];
}
export function EventFeatureCard({ query }: { query: string }) {
  if (!EVENT_TITLE.toLowerCase().includes(query.toLowerCase())) return null;
  return (
    <button
      className="event-card"
      onClick={() => {
        location.hash = `page=events&event=${DEMO_EVENT_ID}`;
      }}
    >
      <div className="row">
        <span className="badge demo">DÉMO V2</span>
        <span className="muted right">Chronologie enrichie</span>
      </div>
      <h3>{EVENT_TITLE}</h3>
      <p>
        Publications X liées, ligne de base avant le signal et interruptions
        visibles.
      </p>
      <div className="card-bottom">
        <span>Source A · popularité mesurée séparément</span>
        <span>Voir les preuves →</span>
      </div>
    </button>
  );
}
export function EventInsights({
  id,
  minute,
  zone,
  socialDisabled,
  indexerDisabled,
  pressDisabled,
}: {
  id: string | null;
  minute: number;
  zone: string;
  socialDisabled: boolean;
  indexerDisabled: boolean;
  pressDisabled: boolean;
}) {
  const [category, setCategory] = useState("all"),
    [query, setQuery] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (id === DEMO_EVENT_ID) heading.current?.focus();
  }, [id]);
  if (id !== DEMO_EVENT_ID) return null;
  const snapshot = demoEventSnapshot(minute, socialDisabled, indexerDisabled),
    social = demoSocialSnapshot(minute, socialDisabled, indexerDisabled),
    filtered = snapshot.posts.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        p.text.toLowerCase().includes(query.toLowerCase()),
    );
  const time = (at: string | null) =>
    at
      ? new Intl.DateTimeFormat("fr-CA", {
          timeZone: zone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(at))
      : "Inconnu : preuve non enregistrée";
  const series = snapshot.attention.buckets,
    max = Math.max(1, ...series.map((b) => b.mentions ?? b.lowerBound));
  return (
    <section className="event-insights" aria-label="Fiche événement enrichie">
      <div className="row wrap">
        <h2 ref={heading} tabIndex={-1}>
          {EVENT_TITLE}
        </h2>
        <a href="#page=events">Fermer la fiche enrichie</a>
      </div>
      <p className="notice">
        DÉMO : 60 publications fictives dans le scénario, avant et après le
        signal. Liens .invalid désactivés. Aucun appel réseau, aucune
        affirmation sur une entreprise réelle.
      </p>
      <section
        className="panel"
        aria-label="Fiabilité et popularité distinctes"
      >
        <h3>Fiabilité de la source · Observé</h3>
        <p>
          Niveau {snapshot.source.reliability} : communiqué officiel entièrement
          fictif.{" "}
          {pressDisabled
            ? "Source presse exclue de cette vue."
            : snapshot.source.name}
        </p>
        <p>{snapshot.source.notes}</p>
        <h3>Popularité observée · Calculé</h3>
        <p>
          {socialDisabled
            ? "Indisponible : source X exclue."
            : `${snapshot.posts.length} publications uniques liées et disponibles à T+${minute} min, republications exclues.`}
        </p>
        <p>
          Le volume de mentions ne modifie pas la fiabilité de la source et ne
          prouve pas une adoption réelle.
        </p>
      </section>
      <section className="panel" aria-label="Attention avant et après">
        <h3>Attention avant et après le premier signal</h3>
        <p>
          Fenêtre de référence : 30 minutes avant le signal ; tranches de 5
          minutes, puis première heure. Date de publication, parmi les données
          connues de l’application. La couverture concerne ce périmètre, pas
          l’intégralité de X.
        </p>
        <p>
          Ligne de base :{" "}
          {snapshot.attention.baselineMean === null
            ? "inconnue (couverture insuffisante)"
            : `${snapshot.attention.baselineMean.replace(".", ",")} mentions par tranche`}
          . Multiplicateurs : calculés, sans conclusion de causalité.
        </p>
        <p>
          Les attestations du rejeu sont disponibles à T+60. Avant cela, des
          publications peuvent être visibles sans total comparable.
        </p>
        <svg
          viewBox="0 0 760 200"
          role="img"
          aria-label="Attention observée ; les tranches inconnues sont hachurées, sans interpolation"
        >
          <defs>
            <pattern
              id="event-gap"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0,6L6,0" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          {series.map((b, i) => {
            const height = b.mentions === null ? 100 : (b.mentions / max) * 130;
            return (
              <g key={b.start}>
                <rect
                  x={20 + i * 40}
                  y={160 - height}
                  width="29"
                  height={Math.max(1, height)}
                  fill={
                    b.mentions === null ? "url(#event-gap)" : "currentColor"
                  }
                  opacity={b.mentions === null ? 0.3 : 0.8}
                />
                <text x={20 + i * 40} y="180" fontSize="10" fill="currentColor">
                  {b.relativeMinutes}
                </text>
                <title>
                  {b.relativeMinutes} min :{" "}
                  {b.mentions === null
                    ? `inconnu, au moins ${b.lowerBound} observées`
                    : b.mentions + " mentions"}
                </title>
              </g>
            );
          })}
          <line
            x1="255"
            x2="255"
            y1="10"
            y2="165"
            stroke="currentColor"
            strokeDasharray="4 4"
          />
        </svg>
        <p>
          Trait pointillé : premier signal connu, T0. Hachures : trou ou période
          non établie, jamais un zéro ni une courbe interpolée.
        </p>
        <div className="event-table">
          <table>
            <caption>Mentions et multiplicateurs observables</caption>
            <thead>
              <tr>
                <th>Après le signal</th>
                <th>Mentions</th>
                <th>Rapport à la base</th>
                <th>Qualité</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.attention.after.map((b) => (
                <tr key={b.start}>
                  <td>
                    T+{b.relativeMinutes} à T+{b.relativeMinutes + 5} min
                  </td>
                  <td>
                    {b.mentions === null
                      ? `Inconnu (au moins ${b.lowerBound})`
                      : b.mentions}
                  </td>
                  <td>
                    {b.multiplier === null
                      ? "Indisponible"
                      : `${b.multiplier} ×`}
                  </td>
                  <td>
                    {b.multiplierReason ??
                      "Tranche documentée dans ce périmètre"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>Interruptions et limites documentées</h4>
        {eventDemoWindows
          .filter((w) => w.status !== "observed")
          .map((w) => (
            <p key={w.start}>
              {time(w.start)} → {time(w.end)} : {w.reason}.
            </p>
          ))}
        <p>
          Une interruption de collecte n’est pas une preuve d’une baisse
          d’attention.
        </p>
      </section>
      <section className="panel" aria-label="Chronologie enrichie">
        <h3>Chronologie enrichie · preuves datées</h3>
        <p>
          Premières observations connues uniquement. Un lien ou une proximité
          temporelle ne prouve pas une causalité ni un soutien.
        </p>
        {snapshot.timeline
          .filter((t) => !pressDisabled || t.kind !== "original_signal")
          .map((t, i) => (
            <article className="event-milestone" key={t.kind + String(i)}>
              <strong>{t.label}</strong>
              <p>
                {time(t.at)} ·{" "}
                {t.knowledge === "OBSERVED"
                  ? "Observé"
                  : t.knowledge === "CALCULATED"
                    ? "Calculé"
                    : "Interprété"}
              </p>
              <p>{t.source}</p>
            </article>
          ))}
        {indexerDisabled && (
          <p>Source de chaîne exclue : créations de tokens non présentées.</p>
        )}
        <p>
          Le token fictif illustré est une association plausible préenregistrée
          ; aucune adresse publiée par un compte officiel n’est inventée comme
          preuve.
        </p>
      </section>
      <section className="panel" aria-label="Publications liées à l’événement">
        <h3>Publications X liées · Interprété</h3>
        <label>
          Catégorie du compte
          <select
            aria-label="Catégorie du compte"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Tous</option>
            <option value="official_attested">
              Officiel selon attestation manuelle
            </option>
            <option value="followed">Personne suivie dans le scénario</option>
            <option value="other">Autre compte</option>
          </select>
        </label>
        <label>
          Rechercher les publications liées
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <p>
          Le statut officiel repose ici sur une attestation fictive
          explicitement renseignée, pas sur un nom, un nombre d’abonnés ou un
          badge X. Score de rapprochement heuristique, sans probabilité ni
          confirmation d’un token.
        </p>
        {filtered.map((p) => (
          <article className="conversation-post" key={p.id}>
            <strong>
              {p.author
                ? `${p.author.name} — @${p.author.username}`
                : "Auteur non fourni"}
            </strong>
            <p>
              {p.category === "official_attested"
                ? "Officiel selon attestation manuelle fictive"
                : p.category === "followed"
                  ? "Personne suivie dans le scénario"
                  : "Autre compte"}{" "}
              · {time(p.publishedAt)}
            </p>
            <p>{p.text}</p>
            <p>
              Score : {p.score} · Méthode : {p.method} · Interprété. Éléments :{" "}
              {p.evidence.join(", ")}
            </p>
            <span>
              Publication fictive : https://demo.memeradar.invalid/post/{p.id}
            </span>
            {social
              .filter((s) =>
                s.mentions.some(
                  (m) =>
                    m.postId === p.id &&
                    (m.method === "exact_address" ||
                      m.method === "token_page_url"),
                ),
              )
              .map((s) => (
                <p key={s.token.id}>
                  <a href={`#page=tokens&token=${s.token.id}`}>
                    Voir les preuves du token {s.token.name} · {s.token.chain}
                  </a>
                </p>
              ))}
            {(p.conversationId === "DEMO_POST_ROOT" ||
              p.id === "DEMO_POST_ROOT") && (
              <p>
                <a href="#page=conversations&conversation=DEMO_POST_ROOT">
                  Voir la conversation liée
                </a>
              </p>
            )}
          </article>
        ))}
        {!filtered.length && (
          <p>
            Aucune publication disponible dans ces filtres ; cela ne prouve pas
            l’absence de mentions sur X.
          </p>
        )}
      </section>
      <SocialProofs
        minute={minute}
        zone={zone}
        socialDisabled={socialDisabled}
        indexerDisabled={indexerDisabled}
      />
      <EventAlertForm eventId={DEMO_EVENT_ID} defaultSubject="Nébula Mobile" />
    </section>
  );
}
export function EventAlertForm({
  eventId,
  defaultSubject,
}: {
  eventId: string;
  defaultSubject: string;
}) {
  const [showForm, setShowForm] = useState(false),
    [kind, setKind] =
      useState<z.infer<typeof alertInput>["subjectType"]>("company"),
    [subject, setSubject] = useState(defaultSubject),
    [message, setMessage] = useState("");
  function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const value = alertInput.parse({ subjectType: kind, subject }),
        previous = loadDrafts();
      if (
        previous.some(
          (a) =>
            a.eventId === eventId &&
            a.subjectType === value.subjectType &&
            a.subject.toLowerCase() === value.subject.toLowerCase(),
        )
      ) {
        setMessage("Cette règle d’événement est déjà enregistrée.");
        return;
      }
      localStorage.setItem(
        key,
        JSON.stringify(
          drafts.parse([
            ...previous,
            {
              ...value,
              id: crypto.randomUUID(),
              eventId,
              createdAt: new Date().toISOString(),
              enabled: false,
            },
          ]),
        ),
      );
      setMessage(
        "Règle d’événement enregistrée localement. Exécution et notifications prévues en phase 10.",
      );
      setShowForm(false);
    } catch {
      setMessage(
        "Enregistrement impossible ou stockage incompatible : les données existantes sont conservées.",
      );
    }
  }
  return (
    <section className="panel" aria-label="Créer une alerte d’événement">
      <h3>Créer une alerte depuis cet événement</h3>
      <p>
        Configuration locale en pause : le moteur d’exécution et les
        notifications seront livrés en phase 10.
      </p>
      <button onClick={() => setShowForm(!showForm)}>
        Configurer l’alerte d’événement
      </button>
      {showForm && (
        <form onSubmit={save}>
          <label>
            Type de sujet
            <select
              aria-label="Type de sujet"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="topic">Sujet</option>
              <option value="company">Entreprise</option>
              <option value="person">Personnalité</option>
              <option value="keyword">Mot-clé</option>
              <option value="hashtag">Hashtag</option>
            </select>
          </label>
          <label>
            Sujet de l’alerte
            <input
              required
              maxLength={100}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <button type="submit">Enregistrer la règle d’événement</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <a href="#page=alerts">Voir mes règles d’événement</a>
    </section>
  );
}
export function EventAlertDrafts() {
  const [initial] = useState(() => {
    try {
      return { items: loadDrafts(), error: "" };
    } catch {
      return {
        items: [] as Draft[],
        error:
          "Stockage des règles d’événement illisible ; il est conservé sans écrasement.",
      };
    }
  });
  const [items, setItems] = useState(initial.items);
  return (
    <section
      className="panel event-insights"
      aria-label="Règles d’événement enregistrées"
    >
      <h2>Règles d’événement enregistrées</h2>
      <p>
        DÉMO locale : règles en pause, sans notification. Stockage propre à ce
        profil, séparé de la règle d’attention V1.
      </p>
      {initial.error && <p role="alert">{initial.error}</p>}
      {items.map((d) => (
        <article key={d.id}>
          <p>
            {d.subject} · {d.subjectType} · En pause
          </p>
          <a href={`#page=events&event=${d.eventId}`}>
            Voir l’événement associé
          </a>
          <button
            onClick={() => {
              try {
                const next = items.filter((i) => i.id !== d.id);
                localStorage.setItem(key, JSON.stringify(drafts.parse(next)));
                setItems(next);
              } catch {
                /* retain current data */
              }
            }}
          >
            Supprimer la règle {d.subject}
          </button>
        </article>
      ))}
      {!items.length && !initial.error && (
        <p>Aucune règle d’événement enregistrée.</p>
      )}
    </section>
  );
}
