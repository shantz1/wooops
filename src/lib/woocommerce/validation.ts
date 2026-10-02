import type { KnownOrderStatus } from "@/types/woocommerce";

export const editableStatuses: KnownOrderStatus[] = [
  "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed",
];

export function isId(value: unknown): value is number | string {
  return (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
}

export function isOrderStatus(value: unknown): value is KnownOrderStatus {
  return editableStatuses.includes(value as KnownOrderStatus);
}

/** Parses a positive integer query parameter, falling back when it is missing or invalid. */
export function pageParam(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  return Math.min(Number(value), max);
}

/** Trims a search term and caps its length before it is forwarded to WooCommerce. */
export function searchParam(value: string | null) {
  return (value || "").trim().slice(0, 200);
}
