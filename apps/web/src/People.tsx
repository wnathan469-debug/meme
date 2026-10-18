import { demoUsers, demoPosts } from "../../../packages/connectors/x/demo-data";
import { normalizePost } from "../../../packages/connectors/x/contracts";
import React, { useState } from "react";
import { z } from "zod";
import {
  parsePerson,
  personInput,
  intervals,
  type PersonInput,
  type Category,
} from "../../../packages/people/model";
const recordSchema = personInput.extend({
  id: z.string().uuid(),
  xUserId: z.string().nullable(),
  validation: z.enum([
    "validated_via_api",
    "unvalidated",
    "not_found",
    "suspended_or_unavailable",
  ]),
});
const storageSchema = z.object({
  people: z.array(recordSchema).max(1000),
  categories: z
    .array(
      z.object({ id: z.string().uuid(), name: z.string().min(1).max(100) }),
    )
    .max(100),
});
type RecordPerson = z.infer<typeof recordSchema>;
const key = "memeradar-demo-people-v2";
const blank: PersonInput = {
  username: "",
  name: "",
  categoryId: null,
  keywords: [],
  privateNote: "",
  priority: "normal",
  status: "paused",
};
const profiles = demoUsers;
export function People() {
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return {
        value: raw
          ? storageSchema.parse(JSON.parse(raw))
          : { people: [], categories: [] },
        error: "",
      };
    } catch {
      return {
        value: { people: [], categories: [] },
        error:
          "Stockage illisible : les données existantes sont conservées. Les modifications sont désactivées.",
      };
    }
  });
  const [people, setPeople] = useState<RecordPerson[]>(initial.value.people),
    [categories, setCategories] = useState<Category[]>(
      initial.value.categories,
    );
  const [form, setForm] = useState<PersonInput>(blank),
    [editing, setEditing] = useState<string | null>(null),
    [pending, setPending] = useState<PersonInput | null>(null),
    [message, setMessage] = useState(initial.error),
    [categoryName, setCategoryName] = useState(""),
    [categoryEdit, setCategoryEdit] = useState<string | null>(null),
    [replacement, setReplacement] = useState(""),
    [filter, setFilter] = useState("");
  function persist(next: RecordPerson[], cats: Category[]) {
    if (initial.error) return false;
    try {
      localStorage.setItem(
        key,
        JSON.stringify(storageSchema.parse({ people: next, categories: cats })),
      );
      setPeople(next);
      setCategories(cats);
      return true;
    } catch {
      setMessage(
        "Enregistrement impossible ; les modifications ne sont pas sauvegardées.",
      );
      return false;
    }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const parsed = parsePerson(
        {
          ...form,
          keywords: form.keywords.map((k) => k.trim()).filter(Boolean),
        },
        "DEMO",
      );
      if (editing) {
        if (
          persist(
            people.map((p) => (p.id === editing ? { ...p, ...parsed } : p)),
            categories,
          )
        ) {
          setEditing(null);
          setForm(blank);
          setMessage("Fiche modifiée.");
        }
      } else setPending(parsed);
    } catch {
      setMessage(
        "Identifiant invalide. Utilisez un @pseudo ou une URL de profil X valide.",
      );
    }
  }
  function confirm() {
    if (!pending) return;
    setDuplicateId(null);
    const profile = profiles.find((p) => p.username === pending.username);
    const duplicate = people.find((p) =>
      profile ? p.xUserId === profile.id : p.username === pending.username,
    );
    if (duplicate) {
      setDuplicateId(duplicate.id);
      setMessage(
        `Compte déjà suivi : ${duplicate.name || duplicate.username}.`,
      );
      setPending(null);
      return;
    }
    const person: RecordPerson = {
      ...pending,
      id: crypto.randomUUID(),
      xUserId: profile?.id ?? null,
      validation: profile ? "validated_via_api" : "unvalidated",
      status: profile ? pending.status : "paused",
    };
    if (persist([...people, person], categories)) {
      setPending(null);
      setForm(blank);
      setMessage("Personne ajoutée en démonstration locale.");
    }
  }
  const preview = pending
    ? profiles.find((p) => p.username === pending.username)
    : null;
  return (
    <section className="people-page" aria-label="Gestion des personnes">
      <p className="notice">
        DÉMO locale hors ligne. Essayez @demo_analyste_julie ou
        @demo_fondateur_marc. La confirmation est simulée, sans appel à X. Ces
        fiches sont conservées sur cet appareil ; aucune collecte automatique
        n’est lancée par cet écran.
      </p>
      <p>
        Une mention observée ne prouve ni promotion ni soutien. Un compte connu
        ne garantit pas la légitimité ou le caractère officiel d’un token.
      </p>
      <p>
        Les notes démo sont privées à cette session Windows ou ce profil de
        navigateur, stockées localement sans chiffrement applicatif. Elles ne
        sont envoyées à aucun fournisseur.
      </p>
      {message && <p role="status">{message}</p>}
      {duplicateId && (
        <a
          href={`#page=people&person=${duplicateId}`}
          onClick={(e) => {
            e.preventDefault();
            const target = document.getElementById(`person-${duplicateId}`);
            target?.scrollIntoView({ block: "center" });
            target?.focus();
          }}
        >
          Voir la fiche existante
        </a>
      )}
      <form onSubmit={submit} className="panel">
        <h2>{editing ? "Modifier la fiche" : "Ajouter une personne"}</h2>
        <label>
          Identifiant X ou URL de profil
          <input
            required
            maxLength={512}
            disabled={!!editing}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </label>
        <label>
          Nom personnalisé
          <input
            maxLength={200}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          Catégorie
          <select
            aria-label="Catégorie"
            value={form.categoryId ?? ""}
            onChange={(e) =>
              setForm({ ...form, categoryId: e.target.value || null })
            }
          >
            <option value="">Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mots-clés séparés par des virgules
          <input
            value={form.keywords.join(",")}
            onChange={(e) =>
              setForm({ ...form, keywords: e.target.value.split(",") })
            }
          />
        </label>
        <label>
          Note privée
          <textarea
            maxLength={10000}
            value={form.privateNote}
            onChange={(e) => setForm({ ...form, privateNote: e.target.value })}
          />
        </label>
        <label>
          Priorité
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority: e.target.value as PersonInput["priority"],
              })
            }
          >
            <option value="low">Basse</option>
            <option value="normal">Normale</option>
            <option value="high">Haute</option>
            <option value="critical">Critique</option>
          </select>
        </label>
        <p>
          Intervalle prévu : {intervals[form.priority] / 60} min. Coût réel
          inconnu sans tarification configurée. Démonstration sans dépense.
        </p>
        <button type="submit" disabled={!!initial.error}>
          {editing ? "Enregistrer la fiche" : "Vérifier le compte"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(blank);
            }}
          >
            Annuler la modification
          </button>
        )}
      </form>
      {pending && (
        <section className="panel" aria-label="Confirmation du compte">
          <h2>Confirmer le compte</h2>
          <p>
            {preview
              ? `${preview.name} — @${preview.username} — ${preview.id}`
              : "Compte non présent dans les fixtures : ajout non validé, en pause."}
          </p>
          <p>Abonnés : inconnus. Validation simulée en DÉMO.</p>
          <button onClick={confirm} disabled={!!initial.error}>
            {preview ? "Confirmer l’ajout" : "Ajouter sans validation"}
          </button>
          <button onClick={() => setPending(null)}>Annuler l’ajout</button>
        </section>
      )}
      <section className="panel">
        <h2>Catégories personnalisées</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = categoryName.trim();
            if (
              !name ||
              categories.some(
                (c) =>
                  c.name.toLowerCase() === name.toLowerCase() &&
                  c.id !== categoryEdit,
              )
            ) {
              setMessage("Nom de catégorie vide ou déjà utilisé.");
              return;
            }
            const cats = categoryEdit
              ? categories.map((c) =>
                  c.id === categoryEdit ? { ...c, name } : c,
                )
              : [...categories, { id: crypto.randomUUID(), name }];
            if (persist(people, cats)) {
              setCategoryName("");
              setCategoryEdit(null);
            }
          }}
        >
          <label>
            Nom de catégorie
            <input
              required
              maxLength={100}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
          </label>
          <button disabled={!!initial.error}>
            {categoryEdit ? "Renommer la catégorie" : "Créer la catégorie"}
          </button>
        </form>
        <label>
          Réaffecter les fiches lors d’une suppression
          <select
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          >
            <option value="">Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {categories.map((c) => (
          <p key={c.id}>
            {c.name}{" "}
            <button
              onClick={() => {
                setCategoryEdit(c.id);
                setCategoryName(c.name);
              }}
            >
              Renommer {c.name}
            </button>{" "}
            <button
              disabled={!!initial.error || replacement === c.id}
              onClick={() => {
                if (
                  persist(
                    people.map((p) =>
                      p.categoryId === c.id
                        ? { ...p, categoryId: replacement || null }
                        : p,
                    ),
                    categories.filter((x) => x.id !== c.id),
                  )
                ) {
                  setReplacement("");
                  setCategoryEdit(null);
                  setCategoryName("");
                  setEditing(null);
                  setForm(blank);
                }
              }}
            >
              Supprimer {c.name}
            </button>
          </p>
        ))}
      </section>
      <label>
        Filtrer les personnes
        <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      </label>
      {people
        .filter((p) =>
          `${p.name} ${p.username} ${p.keywords.join(" ")}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
        )
        .map((p) => (
          <article
            className="panel"
            key={p.id}
            tabIndex={-1}
            id={`person-${p.id}`}
          >
            <h2>
              {p.name ||
                profiles.find((x) => x.id === p.xUserId)?.name ||
                p.username}
            </h2>
            <p>
              @{p.username} · {p.xUserId ?? "Identifiant stable absent"} ·{" "}
              {p.validation === "validated_via_api"
                ? "Validation simulée DÉMO"
                : "Non validé"}{" "}
              · {p.status === "active" ? "Actif (démo)" : "En pause"}
            </p>
            <p>
              Catégorie :{" "}
              {categories.find((c) => c.id === p.categoryId)?.name ??
                "Sans catégorie"}
              . Priorité : {p.priority}. Mots-clés :{" "}
              {p.keywords.join(", ") || "Aucun"}.
            </p>
            <h3>Note privée</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {p.privateNote || "Aucune note"}
            </p>
            <PersonObservations person={p} />
            <span>
              Profil fictif : https://demo.memeradar.invalid/{p.username}
            </span>
            <p>
              <button
                onClick={() => {
                  setEditing(p.id);
                  setForm({ ...p });
                  setPending(null);
                }}
              >
                Modifier {p.username}
              </button>{" "}
              <button
                disabled={!!initial.error || !p.xUserId}
                onClick={() =>
                  persist(
                    people.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            status: x.status === "active" ? "paused" : "active",
                          }
                        : x,
                    ),
                    categories,
                  )
                }
              >
                {p.status === "active" ? "Mettre en pause" : "Réactiver"}{" "}
                {p.username}
              </button>{" "}
              <button
                disabled={!!initial.error}
                onClick={() => {
                  if (
                    persist(
                      people.filter((x) => x.id !== p.id),
                      categories,
                    )
                  ) {
                    setEditing(null);
                    setForm(blank);
                  }
                }}
              >
                Supprimer {p.username}
              </button>
            </p>
          </article>
        ))}
      {!people.length && <p>Aucune personne suivie.</p>}
    </section>
  );
}

function PersonObservations({ person }: { person: RecordPerson }) {
  const [text, setText] = useState(""),
    [type, setType] = useState("");
  const posts = demoPosts
    .filter((p) => p.author_id === person.xUserId)
    .map((p) => normalizePost(p, "DEMO", "2026-01-15T14:10:00.000Z"));
  const visible = posts.filter(
    (p) =>
      p.text.toLowerCase().includes(text.toLowerCase()) &&
      (!type || p.type === type),
  );
  const days = [...new Set(posts.map((p) => p.publishedAt!.slice(0, 10)))];
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: posts.filter((p) => new Date(p.publishedAt!).getUTCHours() === hour)
      .length,
  }));
  return (
    <section aria-label={`Publications de ${person.username}`}>
      <h3>Publications observées en DÉMO</h3>
      <p>
        Instantané fictif du 15 janvier 2026 ; {posts.length} publications
        uniques dans ces fixtures. Couverture partielle, publications manquées
        inconnues. Ces exemples restent consultables en pause ; aucune collecte
        réseau.
      </p>
      <label>
        Texte des publications
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label>
        Type de publication
        <select
          aria-label="Type de publication"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Tous</option>
          <option value="original">Original</option>
          <option value="reply">Réponse</option>
          <option value="quote">Citation</option>
          <option value="repost">Republication</option>
          <option value="unknown">Inconnu</option>
        </select>
      </label>
      {visible.map((p) => (
        <div key={p.id}>
          <p>{p.text}</p>
          <p>
            {p.publishedAt} · {p.type} · J’aime :{" "}
            {p.metrics.likes ?? "inconnus"} · Réponses :{" "}
            {p.metrics.replies ?? "inconnues"} · Republications :{" "}
            {p.metrics.reposts ?? "inconnues"} · Citations :{" "}
            {p.metrics.quotes ?? "inconnues"}
          </p>
          <span>
            Publication fictive : https://demo.memeradar.invalid/post/{p.id}
          </span>
        </div>
      ))}
      {!visible.length && (
        <p>Aucune publication correspondante dans cet instantané.</p>
      )}
      <details>
        <summary>Activité et mots-clés observés</summary>
        <p>
          Calcul sur ces seules publications, horaires UTC. Aucun total
          d’activité du compte déduit.
        </p>
        <table>
          <caption>Publications par jour</caption>
          <thead>
            <tr>
              <th>Jour UTC</th>
              <th>Publications</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <td>{day}</td>
                <td>
                  {posts.filter((p) => p.publishedAt!.startsWith(day)).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Par heure UTC :{" "}
          {hours.map((h) => `${h.hour} h : ${h.count}`).join(" ; ")}
        </p>
        {person.keywords.map((keyword) => (
          <p key={keyword}>
            {keyword} :{" "}
            {
              posts.filter((p) =>
                p.text.toLowerCase().includes(keyword.toLowerCase()),
              ).length
            }{" "}
            publications (sous-chaîne insensible à la casse).
          </p>
        ))}
      </details>
      <p>
        Liens vers événements et tokens : aucun enregistré dans ces fixtures.
        Alertes de personnes : prévues en phase 10. Mention observée, sans
        soutien déduit.
      </p>
    </section>
  );
}
