import type { ReportOrder } from "../types/reports.ts";
import { addDecimals, decimalToString, negate, sumDecimals } from "./money.ts";

export function reportCurrencyTotals(orders: ReportOrder[]) {
  const groups = new Map<string, ReportOrder[]>();
  for (const order of orders) groups.set(order.currency, [...(groups.get(order.currency) || []), order]);
  return [...groups].map(([currency, rows]) => {
    const total = sumDecimals(rows.map(order => order.total));
    const refunds = sumDecimals(rows.flatMap(order => (order.refunds || []).map(refund => refund.total)));
    return { currency, orders: rows.length, valid: total.valid && refunds.valid,
      total: decimalToString(total.value), refunds: decimalToString(negate(refunds.value)),
      after_refunds: decimalToString(addDecimals(total.value, refunds.value)) };
  });
}

/** Always quote cells and neutralize spreadsheet formulas, including a whitespace prefix. */
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportCsv(rows: unknown[][]) {
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
