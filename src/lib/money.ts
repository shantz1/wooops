// Exact decimal helpers for WooCommerce amount strings. WooCommerce returns money as decimal strings;
// summing them as floats can drift, so amounts are handled as scaled BigInts.

export interface Decimal { units: bigint; scale: number }

export function parseDecimal(value: unknown): Decimal | null {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string") return null;
  const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(text.trim());
  if (!match || (!match[2] && !match[3])) return null;
  const fraction = match[3] || "";
  const units = BigInt((match[2] || "0") + fraction);
  return { units: match[1] ? -units : units, scale: fraction.length };
}

function rescale(value: Decimal, scale: number) {
  return value.units * 10n ** BigInt(scale - value.scale);
}

/** Rounds half away from zero to the given number of decimal places. */
export function roundDecimal(value: Decimal, scale: number): Decimal {
  if (value.scale <= scale) return { units: rescale(value, scale), scale };
  const divisor = 10n ** BigInt(value.scale - scale);
  const negative = value.units < 0n;
  const absolute = negative ? -value.units : value.units;
  let units = absolute / divisor;
  if ((absolute % divisor) * 2n >= divisor) units += 1n;
  return { units: negative ? -units : units, scale };
}

/** Adds decimal strings. Missing or malformed values count as zero; `valid` reports whether any were malformed. */
export function sumDecimals(values: unknown[]) {
  const parsed = values.map(value => value === undefined || value === null || value === "" ? { units: 0n, scale: 0 } : parseDecimal(value));
  const decimals = parsed.filter((value): value is Decimal => value !== null);
  const scale = Math.max(0, ...decimals.map(value => value.scale));
  const units = decimals.reduce((total, value) => total + rescale(value, scale), 0n);
  return { value: { units, scale }, valid: decimals.length === parsed.length };
}

export function addDecimals(...values: Decimal[]): Decimal {
  const scale = Math.max(0, ...values.map(value => value.scale));
  return { units: values.reduce((total, value) => total + rescale(value, scale), 0n), scale };
}

export function negate(value: Decimal): Decimal {
  return { units: -value.units, scale: value.scale };
}

export function isZero(value: Decimal) {
  return value.units === 0n;
}

export function decimalsEqual(a: Decimal, b: Decimal) {
  const scale = Math.max(a.scale, b.scale);
  return rescale(a, scale) === rescale(b, scale);
}

export function decimalToString(value: Decimal) {
  const negative = value.units < 0n;
  const digits = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = digits.slice(0, digits.length - value.scale);
  const fraction = value.scale ? `.${digits.slice(-value.scale)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Formats an amount in the given currency at the decimal's own precision; callers round to the store precision first. */
export function formatMoney(value: Decimal | string, currency: string, locale?: string) {
  const decimal = typeof value === "string" ? parseDecimal(value) : value;
  if (!decimal) return typeof value === "string" ? `${currency} ${value}` : "—";
  const text = decimalToString(decimal);
  try {
    // Intl accepts decimal strings in current runtimes, avoiding a float conversion for display.
    return new Intl.NumberFormat(locale, {
      style: "currency", currency, minimumFractionDigits: decimal.scale, maximumFractionDigits: decimal.scale,
    }).format(text as unknown as number);
  } catch {
    return `${currency} ${text}`;
  }
}
