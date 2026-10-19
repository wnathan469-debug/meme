import React, { useEffect, useState } from "react";
import type {
  LocalCommand,
  LocalSnapshot,
  LocalSettings,
} from "../../desktop/local-model";
const initial = {
  usernames: "",
  dailyUsd: "1.00",
  monthlyUsd: "20.00",
  requestUsd: "",
  postUsd: "",
  userUsd: "",
  maxRequestsDay: 150,
};
const messages: Record<string, string> = {
  NOT_CONFIGURED: "Accès X non configuré.",
  PRICING_UNKNOWN: "Tarifs à vérifier à nouveau (validité locale : 7 jours).",
  ACCESS_DENIED:
    "Accès refusé par X : vérifiez les droits de votre application.",
  PROTECTED_ACCOUNT:
    "Compte protégé ou statut public non confirmé : aucune timeline collectée.",
  RATE_LIMITED: "Limite de requêtes atteinte. Collecte arrêtée.",
  BUDGET_EXCEEDED: "Plafond de dépenses atteint. Collecte arrêtée.",
  NETWORK_ERROR:
    "Connexion indisponible. Les données conservées restent consultables.",
  TIMEOUT: "X n’a pas répondu dans le délai prévu.",
  INVALID_RESPONSE:
    "Réponse fournisseur invalide : aucune donnée fictive ajoutée.",
  NOT_FOUND: "Profil X introuvable.",
  STORE_UNAVAILABLE: "Stockage local indisponible. Collecte arrêtée.",
  CIRCUIT_OPEN: "Accès temporairement suspendu après des erreurs.",
  NETWORK_DISABLED: "Collecte arrêtée.",
};
export function LocalApp({ demo }: { demo: () => void }) {
  const [state, setState] = useState<LocalSnapshot | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(initial),
    [key, setKey] = useState(""),
    [terms, setTerms] = useState(false),
    [charges, setCharges] = useState(false),
    [pending, setPending] = useState(false);
  const [tab, setTab] = useState("Veille locale"),
    [editing, setEditing] = useState(false);
  const bridge = window.memeradar?.local;
  async function send(command: LocalCommand, input?: unknown) {
    if (!bridge) return;
    setPending(true);
    setError("");
    try {
      const result = await bridge.command(command, input);
      if (result.error) setError(result.error);
      if (result.state) setState(result.state);
      return result;
    } catch {
      setError(
        "Communication locale indisponible. Aucun appel fournisseur ajouté.",
      );
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const r = await bridge?.command("status");
        if (!mounted) return;
        if (r?.state) setState(r.state);
        if (r?.error) setError(r.error);
      } catch {
        if (mounted) setError("Lecture locale indisponible.");
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [bridge]);
  function edit(s: LocalSettings | null) {
    setDraft(s ? { ...s, usernames: s.usernames.join(", ") } : initial);
    setTerms(false);
    setEditing(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await send("configure", {
      ...draft,
      usernames: draft.usernames
        .split(",")
        .map((v) => v.trim().replace(/^@/, ""))
        .filter(Boolean),
      verifiedTermsAndPrices: terms,
    });
    if (result?.state) {
      setEditing(false);
      setCharges(false);
      setNotice("Configuration enregistrée sur ce PC ; collecte arrêtée.");
    }
  }
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("fr-CA") : "Jamais";
  return (
    <div className="local-app">
      <header className="topbar">
        <h1>MemeRadar — sur mon PC</h1>
        <button
          onClick={async () => {
            const result = await send("stop");
            if (result?.state?.stopped) demo();
          }}
        >
          Ouvrir la démonstration
        </button>
      </header>
      <main>
        <p className="banner">
          Stockage et collecte sur cet ordinateur. L’application doit rester
          ouverte, le PC allumé et connecté. Aucun abonnement d’hébergement
          nécessaire.
        </p>
        <nav aria-label="Navigation locale">
          {[
            "Veille locale",
            "Personnes suivies",
            "Sources et accès",
            "Autres modules",
          ].map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <section className="card">
          <h2>Collecte sur ce PC</h2>
          <p role="status">
            {state?.stopped === false
              ? "Collecte autorisée"
              : "Collecte arrêtée"}
            {state?.busy
              ? " · une requête autorisée peut encore se terminer"
              : ""}
          </p>
          <p>
            Trois profils publics maximum, une page de dix publications par
            profil toutes les heures. Une collecte peut être partielle ; aucune
            reprise automatique après fermeture.
          </p>
          <p>
            Dernière tentative : {date(state?.lastCollection ?? null)}. Données
            affichées : {state ? state.posts.length : "inconnues"} publications
            conservées.
          </p>
          {state?.nextCollection && (
            <p>
              Prochain passage au plus tôt : {date(state.nextCollection)}, si la
              collecte reste autorisée et l’application ouverte.
            </p>
          )}
          {state?.error && (
            <p role="alert">
              {messages[state.error] ??
                "Collecte interrompue. Vérifiez les droits, les tarifs et la connexion."}
            </p>
          )}
          {state?.partial && (
            <p>
              Résultat partiel : toutes les publications du compte ne sont pas
              couvertes.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={charges}
              onChange={(e) => setCharges(e.target.checked)}
            />
            J’autorise les appels X selon les tarifs et plafonds enregistrés sur
            ce PC.
          </label>
          <div className="actions">
            <button
              disabled={
                pending ||
                !charges ||
                !state?.hasKey ||
                !state?.settings ||
                !state?.secureStorage ||
                !state.stopped
              }
              onClick={() => void send("start", { acceptCharges: true })}
            >
              Démarrer la collecte
            </button>
            <button
              disabled={!state}
              onClick={() => {
                setCharges(false);
                void send("stop");
              }}
            >
              Arrêter la collecte
            </button>
          </div>
          <p>
            Réservations conservatrices :{" "}
            {state?.usage.dayReservedUsd ?? "Inconnu"} USD pour le jour UTC ;{" "}
            {state?.usage.monthReservedUsd ?? "Inconnu"} USD pour le mois UTC.{" "}
            {state?.usage.requestsDay ?? "Inconnu"} requêtes pour le jour UTC.
            Ce ne sont pas des factures X.
          </p>
          {state?.usage.warning && (
            <p role="alert">
              Au moins 80 % d’un plafond local est réservé. Vérifiez votre
              compte fournisseur.
            </p>
          )}
        </section>
        {tab === "Veille locale" && (
          <section>
            <h2>Publications collectées sur ce PC</h2>
            {!state && (
              <p>
                Lecture du stockage local en cours ou indisponible ; historique
                inconnu.
              </p>
            )}
            {state && !state.posts.length && (
              <p>
                Aucune donnée réelle collectée. Configurez un accès X autorisé
                dans « Sources et accès ». Aucun exemple fictif n’est ajouté
                ici.
              </p>
            )}
            {state?.posts.map((p) => (
              <article className="card" key={p.id}>
                <p>
                  <strong>Donnée X observée</strong> ·{" "}
                  {date(p.publishedAt ?? p.collectedAt)}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{p.text}</p>
                <p>{`https://x.com/i/status/${p.id}`}</p>
                <small>
                  Collectée : {date(p.collectedAt)} · mentions J’aime :{" "}
                  {p.metrics.likes ?? "Inconnu"} · réponses :{" "}
                  {p.metrics.replies ?? "Inconnu"}
                </small>
              </article>
            ))}
          </section>
        )}
        {tab === "Personnes suivies" && (
          <section>
            <h2>Personnes suivies</h2>
            <p>
              Profils demandés :{" "}
              {state?.settings?.usernames.map((v) => "@" + v).join(", ") ||
                "Aucun"}
              .
            </p>
            {state?.people.map((p) => (
              <article className="card" key={p.id}>
                <strong>@{p.username}</strong> — {p.name}
                <p>
                  Profil observé : {date(p.observedAt)}. Abonnés :{" "}
                  {p.followers ?? "Inconnu"}.
                </p>
              </article>
            ))}
          </section>
        )}
        {tab === "Sources et accès" && (
          <section>
            <h2>Sources et accès locaux</h2>
            <p>
              Clé X :{" "}
              {state?.hasKey ? "enregistrée, valeur masquée" : "non configurée"}
              . Protection Windows :{" "}
              {state?.secureStorage
                ? "disponible"
                : "indisponible : enregistrement et collecte bloqués"}
              .
            </p>
            <p>
              La clé est chiffrée pour votre session Windows. Elle n’est pas
              envoyée à un serveur MemeRadar. Saisissez-la uniquement ici,
              jamais dans la conversation.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const value = key;
                setKey("");
                const result = await send("key", value);
                if (result?.state)
                  setNotice(
                    "Clé protégée enregistrée ; aucun appel X effectué.",
                  );
              }}
            >
              <label>
                Jeton Bearer X
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  maxLength={4096}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <button
                disabled={
                  pending || !state?.secureStorage || state.busy || !key
                }
              >
                Enregistrer la clé
              </button>
            </form>
            <button
              disabled={pending || !state?.hasKey}
              onClick={() => {
                setCharges(false);
                void send("forgetKey");
              }}
            >
              Supprimer la clé et arrêter
            </button>
            <p>
              Les clés de l’application ne sont jamais renvoyées dans les
              écrans. Les données locales restent après désinstallation ; leur
              suppression et celle des plafonds ne réduisent pas une facture
              déjà due.
            </p>
            <button
              disabled={state?.busy}
              onClick={() => edit(state?.settings ?? null)}
            >
              Configurer les profils et budgets
            </button>
            <p>
              Tarifs vérifiés par vous le : {date(state?.verifiedAt ?? null)}.
              Nouvelle vérification nécessaire après sept jours.
            </p>
            {editing && (
              <form className="card" onSubmit={save}>
                <label>
                  Profils publics X, séparés par une virgule
                  <input
                    value={draft.usernames}
                    maxLength={80}
                    required
                    onChange={(e) =>
                      setDraft({ ...draft, usernames: e.target.value })
                    }
                  />
                </label>
                {(
                  [
                    ["dailyUsd", "Plafond quotidien USD"],
                    ["monthlyUsd", "Plafond mensuel USD"],
                    ["requestUsd", "Coût maximal par requête USD"],
                    ["postUsd", "Coût maximal par publication retournée USD"],
                    ["userUsd", "Coût maximal par profil retourné USD"],
                  ] as const
                ).map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      inputMode="decimal"
                      placeholder="À vérifier dans votre portail X"
                      value={draft[name]}
                      required
                      onChange={(e) =>
                        setDraft({ ...draft, [name]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label>
                  Requêtes maximum par jour
                  <input
                    type="number"
                    min={1}
                    max={150}
                    value={draft.maxRequestsDay}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        maxRequestsDay: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <p>
                  Les tarifs ne sont pas présumés gratuits. Renseignez les
                  bornes correspondant aux droits et à la facturation de votre
                  compte X. Si le tarif ne peut pas être représenté par ces
                  bornes, ne démarrez pas la collecte.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
                  J’ai vérifié les droits de lecture, de conservation et les
                  bornes de facturation dans mon compte X.
                </label>
                <button disabled={!terms || pending || state?.busy}>
                  Enregistrer la configuration locale
                </button>
              </form>
            )}
          </section>
        )}
        {tab === "Autres modules" && (
          <section>
            <h2>Modules à raccorder</h2>
            <p>
              Prix, graphiques, risques, conversations, événements et
              notifications automatiques ne sont pas encore raccordés au moteur
              local. Ils ne présentent aucune donnée fictive dans ce mode.
            </p>
            <p>
              La démonstration reste accessible séparément pour essayer ces
              interfaces.
            </p>
          </section>
        )}
        <footer>
          <p>
            Les plafonds couvrent cette installation uniquement ; les autres
            applications utilisant votre compte X restent hors de son contrôle.
            Une requête déjà autorisée peut être facturée après l’arrêt.
          </p>
          <p>
            Données X conservées jusqu’à sept jours et purgées pendant
            l’utilisation ; 300 publications récentes maximum affichées. Les
            anciennes données restent datées et ne prouvent pas l’état actuel
            d’un compte.
          </p>
          <p>MemeRadar n’est pas un conseil financier.</p>
        </footer>
      </main>
    </div>
  );
}
