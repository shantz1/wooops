import type { WooOrder } from "@/types/woocommerce";
import { addDecimals, decimalsEqual, isZero, negate, parseDecimal, roundDecimal, sumDecimals, type Decimal } from "./money.ts";

export interface TotalsRow { key: string; label: string; amount: Decimal; hint?: string }

export interface OrderTotals {
  rows: TotalsRow[];
  total: Decimal;
  /** True when the listed components add up to WooCommerce's own order total. */
  reconciles: boolean;
  /** False when WooCommerce returned an amount WooOps could not parse. */
  valid: boolean;
  refunded: Decimal | null;
  netAfterRefunds: Decimal | null;
  scale: number;
}

type TotalsInput = Pick<WooOrder, "total" | "line_items" | "discount_total" | "shipping_total" | "total_tax" | "fee_lines" | "refunds" | "prices_include_tax">;

/**
 * Builds a display breakdown from WooCommerce's stored amounts. WooCommerce's `total` stays authoritative:
 * the breakdown is compared with it rather than replacing it.
 */
export function orderTotals(order: TotalsInput): OrderTotals {
  const parsedTotal = parseDecimal(order.total);
  const total = parsedTotal ?? { units: 0n, scale: 2 };
  const scale = Math.max(parsedTotal?.scale ?? 2, 0);
  const round = (value: Decimal) => roundDecimal(value, scale);

  const items = sumDecimals(order.line_items.map(item => item.subtotal));
  const discount = sumDecimals([order.discount_total]);
  const fees = sumDecimals((order.fee_lines || []).map(fee => fee.total));
  const shipping = sumDecimals([order.shipping_total]);
  const tax = sumDecimals([order.total_tax]);
  const refunds = sumDecimals((order.refunds || []).map(refund => refund.total));

  const rows: TotalsRow[] = [{ key: "items", label: "Items subtotal", amount: round(items.value), hint: "Before discounts, excluding tax" }];
  if (!isZero(discount.value)) rows.push({ key: "discount", label: "Discount", amount: round(negate(discount.value)) });
  if (!isZero(fees.value)) rows.push({ key: "fees", label: "Fees", amount: round(fees.value) });
  if (order.shipping_total !== undefined) rows.push({ key: "shipping", label: "Shipping", amount: round(shipping.value) });
  if (order.total_tax !== undefined) {
    rows.push({ key: "tax", label: "Tax", amount: round(tax.value), hint: order.prices_include_tax ? "Store prices include tax" : undefined });
  }

  // Compare the amounts actually displayed, including each row's rounding.
  const computed = addDecimals(...rows.map(row => row.amount));
  const hasRefunds = (order.refunds || []).length > 0;
  // WooCommerce reports refund totals as negative amounts.
  const refunded = hasRefunds ? round(negate(refunds.value)) : null;
  const netAfterRefunds = hasRefunds && parsedTotal ? round(addDecimals(total, refunds.value)) : null;

  return {
    rows,
    total,
    reconciles: parsedTotal !== null && decimalsEqual(round(computed), total),
    valid: parsedTotal !== null && [items, discount, fees, shipping, tax, refunds].every(result => result.valid),
    refunded,
    netAfterRefunds,
    scale,
  };
}

