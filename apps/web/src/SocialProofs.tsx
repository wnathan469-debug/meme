import { matchesControls } from "./control-filters";
import { demoRiskReport } from "../../../packages/risks/demo-data";
import { useUrlFilters } from "./useUrlFilters";
import { OpenChart } from "./TokenLink";
import React, { useState } from "react";
import { demoSocialSnapshot } from "../../../packages/social/demo-data";
import { METHOD_LABELS, type Method } from "../../../packages/social/model";
import { LABELS } from "../../../packages/core/domain";
import { DEMO_EVENT_ID } from "../../../packages/events/model";
export function SocialProofs({
  minute,
  zone,
  socialDisabled,
  indexerDisabled,
  query = "",
  chain = "Toutes",
  confidence = "Tous",
  selected = null,
}: {
  minute: number;
  zone: string;
  socialDisabled: boolean;
  indexerDisabled: boolean;
  query?: string;
  chain?: string;
  confidence?: string;
  selected?: string | null;
}) {
  const url = useUrlFilters(),
    method = url.params.get("mentionMethod") ?? "all",
    setMethod = (v: string) => url.set("mentionMethod", v);
  const snapshots = demoSocialSnapshot(
    minute,
    socialDisabled,
    indexerDisabled,
  ).filter(
    (s) =>
      matchesControls(
        demoRiskReport(
          { origin: "DEMO", chain: s.token.chain, address: s.token.address },
          minute,
        ).map((r) => r.status),
        url.params.get("risk") ?? "all",
        url.params.get("tokenQuality") ?? "all",
      ) &&
      (!selected || s.token.id === selected) &&
      (chain === "Toutes" || chain.toLowerCase() === s.token.chain) &&
      (confidence === "Tous" || confidence === s.level) &&
      `${s.token.name} ${s.token.symbol} ${s.token.address}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const date = (at: string | null) =>
    at
      ? new Intl.DateTimeFormat("fr-CA", {
          timeZone: zone,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(at))
      : "Inconnue dans ce périmètre";
  return (
    <section
      className="panel social-proofs"
      aria-label="Preuves sociales des tokens"
    >
      <h2>Preuves sociales des tokens · DÉMO V2</h2>
      <p>
        Trois tokens inventés du scénario Nébula Mobile, distincts des cartes
        V1. Identification par chaîne et adresse complète. Ces adresses fictives
        ne sont utilisables sur aucune chaîne.
      </p>
      <p>
        Base explicitement configurée dans ce scénario. Une adresse Solana
        syntaxiquement valide ne prouve pas qu’il s’agit d’un mint. Aucun compte
        n’a publié de contrat officiel vérifié dans cette fiction.
      </p>
      <label>
        Méthode de preuve
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">Toutes les méthodes</option>
          {Object.entries(METHOD_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {socialDisabled && (
        <p role="status">
          Source X exclue : preuves sociales indisponibles, aucune absence de
          mentions ne peut être conclue.
        </p>
      )}
      {snapshots.map((s) => (
        <article
          className="social-token"
          key={s.token.id}
          id={"social-" + s.token.id}
        >
          <h3>
            {s.token.name}{" "}
            <span className="badge neutral">{LABELS[s.level]}</span>
          </h3>
          <p>
            {s.token.symbol} · {s.token.chain} · Association interprétée,
            méthode {s.algorithm_version}
          </p>
          <code className="social-address">{s.token.address}</code>
          <OpenChart chain={s.token.chain} address={s.token.address} />
          <p>
            Première apparition observée dans les données collectées :{" "}
            <strong>{date(s.first_social_seen_at)}</strong>.
          </p>
          <p>
            Première récupération d’une preuve forte :{" "}
            {date(s.first_observed_at)}. La date publiée et l’heure de collecte
            sont distinctes.
          </p>
          {s.first_social_post_id && (
            <p>
              Publication correspondante fictive :{" "}
              <span>
                https://demo.memeradar.invalid/post/{s.first_social_post_id}
              </span>
            </p>
          )}
          <p>
            Création sur chaîne :{" "}
            {indexerDisabled ? "source exclue" : date(s.token.createdAt)}.
          </p>
          {s.reasons.map((r) => (
            <p key={r}>{r}</p>
          ))}
          {s.counterReasons.map((r) => (
            <p className="muted" key={r}>
              Contre-indication : {r}
            </p>
          ))}
          {s.flags.map((f) => (
            <p className="warning-box small" key={f}>
              {f}
            </p>
          ))}
          <p>
            Âge des auteurs : inconnu ; concentration de comptes récents non
            évaluée.
          </p>
          <details>
            <summary>
              Publications associées et méthodes ({s.mentions.length})
            </summary>
            {s.mentions
              .filter((m) => method === "all" || m.method === method)
              .map((m, i) => (
                <article
                  className="conversation-post"
                  key={m.postId + m.method + i}
                >
                  <strong>{METHOD_LABELS[m.method as Method]} · Observé</strong>
                  <p>
                    {date(m.publishedAt)} · récupéré {date(m.collectedAt)}
                  </p>
                  <p>{m.value}</p>
                  <p>
                    Publication : {m.postId} ·{" "}
                    {m.eventLinked
                      ? "Liée à l’événement par le texte (interprété)"
                      : "Lien à l’événement non établi"}
                  </p>
                  {eventRoot(m.postId) && (
                    <a href="#page=conversations&conversation=DEMO_POST_ROOT">
                      Voir la conversation de cette mention
                    </a>
                  )}
                </article>
              ))}
            {!s.mentions.filter((m) => method === "all" || m.method === method)
              .length && (
              <p>Aucune publication disponible pour cette méthode.</p>
            )}
          </details>
          <p>{s.limitations}</p>
          <a href={`#page=events&event=${DEMO_EVENT_ID}`}>
            Voir l’événement Nébula Mobile
          </a>
        </article>
      ))}
      {!snapshots.length && (
        <p>Aucun token V2 correspondant dans ce scénario.</p>
      )}
    </section>
  );
}
const eventRoot = (id: string) =>
  id.startsWith("DEMO_CONV_") ||
  id === "DEMO_POST_ROOT" ||
  id === "DEMO_POST_REPLY";
