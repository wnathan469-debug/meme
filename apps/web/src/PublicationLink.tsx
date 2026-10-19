import React from "react";
export function OpenX({ id, origin }: { id: string; origin: "DEMO" | "REAL" }) {
  if (origin === "DEMO" || !/^\d{1,25}$/.test(id))
    return (
      <button
        className="chart-open"
        disabled
        title="Publication fictive : aucun lien X réel"
      >
        Ouvrir sur X (démo)
      </button>
    );
  return (
    <a
      className="chart-open"
      href={`https://x.com/i/web/status/${id}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Ouvrir sur X · x.com
    </a>
  );
}
