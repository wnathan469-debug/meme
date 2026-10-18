import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type UTCTimestamp,
  type Time,
  type SeriesMarker,
} from "lightweight-charts";
import {
  parseTokenPath,
  displayText,
  tokenPath,
  buildExternalTokenUrls,
  buildExternalWalletUrl,
  intervals,
  type Interval,
  type ChartSlot,
  type Marker,
} from "../../../packages/charts/model";
import { project, compare } from "../../../packages/charts/decimal";
import {
  demoChartSnapshot,
  type DemoChartState,
} from "../../../packages/charts/demo-data";
import { tokens as legacyTokens } from "../../../packages/core/demo";
import { WARNING, LABELS, RISK_WARNING } from "../../../packages/core/domain";
const unix = (at: string) => Math.floor(Date.parse(at) / 1000) as UTCTimestamp;
function FinancialCanvas({
  slots,
  markers,
  zone,
  theme,
  onMarker,
}: {
  slots: ChartSlot[];
  markers: Marker[];
  zone: string;
  theme: string;
  onMarker: (m: Marker) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    volume = useRef<ISeriesApi<"Histogram"> | null>(null),
    markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null),
    previous = useRef<string[]>([]);
  const [gapMarkers, setGapMarkers] = useState<{ marker: Marker; x: number }[]>(
    [],
  );
  const [hover, setHover] = useState(
    "Survolez une bougie ; les valeurs exactes restent disponibles dans le tableau.",
  );
  const data = useMemo(
    () =>
      slots.map((s) => {
        const c = s.candle,
          p = c ? [c.open, c.high, c.low, c.close].map(project) : [];
        return c && p.every((n) => n !== null)
          ? {
              time: unix(s.at),
              open: p[0]!,
              high: p[1]!,
              low: p[2]!,
              close: p[3]!,
            }
          : { time: unix(s.at) };
      }),
    [slots],
  );
  useEffect(() => {
    if (!host.current) return;
    const dark = theme === "dark";
    const instance = createChart(host.current, {
      autoSize: true,
      height: 380,
      layout: {
        background: {
          type: ColorType.Solid,
          color: dark ? "#14211f" : "#ffffff",
        },
        textColor: dark ? "#d7e4df" : "#314c43",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: dark ? "#263c34" : "#edf2ef" },
        horzLines: { color: dark ? "#263c34" : "#edf2ef" },
      },
      localization: {
        locale: "fr-CA",
        timeFormatter: (t: Time) =>
          typeof t === "number"
            ? new Intl.DateTimeFormat("fr-CA", {
                timeZone: zone,
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(t * 1000))
            : String(t),
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: Time) =>
          typeof t === "number"
            ? new Intl.DateTimeFormat("fr-CA", {
                timeZone: zone,
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(t * 1000))
            : null,
      },
      rightPriceScale: { borderVisible: false },
    });
    chart.current = instance;
    series.current = instance.addSeries(CandlestickSeries, {
      upColor: "#08755f",
      downColor: "#c46035",
      borderVisible: false,
      wickUpColor: "#08755f",
      wickDownColor: "#c46035",
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });
    volume.current = instance.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volume.current
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    series.current
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.06, bottom: 0.25 } });
    markerApi.current = createSeriesMarkers(series.current, []);
    previous.current = [];
    return () => {
      instance.remove();
      chart.current = null;
      series.current = null;
      volume.current = null;
      markerApi.current = null;
    };
  }, [theme, zone]);
  useEffect(() => {
    const c = chart.current,
      s = series.current,
      v = volume.current;
    if (!c || !s || !v) return;
    const magnitudes = data
      .flatMap((d) => ("close" in d ? [d.open, d.high, d.low, d.close] : []))
      .filter((n): n is number => typeof n === "number" && n > 0);
    const minimum = magnitudes.length ? Math.min(...magnitudes) : 1;
    s.applyOptions({
      priceFormat: {
        type: "custom",
        minMove:
          10 ** Math.max(-15, Math.min(0, Math.floor(Math.log10(minimum)) - 6)),
        formatter: (n: number) =>
          n.toLocaleString("fr-CA", {
            maximumSignificantDigits: 12,
            useGrouping: false,
          }),
      },
    });
    const keys = data.map((d) => JSON.stringify(d)),
      prior = previous.current,
      incremental =
        prior.length > 0 &&
        keys.length >= prior.length &&
        prior.slice(0, -1).every((k, i) => k === keys[i]);
    const vol = slots.map((slot) => ({
      time: unix(slot.at),
      ...(slot.candle?.volume !== null &&
      slot.candle?.volume !== undefined &&
      project(slot.candle.volume) !== null
        ? {
            value: project(slot.candle.volume)!,
            color:
              slot.candle && compare(slot.candle.close, slot.candle.open) >= 0
                ? "#08755f66"
                : "#c4603566",
          }
        : {}),
    }));
    if (incremental) {
      for (let i = prior.length - 1; i < data.length; i++) {
        s.update(data[i]);
        v.update(vol[i]);
      }
    } else {
      s.setData(data);
      v.setData(vol);
      c.timeScale().fitContent();
    }
    previous.current = keys;
    const first = slots[0] ? Date.parse(slots[0].at) : 0,
      step = slots.length > 1 ? Date.parse(slots[1].at) - first : 60000;
    const mapped: SeriesMarker<Time>[] = markers
      .filter(
        (m) =>
          Date.parse(m.at) >= first &&
          Date.parse(m.at) <= Date.parse(slots.at(-1)?.at ?? "") + step &&
          slots.some(
            (slot) =>
              slot.candle &&
              Math.floor(Date.parse(m.at) / step) * step ===
                Date.parse(slot.at),
          ),
      )
      .map((m) => ({
        time: ((Math.floor(Date.parse(m.at) / step) * step) /
          1000) as UTCTimestamp,
        position: "aboveBar" as const,
        shape: "circle" as const,
        color:
          m.kind === "price_change" || m.kind === "liquidity_change"
            ? "#b7652b"
            : "#276bb0",
        text:
          m.kind === "x_post"
            ? "X"
            : m.kind === "event"
              ? "Événement"
              : m.kind === "alert"
                ? "Alerte"
                : "Δ",
        id: m.id,
      }))
      .sort((a, b) => Number(a.time) - Number(b.time));
    markerApi.current?.setMarkers(mapped);
    const syncGaps = () => {
      const items = markers.filter(
        (m) =>
          Date.parse(m.at) >= first &&
          Date.parse(m.at) < Date.parse(slots.at(-1)?.at ?? "") + step &&
          !slots.some(
            (slot) =>
              slot.candle &&
              Math.floor(Date.parse(m.at) / step) * step ===
                Date.parse(slot.at),
          ),
      );
      setGapMarkers(
        [
          ...new Map(
            items.map((m) => [Math.floor(Date.parse(m.at) / step), m]),
          ).values(),
        ].flatMap((marker) => {
          const x = c
            .timeScale()
            .timeToCoordinate(
              ((Math.floor(Date.parse(marker.at) / step) * step) /
                1000) as UTCTimestamp,
            );
          return x === null ? [] : [{ marker, x: Number(x) }];
        }),
      );
    };
    const gapFrame = requestAnimationFrame(syncGaps);
    c.timeScale().subscribeVisibleLogicalRangeChange(syncGaps);
    c.timeScale().subscribeSizeChange(syncGaps);

    const cross = (param: any) => {
      if (typeof param.time !== "number") return;
      const slot = slots.find((x) => unix(x.at) === param.time);
      const mark = markers
        .filter(
          (m) =>
            (Math.floor(Date.parse(m.at) / step) * step) / 1000 === param.time,
        )
        .map((m) => displayText(m.label))
        .join(" ; ");
      const suffix = mark ? " Repères : " + mark : "";
      if (slot?.candle)
        setHover(
          `Prix exact : O ${slot.candle.open} · H ${slot.candle.high} · B ${slot.candle.low} · C ${slot.candle.close} USD. Volume : ${slot.candle.volume ?? "inconnu"} USD.` +
            suffix,
        );
      else setHover("Période sans données : aucune interpolation." + suffix);
    };
    const click = (param: any) => {
      if (typeof param.time !== "number") return;
      const found = markers.find(
        (m) =>
          (Math.floor(Date.parse(m.at) / step) * step) / 1000 === param.time,
      );
      if (found) onMarker(found);
    };
    c.subscribeCrosshairMove(cross);
    c.subscribeClick(click);
    return () => {
      c.unsubscribeCrosshairMove(cross);
      c.unsubscribeClick(click);
      cancelAnimationFrame(gapFrame);
      c.timeScale().unsubscribeVisibleLogicalRangeChange(syncGaps);
      c.timeScale().unsubscribeSizeChange(syncGaps);
    };
  }, [data, slots, markers, onMarker, theme, zone]);
  return (
    <>
      <div className="financial-wrapper">
        <div
          ref={host}
          className="financial-canvas"
          role="img"
          aria-label="Bougies OHLC et histogramme de volume ; trous sans interpolation. Tableau exact et marqueurs accessibles ci-dessous."
        />
        <div
          className="gap-marker-lane"
          aria-label="Repères dans les tranches sans prix"
        >
          {gapMarkers.map(({ marker, x }) => (
            <button
              key={marker.id}
              style={{ left: x }}
              title={displayText(marker.label)}
              aria-label={"Repère sans prix : " + displayText(marker.label)}
              onClick={() => onMarker(marker)}
            >
              {marker.kind === "event"
                ? "Événement"
                : marker.kind === "x_post"
                  ? "X"
                  : "Repère"}
            </button>
          ))}
        </div>
      </div>
      <p aria-label="Valeurs exactes au survol">{hover}</p>
      <p className="muted">
        Bougies : ouverture, haut, bas, clôture. Histogramme : volume en USD ;
        vert hausse, orange baisse. Aucun lien entre les tranches manquantes.
      </p>
      <p>
        TradingView Lightweight Charts™ — Copyright (с) 2025 TradingView, Inc.{" "}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          TradingView
        </a>
        . Apache-2.0 ; graphique rendu localement.
      </p>
    </>
  );
}
export function TokenAnalysis({
  path,
  minute,
  zone,
  theme,
  socialDisabled,
  indexerDisabled,
}: {
  path: string;
  minute: number;
  zone: string;
  theme: string;
  socialDisabled: boolean;
  indexerDisabled: boolean;
}) {
  const identity = parseTokenPath(path, "DEMO"),
    params = new URLSearchParams(location.hash.split("?")[1] ?? ""),
    interval = (params.get("interval") ?? "5m") as Interval,
    range = params.get("range") ?? "1h",
    pool = params.get("pool") ?? undefined,
    simulation = (params.get("simulation") ?? "normal") as DemoChartState;
  const [visible, setVisible] = useState(100),
    [notice, setNotice] = useState(""),
    [marker, setMarker] = useState<Marker | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setVisible(100);
    setMarker(null);
    setNotice("");
    heading.current?.focus();
  }, [path, interval, range, pool, simulation]);
  const valid =
    identity &&
    Object.hasOwn(intervals, interval) &&
    ["1h", "6h", "24h", "7d", "creation"].includes(range) &&
    ["normal", "empty", "unavailable", "stale", "conflict"].includes(
      simulation,
    );
  const snapshot = valid
    ? demoChartSnapshot({
        ...identity,
        interval,
        range,
        minute,
        pool,
        simulation,
        socialDisabled,
        indexerDisabled,
      })
    : null;
  if (!identity || !valid)
    return (
      <section className="panel" aria-label="Erreur de route token">
        <h2>Adresse ou paramètres de token invalides</h2>
        <p>
          La chaîne et l’adresse doivent être valides et distinctes du symbole.
          Aucun fournisseur n’est appelé.
        </p>
        <a href="#page=tokens">Revenir aux tokens détectés</a>
      </section>
    );
  if (!snapshot)
    return (
      <section className="panel">
        <h2>Token absent des données collectées</h2>
        <code>
          {identity.chain} · {identity.address}
        </code>
        <p>
          Aucune donnée de prix n’est disponible pour ce token auprès des
          fournisseurs configurés. Aucun token n’est choisi d’après son symbole.
        </p>
        <a href="#page=tokens">Revenir aux tokens détectés</a>
      </section>
    );
  const s = snapshot,
    date = (at: string | null) =>
      at
        ? new Intl.DateTimeFormat("fr-CA", {
            timeZone: zone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(at))
        : "Non disponible",
    set = (key: string, value: string) => {
      const next = new URLSearchParams(location.hash.split("?")[1] ?? "");
      if (value) next.set(key, value);
      else next.delete(key);
      location.hash =
        tokenPath(identity.chain, identity.address) +
        (next.size ? "?" + next.toString() : "");
    },
    shown = s.slots.slice(-visible),
    legacy = legacyTokens.find((t) => t.id === s.token.id);
  const buys = s.trades.filter((t) => t.side === "buy").length,
    sells = s.trades.filter((t) => t.side === "sell").length;
  return (
    <section
      className="token-analysis"
      aria-label="Analyse et graphique du token"
    >
      <h2 ref={heading} tabIndex={-1}>
        {displayText(s.token.name ?? "Nom indisponible")} · analyse du token
      </h2>
      <div className="warning-box small">{WARNING}</div>
      <p>
        <strong>DÉMO : prix, pools et transactions entièrement fictifs.</strong>{" "}
        Ce jeu de marché illustre le graphique ; il est distinct des instantanés
        historiques V1.
      </p>
      <p>
        {s.token.symbol ?? "Symbole inconnu"} · {s.token.chain} ·{" "}
        {LABELS[s.token.level]}
      </p>
      <div className="address-box">
        <code>{s.token.address}</code>
        <button
          onClick={async () => {
            try {
              if (window.memeradar)
                await window.memeradar.copyAddress(s.token.address);
              else await navigator.clipboard.writeText(s.token.address);
              setNotice("Adresse fictive copiée.");
            } catch {
              setNotice(
                "Copie indisponible : sélectionnez l’adresse complète.",
              );
            }
          }}
        >
          Copier l’adresse
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <p>
        Explorateur fictif (lien désactivé) : demo.memeradar.invalid/token/
        {s.token.chain}/{s.token.address}
      </p>
      {buildExternalTokenUrls(s.token.chain, s.token.address).map((u) => (
        <a key={u.url} href={u.url} target="_blank" rel="noopener noreferrer">
          Explorateur : {u.label}
        </a>
      ))}
      {s.token.flags.map((f) => (
        <p className="warning-box small" key={f}>
          {f}
        </p>
      ))}
      <a href={"#page=events&event=" + s.token.eventId}>
        Voir l’événement associé
      </a>
      <div className="chart-controls">
        <label>
          Pool
          <select
            aria-label="Pool du graphique"
            value={s.selected?.address ?? ""}
            onChange={(e) => set("pool", e.target.value)}
          >
            {!s.pools.length && <option value="">Aucun pool disponible</option>}
            {s.pools.map((p) => (
              <option key={p.address} value={p.address}>
                {p.dex} · {p.address.slice(-8)} · {p.liquidity ?? "inconnu"} USD
              </option>
            ))}
          </select>
        </label>
        <label>
          Granularité
          <select
            aria-label="Granularité du graphique"
            value={interval}
            onChange={(e) => set("interval", e.target.value)}
          >
            {Object.keys(intervals).map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plage
          <select
            aria-label="Plage du graphique"
            value={range}
            onChange={(e) => set("range", e.target.value)}
          >
            {[
              ["1h", "1 heure"],
              ["6h", "6 heures"],
              ["24h", "24 heures"],
              ["7d", "7 jours"],
              ["creation", "Depuis la création"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          État de démonstration
          <select
            aria-label="État du graphique démo"
            value={simulation}
            onChange={(e) => set("simulation", e.target.value)}
          >
            {[
              ["normal", "Données partielles"],
              ["empty", "Sans pool"],
              ["unavailable", "Fournisseur indisponible"],
              ["stale", "Données anciennes"],
              ["conflict", "Sources incohérentes"],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Pool par défaut : liquidité connue la plus élevée, puis adresse en cas
        d’égalité ; une liquidité inconnue n’est pas un zéro. Le prix dépend du
        pool.
      </p>
      <p>
        Source : {s.source} · mise à jour {date(s.updatedAt)} · intervalle{" "}
        {interval} · timezone {zone}.
      </p>
      {s.reason && (
        <p role="status">
          Aucune donnée de prix n’est disponible pour ce token auprès des
          fournisseurs configurés. Raison : {s.reason}.
        </p>
      )}
      {s.summary.stale && (
        <p className="warning-box">
          Données anciennes : la durée de validité de ce cache est dépassée.
        </p>
      )}
      {s.conflicts.map((c) => (
        <p className="warning-box" key={c.at}>
          Données incohérentes à {date(c.at)} :{" "}
          {c.values.map((v) => `${v.provider} : ${v.close} USD`).join(" ; ")}.
          Aucune moyenne entre fournisseurs.
        </p>
      ))}
      <div className="stats">
        <div className="panel">
          <strong>Dernière clôture connue</strong>
          <p>{s.summary.lastPrice ?? "Non disponible"} USD</p>
        </div>
        <div className="panel">
          <strong>Variation de la plage</strong>
          <p>
            {s.summary.change === null
              ? "Non disponible : période incomplète, incohérente ou prix initial nul"
              : s.summary.change + " %"}
          </p>
        </div>
        <div className="panel">
          <strong>Volume de la plage</strong>
          <p>
            {s.summary.volume === null
              ? "Non disponible (partiel)"
              : s.summary.volume + " USD"}
          </p>
          <p>
            Somme des volumes récupérés : {s.summary.observedVolume} USD, pas un
            total exhaustif.
          </p>
        </div>
        <div className="panel">
          <strong>Liquidité connue du pool</strong>
          <p>{s.selected?.liquidity ?? "Non disponible"} USD</p>
          <p>{date(s.selected?.updatedAt ?? null)}</p>
        </div>
      </div>
      {s.summary.gaps > 0 && (
        <p className="notice">
          {s.summary.gaps} tranches sans données dans la plage. Trous visibles,
          sans interpolation ni volume nul inventé.
        </p>
      )}
      {s.limited && (
        <p>
          Plage limitée aux 1 500 tranches les plus récentes ; les périodes plus
          anciennes ne sont pas affirmées.
        </p>
      )}
      {s.summary.unprojectable ? (
        <p>
          Valeurs hors précision admissible pour le dessin. Consultez les
          valeurs exactes dans le tableau.
        </p>
      ) : s.candles.length > 0 ? (
        <FinancialCanvas
          slots={shown}
          markers={s.markers}
          theme={theme}
          zone={zone}
          onMarker={setMarker}
        />
      ) : null}
      {visible < s.slots.length && (
        <button
          className="secondary"
          onClick={() => setVisible((n) => Math.min(1500, n + 200))}
        >
          Charger les tranches précédentes (
          {Math.min(s.slots.length - visible, 200)})
        </button>
      )}
      <details>
        <summary>
          Tableau des prix et volumes exacts ({shown.length} tranches affichées)
        </summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Début de tranche</th>
                <th>Ouverture USD</th>
                <th>Haut</th>
                <th>Bas</th>
                <th>Clôture</th>
                <th>Volume USD</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((slot) => (
                <tr key={slot.at}>
                  <td>{date(slot.at)}</td>
                  {slot.candle ? (
                    <>
                      <td>{slot.candle.open}</td>
                      <td>{slot.candle.high}</td>
                      <td>{slot.candle.low}</td>
                      <td>{slot.candle.close}</td>
                      <td>{slot.candle.volume ?? "Non disponible"}</td>
                    </>
                  ) : (
                    <td colSpan={5}>{slot.reason}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <section className="panel" aria-label="Marqueurs et changements">
        <h3>Marqueurs et changements horodatés</h3>
        <p>
          Variation signalée à partir de 20 % entre observations comparables ;
          une variation ne prouve pas un retrait, un ajout ou une manipulation.
        </p>
        {marker && (
          <div className="notice">
            <strong>Aperçu sélectionné : {marker.label}</strong>
            <p>{date(marker.at)}</p>
            {marker.target && (
              <a href={marker.target}>Ouvrir l’élément sélectionné</a>
            )}
          </div>
        )}
        {s.markers.map((m) => (
          <article key={m.id}>
            <button className="text-button" onClick={() => setMarker(m)}>
              {date(m.at)} · {displayText(m.label)}
            </button>
            <p>
              {m.knowledge === "CALCULATED"
                ? "Calculé"
                : m.knowledge === "INTERPRETED"
                  ? "Interprété"
                  : "Observé"}
              {m.target && (
                <>
                  {" "}
                  ·{" "}
                  <a href={m.target}>
                    Ouvrir{" "}
                    {m.kind === "event"
                      ? "l’événement"
                      : m.kind === "alert"
                        ? "l’alerte"
                        : "la publication"}
                  </a>
                </>
              )}
            </p>
          </article>
        ))}
        {!s.markers.length && <p>Aucun marqueur connu dans cette plage.</p>}
      </section>
      <section className="panel" aria-label="Liquidité et capitalisation">
        <h3>Liquidité et capitalisation estimée</h3>
        <p>
          Liquidité : observations distinctes du prix, sans courbe interpolée.
          Source et récupération indiquées par ligne.
        </p>
        {s.liquidity.map((m) => (
          <p key={m.at}>
            {date(m.at)} : {m.value ?? "Non disponible"} USD · {m.source} ·
            récupéré {date(m.fetchedAt)}
          </p>
        ))}
        {!s.liquidity.length && (
          <p>Aucune série de liquidité disponible pour cette période.</p>
        )}
        <p>{s.capMethod}</p>
        <details>
          <summary>
            Historique de capitalisation estimée ({s.marketCaps.length})
          </summary>
          {s.marketCaps.map((m) => (
            <p key={m.at}>
              {date(m.at)} : {m.value ?? "Non disponible"} USD · {m.source} ·
              récupéré {date(m.fetchedAt)}
            </p>
          ))}
          {!s.marketCaps.length && (
            <p>
              Capitalisation non disponible : prix ou offre circulante manquant.
            </p>
          )}
        </details>
      </section>
      <section className="panel" aria-label="Transactions récentes">
        <h3>Transactions d’achat et de vente observées</h3>
        <p>
          {buys} achats · {sells} ventes récupérés dans cette plage. Liste
          partielle du scénario, pas des compteurs exhaustifs. Source :
          transactions fictives locales.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Montant USD</th>
                <th>Tokens</th>
                <th>Adresse</th>
              </tr>
            </thead>
            <tbody>
              {s.trades.map((t) => (
                <tr key={t.id}>
                  <td>{date(t.at)}</td>
                  <td>{t.side === "buy" ? "Achat" : "Vente"}</td>
                  <td>{t.usd ?? "Non disponible"}</td>
                  <td>{t.tokenAmount ?? "Non disponible"}</td>
                  <td title={t.wallet ?? ""}>
                    {t.wallet
                      ? t.wallet.slice(0, 8) + "…" + t.wallet.slice(-6)
                      : "Inconnue"}
                    {t.wallet &&
                      buildExternalWalletUrl(s.token.chain, t.wallet) && (
                        <a
                          href={buildExternalWalletUrl(
                            s.token.chain,
                            t.wallet,
                          )!}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Explorateur
                        </a>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!s.trades.length && (
          <p>
            Aucune transaction disponible ; cela ne prouve pas l’absence
            d’échanges.
          </p>
        )}
      </section>
      <section className="panel">
        <h3>Contrôles de risque existants</h3>
        <p>{RISK_WARNING}</p>
        {legacy?.risks.map((r) => (
          <p key={r.title}>
            <strong>{r.title}</strong> ·{" "}
            {r.status === "signal_detected"
              ? "Signal détecté"
              : r.status === "check_failed"
                ? "Vérification échouée"
                : "Données insuffisantes"}{" "}
            : {r.evidence} Source : {r.source} · {date(r.observed_at)}. Limites
            : {r.limitations}
          </p>
        ))}
        {!legacy && (
          <p>
            Données de contrôle du contrat non disponibles. L’analyse détaillée
            sera étendue en phase 9.
          </p>
        )}
        <p>
          Une forte activité sur X ou la mention par un compte connu ne garantit
          pas la légitimité d’un token. Ces signaux peuvent résulter de
          promotion payée, de comptes automatisés ou d’usurpation.
        </p>
      </section>
      <a href="#page=tokens">Revenir aux tokens détectés</a>
    </section>
  );
}
