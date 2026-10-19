import { useEffect, useState } from "react";
import { routeParams, filterHref } from "./navigation";
/** Small bounded URL state, shared by back/forward navigation and page controls. */
export function useUrlFilters() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const listener = () => setHash(location.hash);
    addEventListener("hashchange", listener);
    return () => removeEventListener("hashchange", listener);
  }, []);
  return {
    patch: (changes: Record<string, string | null>) => {
      const next = filterHref(location.hash, changes);
      setHash(next);
      location.hash = next;
    },
    params: routeParams(hash),
    set: (key: string, value: string) => {
      const next = filterHref(location.hash, { [key]: value });
      setHash(next);
      location.hash = next;
    },
  };
}
