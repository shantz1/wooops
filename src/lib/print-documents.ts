import type { WooOrder } from "../types/woocommerce.ts";
import { addressLines, countryName, hasAddress, plainText } from "./format.ts";
import { formatMoney, parseDecimal, roundDecimal } from "./money.ts";
import { orderTotals } from "./order-totals.ts";

/**
 * Field selection for the printable documents. Only the fields listed here may appear on paper: no email,
 * transaction id, customer or private notes, item meta or IP data. Components render these objects and nothing else.
 */

export interface SummaryContent {
  orderNumber: string;
  lines: Array<{ name: string; sku: string; quantity: number; total: string }>;
  totals: Array<{ label: string; amount: string }>;
  address: { heading: "Shipping address" | "Billing address"; lines: string[] };
  payment: string;
  status: string;
  created: { local: string; gmt?: string };
  warning: string | null;
}

/** The order summary: items, totals, payment method title and a delivery address. No contact details. */
export function summaryContent(order: WooOrder): SummaryContent {
  const totals = orderTotals(order);
  const money = (value: string) => {
    const parsed = parseDecimal(value);
    return parsed ? formatMoney(roundDecimal(parsed, totals.scale), order.currency) : `${order.currency} ${value}`;
  };
  const shipping = hasAddress(order.shipping);
  return {
    orderNumber: order.number,
    lines: order.line_items.map(item => ({
      name: plainText(item.name),
      sku: item.sku?.trim() ?? "",
      quantity: item.quantity,
      total: money(item.total),
    })),
    totals: [
      ...totals.rows.map(row => ({ label: row.label, amount: formatMoney(row.amount, order.currency) })),
      { label: "Order total", amount: money(order.total) },
      ...(totals.valid && totals.refunded && totals.netAfterRefunds ? [
        { label: "Refunded", amount: formatMoney(totals.refunded, order.currency) },
        { label: "Net after refunds", amount: formatMoney(totals.netAfterRefunds, order.currency) },
      ] : []),
    ],
    address: shipping
      ? { heading: "Shipping address", lines: addressLines(order.shipping) }
      : { heading: "Billing address", lines: addressLines(order.billing) },
    payment: order.payment_method_title ? plainText(order.payment_method_title) : "",
    status: order.status,
    created: { local: order.date_created, gmt: order.date_created_gmt },
    warning: !totals.valid ? "Some amounts could not be read reliably. Check the original order before using this summary."
      : !totals.reconciles ? "The breakdown does not add up to the original order total. Check the original order." : null,
  };
}

export interface LabelContent {
  orderNumber: string;
  name: string;
  company: string;
  lines: string[];
  postcode: string;
  country: string;
  phone: string;
}

/** The courier label. Returns null when the order has no shipping address to deliver to. */
export function labelContent(order: WooOrder, options: { includeBillingPhone?: boolean } = {}): LabelContent | null {
  if (!hasAddress(order.shipping)) return null;
  const address = order.shipping;
  return {
    orderNumber: order.number,
    name: [address.first_name, address.last_name].filter(Boolean).join(" ").trim(),
    company: address.company?.trim() ?? "",
    lines: [address.address_1, address.address_2, address.city, address.state].map(line => line?.trim() ?? "").filter(Boolean),
    postcode: address.postcode?.trim() ?? "",
    country: countryName(address.country),
    phone: (address.phone || (options.includeBillingPhone ? order.billing.phone : "") || "").trim(),
  };
}
