/** Exact decimal arithmetic. At most 60 integral and 36 fractional digits. */
const SCALE = 10n ** 36n;
export function decimal(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,59})(?:\.\d{1,36})?$/.test(value))
    throw new Error("Invalid exact decimal");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(36, "0"));
}
export function formatDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "",
    abs = value < 0n ? -value : value;
  const fraction = (abs % SCALE)
    .toString()
    .padStart(36, "0")
    .replace(/0+$/, "");
  return sign + (abs / SCALE).toString() + (fraction ? "." + fraction : "");
}
export const compare = (a: string, b: string) =>
  decimal(a) < decimal(b) ? -1 : decimal(a) > decimal(b) ? 1 : 0;
export const sum = (values: string[]) =>
  formatDecimal(values.reduce((s, v) => s + decimal(v), 0n));
export const multiply = (a: string, b: string) =>
  (() => {
    const v = decimal(a) * decimal(b),
      s = 10n ** 72n,
      f = (v % s).toString().padStart(72, "0").replace(/0+$/, "");
    return (v / s).toString() + (f ? "." + f : "");
  })();
/** Percent rounded half away from zero, never a binary floating-point financial calculation. */
export function percentChange(before: string, after: string): string | null {
  const b = decimal(before),
    a = decimal(after);
  if (b === 0n) return null;
  const n = (a - b) * 10000n,
    abs = n < 0n ? -n : n,
    rounded = (abs + b / 2n) / b;
  const s = rounded.toString().padStart(3, "0");
  return (
    (n < 0n && rounded > 0n ? "-" : "") + s.slice(0, -2) + "." + s.slice(-2)
  );
}
/** Expand a bounded JSON decimal lexeme without ever parsing its monetary value as Number. */
export function plainDecimal(raw: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(raw))
    throw new Error("Invalid decimal lexeme");
  const [mantissa, e = "0"] = raw.split(/[eE]/),
    [whole, fraction = ""] = mantissa.split("."),
    exponent = Number(e);
  if (exponent < -36 || exponent > 60 || raw.length > 110)
    throw new Error("Decimal outside bounds");
  const digits = whole + fraction,
    point = whole.length + exponent;
  let out =
    point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point);
  const [w, f = ""] = out.split(".");
  out =
    (w.replace(/^0+(?=\d)/, "") || "0") +
    (f.replace(/0+$/, "") ? "." + f.replace(/0+$/, "") : "");
  decimal(out);
  return out;
}
/** Drawing only: financial storage, labels, comparisons and ratios retain original strings. */
export function project(value: string): number | null {
  try {
    const canonical = formatDecimal(decimal(value)),
      digits = canonical
        .replace(/[.]/g, "")
        .replace(/^0+/, "")
        .replace(/0+$/, "");
    const n = Number(canonical);
    return Number.isFinite(n) &&
      n <= 1e15 &&
      (n === 0 || n >= 1e-12) &&
      digits.length <= 15
      ? n
      : null;
  } catch {
    return null;
  }
}

/** Threshold decision on the unrounded ratio; display rounding must never trigger an alert. */
export function changedAtLeast(
  before: string,
  after: string,
  threshold: string,
): boolean {
  const a = decimal(before),
    b = decimal(after),
    diff = b > a ? b - a : a - b;
  return a > 0n && diff * 100n * SCALE >= a * decimal(threshold);
}
