// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { decimalToString, formatMoney, parseDecimal, roundDecimal, sumDecimals } from "../src/lib/money.ts";
import { orderTotals } from "../src/lib/order-totals.ts";

const text = value => value === null ? null : decimalToString(value);

test("sums decimal strings exactly", () => {
  const { value, valid } = sumDecimals(["0.10", "0.20", "-0.05", undefined]);
  assert.equal(decimalToString(value), "0.25");
  assert.equal(valid, true);
  assert.equal(sumDecimals(["1.00", "abc"]).valid, false);
});

test("rounds half away from zero", () => {
  assert.equal(decimalToString(roundDecimal(parseDecimal("16.666667"), 2)), "16.67");
  assert.equal(decimalToString(roundDecimal(parseDecimal("-0.125"), 2)), "-0.13");
  assert.equal(decimalToString(roundDecimal(parseDecimal("5"), 2)), "5.00");
});

test("breaks down an order with discount, fees, shipping, tax and refunds", () => {
  const totals = orderTotals({
    total: "115.50",
    line_items: [{ subtotal: "60.00" }, { subtotal: "40.00" }],
    discount_total: "10.00",
    fee_lines: [{ total: "5.00" }],
    shipping_total: "12.00",
    total_tax: "8.50",
    refunds: [{ id: 1, reason: "", total: "-20.00" }, { id: 2, reason: "", total: "-5.50" }],
  });
  assert.deepEqual(totals.rows.map(row => [row.key, text(row.amount)]), [
    ["items", "100.00"], ["discount", "-10.00"], ["fees", "5.00"], ["shipping", "12.00"], ["tax", "8.50"],
  ]);
  assert.equal(totals.reconciles, true);
  assert.equal(totals.valid, true);
  assert.equal(text(totals.refunded), "25.50");
  assert.equal(text(totals.netAfterRefunds), "90.00");
});

test("flags a breakdown that does not reconcile and omits empty refund rows", () => {
  const totals = orderTotals({ total: "50.00", line_items: [{ subtotal: "40.00" }], shipping_total: "5.00", total_tax: "0.00" });
  assert.equal(totals.reconciles, false);
  assert.equal(totals.refunded, null);
  assert.equal(totals.rows.some(row => row.key === "discount"), false);
});

test("reconciles line subtotals stored with extra precision", () => {
  const totals = orderTotals({ total: "50.00", line_items: [{ subtotal: "16.666667" }, { subtotal: "16.666667" }, { subtotal: "16.666666" }], shipping_total: "0.00", total_tax: "0.00" });
  assert.equal(totals.reconciles, true);
});

test("respects zero-decimal store totals", () => {
  const totals = orderTotals({ total: "1500", line_items: [{ subtotal: "1500" }], shipping_total: "0", total_tax: "0" });
  assert.equal(totals.scale, 0);
  assert.equal(totals.reconciles, true);
  assert.match(formatMoney(totals.total, "JPY", "en-US"), /1,500/);
});

test("falls back when the currency code is unknown", () => {
  assert.equal(formatMoney("12.00", "NOT-A-CODE"), "NOT-A-CODE 12.00");
});
