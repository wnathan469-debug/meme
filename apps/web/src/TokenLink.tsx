import React from "react";
import { tokenPath } from "../../../packages/charts/model";
import type { Chain } from "../../../packages/social/identity";
export function OpenChart({
  chain,
  address,
}: {
  chain: string;
  address: string;
}) {
  return (
    <a
      className="chart-open"
      href={"#" + tokenPath(chain.toLowerCase() as Chain, address)}
    >
      Ouvrir le graphique
    </a>
  );
}
