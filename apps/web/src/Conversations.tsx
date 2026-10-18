import { OpenChart } from "./TokenLink";
import { demoChartRegistry } from "../../../packages/charts/demo-data";
import { DEMO_EVENT_ID } from "../../../packages/events/model";
import React, { useState } from "react";
import {
  demoConversationSnapshot,
  demoConversationId,
} from "../../../packages/conversations/demo-data";
import {
  coverage,
  role,
  selectPosts,
  conversationTree,
  commenterSummary,
  contractCandidates,
  type ConversationFilters,
  type ConversationPost,
} from "../../../packages/conversations/model";
export function Conversations({ id }: { id: string }) {
  const [confirmed, setConfirmed] = useState(false),
    [quoted, setQuoted] = useState(false),
    [view, setView] = useState<"tree" | "list">("tree"),
    [simulation, setSimulation] = useState("normal");
  const [filters, setFilters] = useState<ConversationFilters>({
    text: "",
    sort: "date",
    addressOnly: false,
    followedOnly: false,
  });
  if (id !== demoConversationId)
    return (
      <section className="panel">
        <h2>Conversation indisponible dans ces fixtures</h2>
        <p>
          Aucun appel à X. La démonstration contient une seule conversation
          fictive.
        </p>
        <a href={`#page=conversations&conversation=${demoConversationId}`}>
          Voir le scénario démo
        </a>
      </section>
    );
  const all = confirmed ? demoConversationSnapshot() : [];
  const posts =
    simulation === "unavailable"
      ? all.filter((p) => p.id !== id)
      : simulation === "unknown_count"
        ? all.map((p) =>
            p.id === id
              ? { ...p, metrics: { ...p.metrics, replies: null } }
              : p,
          )
        : all;
  const root = posts.find((p) => p.id === id),
    replies = posts.filter((p) => role(p, id) === "reply"),
    summary = commenterSummary(posts, id);
  const status = coverage(
    replies.length,
    confirmed && simulation !== "unknown_count" && simulation !== "unavailable"
      ? "120"
      : null,
    simulation === "window",
  );
  const selected = selectPosts(posts, filters),
    replyIds = new Set(
      selected.filter((p) => role(p, id) === "reply").map((p) => p.id),
    );
  const tree = conversationTree(
    selectPosts(posts, { sort: filters.sort }),
    id,
  ).filter((n) => replyIds.has(n.post.id));
  const chronological = selected.filter((p) => role(p, id) === "reply");
  const quotes = selected.filter((p) => role(p, id) === "quote");
  return (
    <section className="conversation-page" aria-label="Conversation fictive">
      <p className="notice">
        DÉMO hors ligne : Nébula Mobile, publications et comptes entièrement
        inventés. Instantané du 15 janvier 2026. Aucun appel à X et aucune
        dépense.
      </p>
      {!confirmed && (
        <section className="panel">
          <h2>Charger une conversation</h2>
          <p>
            La version serveur prépare un devis selon les tarifs et les droits
            configurés avant toute requête facturable. Cette simulation charge
            uniquement des données intégrées.
          </p>
          <button onClick={() => setQuoted(true)}>
            Préparer le chargement
          </button>
          {quoted && (
            <section aria-label="Confirmation du chargement">
              <h3>Estimation démo : 0 USD</h3>
              <p>
                Zéro appel réseau. Racine, 35 réponses récupérées sur environ
                120 déclarées et une citation. Les données sont partielles.
              </p>
              <button
                onClick={() => {
                  setConfirmed(true);
                  setQuoted(false);
                }}
              >
                Confirmer le chargement démo
              </button>
              <button onClick={() => setQuoted(false)}>
                Annuler le chargement
              </button>
            </section>
          )}
        </section>
      )}
      {confirmed && (
        <>
          <section className="panel" aria-label="Couverture de la conversation">
            <h2>Conversation partielle</h2>
            <p role="status">{status.banner}</p>
            <p>
              Couverture observée :{" "}
              {status.percent === null ? "inconnue" : `${status.percent} %`}.
              Racine et citations exclues du nombre de réponses.
            </p>
            {status.windowNotice && <p>{status.windowNotice}</p>}
            <label>
              Simuler un état
              <select
                aria-label="Simuler un état"
                value={simulation}
                onChange={(e) => setSimulation(e.target.value)}
              >
                <option value="normal">Données partielles</option>
                <option value="window">Fenêtre temporelle dépassée</option>
                <option value="rate_limit">429 — limite de débit</option>
                <option value="budget">Budget épuisé</option>
                <option value="unavailable">Racine indisponible</option>
                <option value="unknown_count">Nombre déclaré inconnu</option>
              </select>
            </label>
            {simulation === "rate_limit" && (
              <p role="alert">
                429 simulé : reprise différée ; les résultats déjà chargés
                restent consultables.
              </p>
            )}
            {simulation === "budget" && (
              <p role="alert">
                Budget épuisé simulé : chargement suspendu, aucune dépense ;
                résultats partiels conservés.
              </p>
            )}
            <p>
              Une mention observée ne prouve ni soutien, ni publicité, ni
              caractère officiel d’un token.
            </p>
          </section>
          <section className="panel">
            <h2>Publication racine</h2>
            {root ? (
              <PostCard post={root} />
            ) : (
              <p>
                Publication racine non récupérée ou indisponible. Les réponses
                accessibles restent consultables.
              </p>
            )}
          </section>
          <section className="panel" aria-label="Filtres de conversation">
            <h2>Réponses</h2>
            <label>
              Rechercher dans la conversation
              <input
                value={filters.text}
                onChange={(e) =>
                  setFilters({ ...filters, text: e.target.value })
                }
              />
            </label>
            <label>
              Trier les réponses
              <select
                aria-label="Trier les réponses"
                value={filters.sort}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    sort: e.target.value as "date" | "interactions",
                  })
                }
              >
                <option value="date">Date chronologique</option>
                <option value="interactions">Interactions connues</option>
              </select>
            </label>
            <p>
              Le tri par interactions compare uniquement les métriques
              disponibles. Des métriques manquantes restent inconnues.
            </p>
            <label>
              <input
                type="checkbox"
                checked={filters.addressOnly}
                onChange={(e) =>
                  setFilters({ ...filters, addressOnly: e.target.checked })
                }
              />{" "}
              Réponses contenant une adresse candidate
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.followedOnly}
                onChange={(e) =>
                  setFilters({ ...filters, followedOnly: e.target.checked })
                }
              />{" "}
              Personnes suivies dans ces fixtures
            </label>
            <label>
              Token lié
              <select
                aria-label="Token lié"
                value={filters.tokenId ?? ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    tokenId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Tous les tokens</option>
                <option value="00000000-0000-4000-8000-000000000071">
                  [DÉMO] Nébula Étincelle · Base · adresse exacte
                </option>
              </select>
            </label>
            <label>
              Événement lié
              <select
                aria-label="Événement lié"
                value={filters.eventId ?? ""}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    eventId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Tous les événements</option>
                <option value={DEMO_EVENT_ID}>
                  Nébula Mobile — lien interprété
                </option>
              </select>
            </label>
            <p>
              Les liens d’événement sont interprétés ; les tokens sont liés par
              chaîne et adresse exacte dans le registre fictif. Une adresse
              candidate ne prouve pas un contrat légitime.
            </p>
            <div role="group" aria-label="Mode de lecture">
              <button
                aria-pressed={view === "tree"}
                onClick={() => setView("tree")}
              >
                Vue en arbre
              </button>
              <button
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                Liste chronologique
              </button>
            </div>
          </section>
          <section className="panel" aria-label="Réponses récupérées">
            <p>
              {replyIds.size} réponses affichées après filtres ;{" "}
              {replies.length} récupérées dans cet instantané. Le taux de
              couverture ne dépend pas des filtres.
            </p>
            {view === "tree"
              ? tree.map((n) => (
                  <article
                    key={n.post.id}
                    style={{ marginInlineStart: Math.min(n.depth, 6) * 12 }}
                  >
                    <p>
                      {n.missingParent
                        ? "Réponse à une publication non récupérée (maillon manquant)."
                        : n.cycle
                          ? "Référence circulaire ou profondeur excessive : arborescence interrompue."
                          : `Niveau ${n.depth} de réponse.`}
                    </p>
                    <PostCard post={n.post} />
                  </article>
                ))
              : chronological.map((p) => (
                  <article key={p.id}>
                    <PostCard post={p} />
                  </article>
                ))}
            {!replyIds.size && (
              <p>
                Aucune réponse correspondant aux filtres parmi les données
                récupérées. Ce résultat ne prouve pas l’absence d’autres
                commentaires.
              </p>
            )}
          </section>
          <section className="panel" aria-label="Citations récupérées">
            <h2>Citations récupérées séparément</h2>
            <p>
              Ces citations ne sont pas comptées dans les {replies.length}{" "}
              réponses récupérées.
            </p>
            {quotes.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
            {!quotes.length && (
              <p>
                Aucune citation correspondant aux filtres dans cet instantané.
              </p>
            )}
          </section>
          <section className="panel" aria-label="Statistiques anonymes">
            <h2>Commentateurs : statistiques agrégées</h2>
            <p>
              {summary.distinctCommenters} comptes distincts observés dans les
              réponses récupérées. Proportion de comptes récents : inconnue, âge
              non collecté.
            </p>
            <p>{summary.method}</p>
            {summary.coordinationHypothesis && (
              <p>
                {summary.publicationsInIdenticalGroups} réponses dans{" "}
                {summary.identicalTextGroups} groupe de textes identiques.{" "}
                {summary.coordinationHypothesis}
              </p>
            )}
            <p>
              Aucune fiche de commentateur ni analyse de son activité hors de
              cette conversation n’est créée.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
function PostCard({ post }: { post: ConversationPost }) {
  const addresses = contractCandidates(post.text, post.dataOrigin);
  const postUrl =
    post.dataOrigin === "DEMO"
      ? `https://demo.memeradar.invalid/post/${post.id}`
      : `https://x.com/i/web/status/${post.id}`;
  return (
    <div className="conversation-post">
      <p>
        {post.author
          ? `${post.author.name} — @${post.author.username}`
          : "Auteur non fourni par l’API"}
      </p>
      {post.author && (
        <span>
          Profil{" "}
          {post.dataOrigin === "DEMO"
            ? `fictif : https://demo.memeradar.invalid/${post.author.username}`
            : `: https://x.com/${post.author.username}`}
        </span>
      )}
      <p>{post.text}</p>
      <p>
        {post.publishedAt ?? "Date de publication inconnue"} · J’aime :{" "}
        {post.metrics.likes ?? "inconnus"} · Réponses :{" "}
        {post.metrics.replies ?? "inconnues"} · Republications :{" "}
        {post.metrics.reposts ?? "inconnues"} · Citations :{" "}
        {post.metrics.quotes ?? "inconnues"}
      </p>
      {post.dataOrigin === "DEMO" ? (
        <span>Publication fictive : {postUrl}</span>
      ) : (
        <a href={postUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir sur X
        </a>
      )}
      {addresses.length > 0 && (
        <p className="address-candidate">
          Adresse candidate non vérifiée : {addresses.join(", ")}
        </p>
      )}
      {post.tokenIds
        .map((id) => demoChartRegistry.find((t) => t.id === id))
        .filter((t) => !!t)
        .map((t) => (
          <OpenChart key={t!.id} chain={t!.chain} address={t!.address} />
        ))}
      {post.tokenIds.map((id) => (
        <a key={id} href={`#page=tokens&token=${encodeURIComponent(id)}`}>
          Voir le token lié
        </a>
      ))}
      {post.eventIds.map((id) => (
        <a key={id} href={`#page=events&event=${encodeURIComponent(id)}`}>
          Voir l’événement lié
        </a>
      ))}
    </div>
  );
}
