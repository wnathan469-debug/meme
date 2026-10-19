import React, {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  initialSession,
  sessionSchema,
  moveSession,
  faultSession,
  type DemoSession,
} from "../../../packages/demo/scenario";
const key = "memeradar-demo-session-phase13-v1";
function load() {
  try {
    const raw = localStorage.getItem(key);
    if (raw && raw.length > 4096) throw new Error();
    return {
      state: raw ? sessionSchema.parse(JSON.parse(raw)) : initialSession(),
      error: "",
    };
  } catch {
    return {
      state: initialSession(),
      error:
        "Session de démonstration illisible : fichier conservé, horloge et simulations verrouillées.",
    };
  }
}
const Context = createContext<{
  state: DemoSession;
  error: string;
  setMinute: (v: SetStateAction<number>) => void;
  setFault: (v: DemoSession["fault"]) => void;
} | null>(null);
export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(load),
    [state, setState] = useState(initial.state),
    [error, setError] = useState(initial.error),
    current = useRef(state);
  const save = (next: DemoSession) => {
    if (error) return;
    try {
      const valid = sessionSchema.parse(next);
      localStorage.setItem(key, JSON.stringify(valid));
      current.current = valid;
      setState(valid);
    } catch {
      setError(
        "Enregistrement de la session impossible : état précédent conservé, commandes verrouillées.",
      );
    }
  };
  return (
    <Context.Provider
      value={{
        state,
        error,
        setMinute: (v) =>
          save(
            moveSession(
              current.current,
              typeof v === "function" ? v(current.current.minute) : v,
            ),
          ),
        setFault: (v) => save(faultSession(current.current, v)),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDemoSession() {
  const context = useContext(Context);
  if (!context) throw new Error("Session démo absente");
  return context;
}
export function DemoScenarioControls() {
  const { state, setFault, error } = useDemoSession();
  return (
    <section className="panel" aria-label="Scénario partagé de démonstration">
      <label>
        État global de la démo
        <select
          value={state.fault}
          disabled={!!error}
          onChange={(e) => setFault(e.target.value as DemoSession["fault"])}
        >
          {Object.entries({
            normal: "Instantané normal",
            partial: "Couverture partielle",
            quota: "Quota X épuisé · 429",
            disconnect: "Flux déconnecté",
            budget: "Budget strict atteint",
            error: "Erreur fournisseur",
            unconfigured: "X non configuré",
          }).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>
        Simulation partagée entre les pages, sans réseau. L’horloge persiste à
        la navigation et au rechargement. Les commandes locales restent des
        diagnostics explicitement simulés.
      </p>
      <details>
        <summary>Parcours guidé Nébula Mobile</summary>
        <ol>
          <li>
            <a href="#page=people">Ajouter un compte fictif</a> :
            @demo_analyste_julie, @demo_fondateur_marc ou @demo_trader_k ;
            confirmer la simulation et l’activer.
          </li>
          <li>
            <a href="#page=watch">Ouvrir la Veille X</a>, puis une conversation
            partielle et une réponse avec adresse.
          </li>
          <li>
            <a href="#page=tokens">Examiner les quatre tokens</a>, leur
            graphique et leurs risques, puis{" "}
            <a href="#page=alerts">créer une alerte</a>.
          </li>
          <li>
            <a href="#page=sources">Simuler un quota 429 dans Sources et API</a>{" "}
            : l’état se retrouve sur les autres pages.
          </li>
        </ol>
        <p>
          Les scénarios V1 restent conservés ; ce parcours est entièrement
          inventé et n’en déduit aucune donnée réelle.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
