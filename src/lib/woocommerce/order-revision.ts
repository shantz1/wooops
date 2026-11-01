import { createHash } from "node:crypto";

const fields = ["id", "status", "customer_id", "billing", "shipping", "customer_note", "date_modified_gmt", "currency", "total", "total_tax", "line_items", "shipping_lines", "fee_lines", "coupon_lines", "refunds", "payment_method", "transaction_id", "meta_data"];
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
  return value ?? null;
}

/** Opaque state token, detecting relevant changes even within one WooCommerce timestamp second. */
export function orderRevision(order: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(canonical(Object.fromEntries(fields.map(key => [key, order[key] ?? null]))))).digest("hex");
}
export function withOrderRevision<T extends Record<string, unknown>>(order: T) { return { ...order, edit_token: orderRevision(order) }; }
