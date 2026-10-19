import React from "react";
import { navigation, pageHref, type Page } from "./navigation";
export function Navigation({
  page,
  alertCount,
}: {
  page: Page;
  alertCount: number;
}) {
  return (
    <nav aria-label="Navigation principale">
      {navigation.map((n) => (
        <a
          key={n.id}
          href={pageHref(n.id, location.hash)}
          title={n.label}
          aria-current={
            (page === "analysis" ? "tokens" : page) === n.id
              ? "page"
              : undefined
          }
          className={
            (page === "analysis" ? "tokens" : page) === n.id ? "active" : ""
          }
        >
          <span aria-hidden>{n.icon}</span>
          {n.label}
          {n.id === "alerts" && (
            <span
              className="nav-count"
              aria-label={`${alertCount} alertes non lues`}
            >
              {alertCount}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
