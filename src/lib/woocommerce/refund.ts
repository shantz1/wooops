/** Validation and arithmetic for refunds. Shared by the app route; the plugin mirrors these rules in PHP. */
/** `refund_total` is the amount without tax; `taxes` is the tax refunded per tax rate (WooCommerce rate id). */
export type RefundTax = { id: number; refund_total: string };
export type RefundItem = { id: number; quantity: number; refund_total: string; taxes: RefundTax[] };
export type RefundRequest = {
  amount: string;
  reason: string;
  items: RefundItem[];
  restock: boolean;
  /** Ask the payment gateway to send the money back. Off by default: the refund is only recorded in the store. */
  gateway: boolean;
  requestId: string;
};
export type RefundParse = { ok: true; refund: RefundRequest } | { ok: false; error: string };

export const refundMetaKey = "kartodesk_request_id";
const moneyPattern = /^\d{1,9}(\.\d{1,4})?$/;

/** Money as integer ten-thousandths so sums never pick up floating-point noise. */
export function toUnits(value: string | number): number {
  return Math.round(Number(value) * 10000);
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRefundRequest(body: unknown): RefundParse {
  if (!plain(body)) return { ok: false, error: "Invalid request." };
  if (Object.keys(body).some(key => !["amount", "reason", "items", "restock", "gateway", "request_id"].includes(key))) return { ok: false, error: "Invalid request." };
  if (typeof body.amount !== "string" || !moneyPattern.test(body.amount) || toUnits(body.amount) <= 0) return { ok: false, error: "Enter a refund amount greater than zero." };
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 200)) return { ok: false, error: "The reason must be 200 characters or fewer." };
  if (typeof body.request_id !== "string" || !/^[A-Za-z0-9-]{8,40}$/.test(body.request_id)) return { ok: false, error: "Invalid request." };
  for (const flag of ["restock", "gateway"] as const) if (body[flag] !== undefined && typeof body[flag] !== "boolean") return { ok: false, error: "Invalid request." };
  const rawItems = body.items === undefined ? [] : body.items;
  if (!Array.isArray(rawItems) || rawItems.length > 100) return { ok: false, error: "Invalid refund items." };
  const items: RefundItem[] = [];
  const seen = new Set<number>();
  let itemUnits = 0;
  for (const raw of rawItems) {
    if (!plain(raw) || Object.keys(raw).some(key => !["id", "quantity", "refund_total", "taxes"].includes(key))) return { ok: false, error: "Invalid refund items." };
    const { id, quantity, refund_total: total } = raw;
    if (!Number.isInteger(id) || (id as number) < 1 || seen.has(id as number)) return { ok: false, error: "Invalid refund items." };
    if (!Number.isInteger(quantity) || (quantity as number) < 0 || (quantity as number) > 9999) return { ok: false, error: "Invalid refund items." };
    if (typeof total !== "string" || !moneyPattern.test(total)) return { ok: false, error: "Invalid refund items." };
    const taxes: RefundTax[] = [];
    if (raw.taxes !== undefined) {
      if (!Array.isArray(raw.taxes) || raw.taxes.length > 20) return { ok: false, error: "Invalid refund items." };
      const rates = new Set<number>();
      for (const tax of raw.taxes) {
        if (!plain(tax) || Object.keys(tax).some(key => !["id", "refund_total"].includes(key))) return { ok: false, error: "Invalid refund items." };
        if (!Number.isInteger(tax.id) || (tax.id as number) < 1 || rates.has(tax.id as number) || typeof tax.refund_total !== "string" || !moneyPattern.test(tax.refund_total)) return { ok: false, error: "Invalid refund items." };
        rates.add(tax.id as number);
        itemUnits += toUnits(tax.refund_total);
        taxes.push({ id: tax.id as number, refund_total: tax.refund_total });
      }
    }
    seen.add(id as number);
    itemUnits += toUnits(total);
    items.push({ id: id as number, quantity: quantity as number, refund_total: total, taxes });
  }
  if (itemUnits > toUnits(body.amount)) return { ok: false, error: "The item amounts add up to more than the refund amount." };
  return { ok: true, refund: { amount: body.amount, reason: ((body.reason as string | undefined) ?? "").trim(), items, restock: body.restock === true && items.length > 0, gateway: body.gateway === true, requestId: body.request_id } };
}

/** What is still refundable: the order total minus refunds already recorded (WooCommerce stores them as negative totals). */
export function remainingUnits(order: { total: string; refunds?: Array<{ total: string }> }): number {
  const refunded = (order.refunds ?? []).reduce((sum, refund) => sum + Math.abs(toUnits(refund.total)), 0);
  return toUnits(order.total) - refunded;
}

/** A refund this request already created (same request id), so a retry after a timeout never refunds twice. */
export function findRefundByRequestId<T extends { meta_data?: Array<{ key: string; value: unknown }> }>(refunds: T[], requestId: string): T | undefined {
  return refunds.find(refund => (refund.meta_data ?? []).some(meta => meta.key === refundMetaKey && meta.value === requestId));
}

/** Decimal places the store uses for this order's money (2 for most currencies, 0 for JPY, 3 for KWD), read from its own amounts. */
export function currencyDecimals(order: { total: string; line_items?: Array<{ total: string }>; shipping_total?: string }): number {
  const values = [order.total, order.shipping_total, ...(order.line_items ?? []).map(item => item.total)].filter((value): value is string => typeof value === "string" && value !== "");
  if (values.length === 0) return 2;
  return Math.min(4, Math.max(...values.map(value => (value.split(".")[1] ?? "").length)));
}

/** Keep known tax rates even when a partial quantity's share rounds to zero. */
export function refundTaxShares(item: { quantity: number; total_tax?: string; taxes?: Array<{ id: number; total: string }> }, quantity: number, decimals: number): Array<{ id: number; units: number }> | null {
  const scale = 10 ** decimals;
  const units = (value: string | undefined) => Math.round(Number(value || 0) * scale);
  const rates = (item.taxes ?? []).filter(tax => units(tax.total) > 0);
  if (rates.length === 0 && units(item.total_tax) > 0) return null;
  return rates.map(tax => ({ id: tax.id, units: quantity >= item.quantity ? units(tax.total) : Math.round(units(tax.total) * quantity / item.quantity) }));
}
