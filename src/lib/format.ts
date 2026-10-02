import type { WooAddress } from "@/types/woocommerce";

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Converts WooCommerce HTML (order notes, item meta) to plain text. The result is rendered as React text,
 * so markup from notes is never interpreted by the browser.
 */
export function plainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === "#") {
        const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
      }
      return entities[code.toLowerCase()] ?? match;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * WooCommerce returns `*_gmt` timestamps without a zone suffix and local timestamps in the store timezone.
 * Prefer the GMT value so the instant is correct in the viewer's timezone.
 */
export function wooDate(local?: string | null, gmt?: string | null) {
  const value = gmt ? `${gmt.replace(/Z$/, "")}Z` : local;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(date: Date | null) {
  return date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export function relativeAge(date: Date | null, now = Date.now()) {
  if (!date) return "";
  const minutes = Math.round((date.getTime() - now) / 60000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

export function countryName(code?: string) {
  if (!code) return "";
  try { return new Intl.DisplayNames(undefined, { type: "region" }).of(code) || code; } catch { return code; }
}

const addressFields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country"] as const;

export function hasAddress(address?: WooAddress) {
  return Boolean(address && ["address_1", "address_2", "city", "postcode", "country"].some(field => address[field as keyof WooAddress]?.trim()));
}

export function sameAddress(a: WooAddress, b: WooAddress) {
  return addressFields.every(field => (a[field] || "").trim().toLowerCase() === (b[field] || "").trim().toLowerCase());
}

/** Address lines in a conventional label order. State codes are shown as WooCommerce stores them. */
export function addressLines(address: WooAddress) {
  const name = [address.first_name, address.last_name].filter(Boolean).join(" ");
  const locality = [address.city, address.state, address.postcode].filter(Boolean).join(", ");
  return [name, address.company, address.address_1, address.address_2, locality, countryName(address.country)]
    .map(line => line?.trim()).filter((line): line is string => Boolean(line));
}
