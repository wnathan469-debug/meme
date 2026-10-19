import { readdirSync } from "node:fs";
import { it, expect } from "vitest";
import {
  navigation,
  readRoute,
  pageHref,
  filterHref,
  routeParams,
} from "../../apps/web/src/navigation";
import {
  selectWatch,
  watchTokens,
  cleanText,
  attentionRises,
} from "../../apps/web/src/watch-model";
import { matchesControls } from "../../apps/web/src/control-filters";
import { eventAt, demoEventSnapshot } from "../../packages/events/demo-data";
import { demoContract } from "../../packages/conversations/demo-data";
it("exposes nine distinct pages and keeps analysis as a token detail", () => {
  expect(navigation).toHaveLength(9);
  expect(new Set(navigation.map((n) => n.id)).size).toBe(9);
  for (const n of navigation)
    expect(readRoute("#page=" + n.id)).toMatchObject({
      page: n.id,
      error: null,
    });
  expect(readRoute("#page=analysis").page).toBe("analysis");
  expect(readRoute("#/tokens/base/" + demoContract + "?pool=pool").page).toBe(
    "analysis",
  );
});
it("preserves legacy deep links and rejects unknown or oversized routes", () => {
  expect(readRoute("#page=tokens&token=weak")).toMatchObject({
    token: "weak",
    page: "tokens",
  });
  expect(readRoute("#page=events&event=tesla&q=fiction")).toMatchObject({
    event: "tesla",
    query: "fiction",
  });
  expect(readRoute("#page=UNKNOWN").error).toBeTruthy();
  expect(readRoute("#page=watch&q=" + "a".repeat(301)).error).toBeTruthy();
  expect(readRoute("#page=watch&q=x&q=y").error).toBeTruthy();
  expect(readRoute("#" + "a".repeat(8193)).error).toBeTruthy();
});
it("carries global filters without leaking a prior detail or private note into another page", () => {
  const link = pageHref(
    "tokens",
    "#page=watch&q=Nébula&chain=Base&personFilter=id&conversation=DEMO_POST_ROOT&privateNote=SECRET",
  );
  expect(routeParams(link).get("q")).toBe("Nébula");
  expect(routeParams(link).get("chain")).toBe("Base");
  expect(link).not.toContain("SECRET");
  expect(link).not.toContain("conversation");
  expect(
    routeParams(pageHref("events", link, { event: "known" })).get("event"),
  ).toBe("known");
});
it("edits filters in place on detail paths and deletes empty values without losing pool", () => {
  const h = "#/tokens/base/" + demoContract + "?pool=chosen&q=old";
  const next = filterHref(h, { q: "new", chain: "Base", period: null });
  expect(next.startsWith("#/tokens/base/" + demoContract + "?")).toBe(true);
  expect(routeParams(next).get("pool")).toBe("chosen");
  expect(routeParams(next).get("q")).toBe("new");
  expect(
    routeParams(filterHref("#page=events&q=old", { q: "" })).has("q"),
  ).toBe(false);
});
it("uses acquisition time, deduplicates posts and keeps reverse chronological order", () => {
  const rows = selectWatch({}, 10),
    at = Date.parse(eventAt(10));
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows.map((p) => p.id)).size).toBe(rows.length);
  expect(rows.every((p) => Date.parse(p.collectedAt) <= at)).toBe(true);
  expect(
    rows.every(
      (p) => p.publishedAt === null || Date.parse(p.publishedAt) <= at,
    ),
  ).toBe(true);
  expect(selectWatch({}, 60).length).toBeGreaterThan(rows.length);
});
it("combines exact hashtags, keyword, known chain and period instead of matching symbols", () => {
  const rows = selectWatch({ tag: "#NEBULAPRODUIT", q: "Nébula" }, 60);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((p) => p.entities.hashtags.includes("NebulaProduit"))).toBe(
    true,
  );
  expect(selectWatch({ q: "NO_MATCH" }, 60)).toEqual([]);
  expect(selectWatch({ chain: "Solana" }, 60)).toHaveLength(1);
  expect(
    selectWatch({ period: "15" }, 60).every(
      (p) => Date.parse(p.publishedAt!) >= Date.parse(eventAt(45)),
    ),
  ).toBe(true);
  expect(watchTokens("$NEB")).toEqual([]);
  expect(watchTokens(demoContract)[0].chain).toBe("base");
});
it("filters followed people by stable ID and category without ever searching private notes", () => {
  const people = [
    {
      id: "private-id",
      xUserId: "DEMO_USER_A",
      username: "changed_handle",
      categoryId: "cat",
      status: "active",
    },
  ];
  const rows = selectWatch(
    { personFilter: "private-id", categoryFilter: "cat" },
    60,
    people,
  );
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((p) => p.authorId === "DEMO_USER_A")).toBe(true);
  expect(selectWatch({ personFilter: "changed_handle" }, 60, people)).toEqual(
    [],
  );
  expect(selectWatch({ categoryFilter: "other" }, 60, people)).toEqual([]);
  expect(selectWatch({ personFilter: "missing" }, 60, people)).toEqual([]);
});
it("does not replace missing metrics by zero when filtering quality", () => {
  expect(
    selectWatch({ quality: "dated" }, 60).every((p) => p.publishedAt !== null),
  ).toBe(true);
  expect(
    selectWatch({ quality: "metrics" }, 60).every((p) =>
      Object.values(p.metrics).every((v) => v !== null),
    ),
  ).toBe(true);
  expect(() => selectWatch({ period: "bad" }, 60)).toThrow();
  expect(cleanText("texte\u202e\u0000 <script>")).toBe("texte <script>");
});
it("keeps unknown/failed/absent controls out of a no-signal claim", () => {
  expect(matchesControls([], "clear", "all")).toBe(false);
  expect(matchesControls(["not_applicable"], "clear", "all")).toBe(false);
  expect(
    matchesControls(["no_signal_detected", "check_failed"], "clear", "all"),
  ).toBe(false);
  expect(matchesControls(["insufficient_data"], "unknown", "incomplete")).toBe(
    true,
  );
  expect(matchesControls(["signal_detected"], "signal", "complete")).toBe(true);
  expect(
    matchesControls(
      ["no_signal_detected", "not_applicable"],
      "clear",
      "complete",
    ),
  ).toBe(true);
  expect(
    matchesControls(["signal_detected", "check_failed"], "signal", "complete"),
  ).toBe(false);
  expect(matchesControls(["no_signal_detected"], "unknown", "all")).toBe(false);
  expect(matchesControls(["no_signal_detected"], "all", "incomplete")).toBe(
    false,
  );
  expect(matchesControls(["no_signal_detected"], "bad", "all")).toBe(false);
  expect(matchesControls(["no_signal_detected"], "all", "bad")).toBe(false);
});
it("only reports attention rises with a documented non-zero baseline", () => {
  const s = demoEventSnapshot(60),
    rises = attentionRises(s);
  expect(rises.length).toBeGreaterThan(0);
  expect(rises.length).toBeLessThanOrEqual(3);
  expect(rises.every((b) => b.mentions !== null && b.multiplier !== null)).toBe(
    true,
  );
  expect(attentionRises(demoEventSnapshot(10))).toEqual([]);
  expect(attentionRises(demoEventSnapshot(60, true))).toEqual([]);
  expect(
    attentionRises({ ...s, attention: { ...s.attention, baselineTotal: "0" } }),
  ).toEqual([]);
});

it("keeps module names unambiguous on the case-insensitive Windows filesystem", () => {
  const names = readdirSync(new URL("../../apps/web/src", import.meta.url))
    .filter((name) => /\.(?:tsx?|cjs)$/.test(name))
    .map((name) => name.replace(/\.[^.]+$/, "").toLowerCase());
  expect(new Set(names).size).toBe(names.length);
});
