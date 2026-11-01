// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { labelContent, summaryContent } from "../src/lib/print-documents.ts";

const secrets = ["buyer-private@example.com", "07700900123", "TXN-98765", "Leave the parcel by the back gate", "Happy birthday Ana", "_internal-only"];

const order = {
  id: 55,
  number: "1042",
  status: "processing",
  currency: "GBP",
  total: "25.00",
  total_tax: "0.00",
  shipping_total: "5.00",
  discount_total: "0.00",
  date_created: "2026-01-05T09:00:00",
  date_created_gmt: "2026-01-05T09:00:00",
  payment_method: "bacs",
  payment_method_title: "Bank transfer",
  transaction_id: "TXN-98765",
  customer_id: 0,
  customer_note: "Leave the parcel by the back gate",
  billing: { first_name: "Asha", last_name: "Patel", company: "", address_1: "1 High Street", city: "Leeds", postcode: "LS1 1AA", country: "GB", email: "buyer-private@example.com", phone: "07700900123" },
  shipping: { first_name: "Asha", last_name: "Patel", company: "Patel Ltd", address_1: "9 Mill Lane", address_2: "Flat 2", city: "York", state: "", postcode: "YO1 7ZZ", country: "GB", phone: "07700900999" },
  line_items: [{
    id: 1, name: "Blue mug", quantity: 2, subtotal: "20.00", total: "20.00", sku: "MUG-BLUE",
    meta_data: [{ id: 9, key: "Gift message", value: "Happy birthday Ana" }, { id: 10, key: "_internal-only", value: "x" }],
  }],
  shipping_lines: [{ id: 3, method_title: "Royal Mail 2nd Class", total: "5.00" }],
  refunds: [],
};

const asText = value => JSON.stringify(value);

test("the order summary carries only items, totals, payment title and an address", () => {
  const summary = summaryContent(order);
  const text = asText(summary);
  for (const secret of secrets) assert.equal(text.includes(secret), false, `summary must not contain ${secret}`);
  assert.equal(summary.orderNumber, "1042");
  assert.deepEqual(summary.lines, [{ name: "Blue mug", sku: "MUG-BLUE", quantity: 2, total: summary.lines[0].total }]);
  assert.equal(summary.payment, "Bank transfer");
  assert.equal(summary.address.heading, "Shipping address");
  assert.ok(summary.address.lines.includes("Patel Ltd"));
  assert.ok(summary.address.lines.some(line => line.includes("YO1 7ZZ")));
  assert.deepEqual(summary.totals.map(row => row.label), ["Items subtotal", "Shipping", "Tax", "Order total"]);
  assert.ok(summary.totals.at(-1).amount.includes("25.00"));
});

test("the summary falls back to the billing address when there is no shipping address", () => {
  const summary = summaryContent({ ...order, shipping: { first_name: "", last_name: "", address_1: "", city: "", postcode: "", country: "" } });
  assert.equal(summary.address.heading, "Billing address");
  assert.ok(summary.address.lines.includes("1 High Street"));
  assert.equal(asText(summary).includes("buyer-private@example.com"), false);
});

test("the label carries only the recipient, the order number and the phone", () => {
  const label = labelContent(order);
  assert.deepEqual(Object.keys(label).sort(), ["company", "country", "lines", "name", "orderNumber", "phone", "postcode"]);
  assert.equal(label.name, "Asha Patel");
  assert.equal(label.company, "Patel Ltd");
  assert.deepEqual(label.lines, ["9 Mill Lane", "Flat 2", "York"]);
  assert.equal(label.postcode, "YO1 7ZZ");
  assert.equal(label.country, "United Kingdom");
  assert.equal(label.phone, "07700900999");
  assert.equal(label.orderNumber, "1042");
  const text = asText(label);
  for (const secret of ["buyer-private@example.com", "TXN-98765", "Leave the parcel", "Happy birthday", "_internal-only", "Blue mug", "25.00"]) {
    assert.equal(text.includes(secret), false, `label must not contain ${secret}`);
  }
});

test("a shipping label never silently discloses a billing contact's phone", () => {
  assert.equal(labelContent({ ...order, shipping: { ...order.shipping, phone: "" } }).phone, "");
  assert.equal(labelContent({ ...order, shipping: { ...order.shipping, phone: "" } }, { includeBillingPhone: true }).phone, "07700900123", "staff can explicitly choose the billing contact when appropriate");
  assert.equal(labelContent({ ...order, shipping: { first_name: "", last_name: "", address_1: "", city: "", postcode: "", country: "" } }), null);
});

test("a refunded summary shows the original total, refund and net amount distinctly", () => {
  const partial = summaryContent({ ...order, refunds: [{ id: 1, total: "-5.00", reason: "Damaged" }] });
  assert.deepEqual(partial.totals.slice(-3).map(row => row.label), ["Order total", "Refunded", "Net after refunds"]);
  assert.ok(partial.totals.at(-1).amount.includes("20.00"));
  const full = summaryContent({ ...order, refunds: [{ id: 2, total: "-25.00", reason: "" }] });
  assert.ok(full.totals.at(-1).amount.includes("0.00"));
});
