/** Filters observations, never creates a synthetic aggregate risk score. */
export function matchesControls(
  statuses: string[],
  risk: string,
  quality: string,
) {
  const applicable = statuses.filter((s) => s !== "not_applicable");
  const incomplete =
    !applicable.length ||
    applicable.some(
      (s) => !["signal_detected", "no_signal_detected"].includes(s),
    );
  if (quality === "complete" && incomplete) return false;
  if (quality === "incomplete" && !incomplete) return false;
  if (risk === "signal" && !applicable.includes("signal_detected"))
    return false;
  if (risk === "unknown" && !incomplete) return false;
  if (
    risk === "clear" &&
    (incomplete || applicable.some((s) => s !== "no_signal_detected"))
  )
    return false;
  return (
    ["all", "signal", "unknown", "clear"].includes(risk) &&
    ["all", "complete", "incomplete"].includes(quality)
  );
}
