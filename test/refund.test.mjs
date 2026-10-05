// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { findRefundByRequestId, parseRefundRequest, refundMetaKey, remainingUnits, toUnits } from "../src/lib/woocommerce/refund.ts";

const base = { amount: "10.50", request_id: "abcd-1234-efgh" };

test("accepts a minimal amount-only refund and defaults to record-only", () => {
  const result = parseRefundRequest(base);
  assert.equal(result.ok, true);
  assert.deepEqual(result.refund, { amount: "10.50", reason: "", items: [], restock: false, gateway: false, requestId: "abcd-1234-efgh" });
});

test("rejects bad amounts", () => {
  for (const amount of ["0", "0.00", "-5", "1e3", "10,5", " 5", "5.12345", "", 5, null, "1234567890"]) {
    assert.equal(parseRefundRequest({ ...base, amount }).ok, false, String(amount));
  }
});

test("requires a well-formed request id and rejects unknown keys or flags", () => {
  for (const request_id of [undefined, "short", "has space 1234", "x".repeat(41), 12345678]) assert.equal(parseRefundRequest({ ...base, request_id }).ok, false, String(request_id));
  assert.equal(parseRefundRequest({ ...base, extra: 1 }).ok, false);
  assert.equal(parseRefundRequest({ ...base, gateway: "yes" }).ok, false);
  assert.equal(parseRefundRequest({ ...base, restock: 1 }).ok, false);
  assert.equal(parseRefundRequest({ ...base, reason: "x".repeat(201) }).ok, false);
});

test("validates items, rejects duplicates and totals above the refund amount", () => {
  const ok = parseRefundRequest({ ...base, items: [{ id: 7, quantity: 1, refund_total: "10.50" }], restock: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.refund.restock, true);
  for (const items of [[{ id: 7, quantity: 1, refund_total: "10.51" }], [{ id: 7, quantity: 1, refund_total: "1" }, { id: 7, quantity: 1, refund_total: "1" }], [{ id: 0, quantity: 1, refund_total: "1" }], [{ id: 1, quantity: 1.5, refund_total: "1" }], [{ id: 1, quantity: -1, refund_total: "1" }], [{ id: 1, quantity: 1, refund_total: 1 }], [{ id: 1, quantity: 1, refund_total: "1", tax: 1 }], "x"]) {
    assert.equal(parseRefundRequest({ ...base, items }).ok, false, JSON.stringify(items));
  }
});

test("restock is ignored when no items are refunded", () => {
  assert.equal(parseRefundRequest({ ...base, restock: true }).refund.restock, false);
});

test("money maths has no floating-point drift", () => {
  assert.equal(toUnits("0.1") + toUnits("0.2"), toUnits("0.3"));
  assert.equal(remainingUnits({ total: "100.00", refunds: [{ total: "-33.33" }, { total: "-33.33" }] }), toUnits("33.34"));
  assert.equal(remainingUnits({ total: "50.00" }), toUnits("50"));
});

test("finds a refund created by the same request id", () => {
  const refunds = [{ id: 1, meta_data: [{ key: "other", value: "x" }] }, { id: 2, meta_data: [{ key: refundMetaKey, value: "abcd-1234-efgh" }] }, { id: 3 }];
  assert.equal(findRefundByRequestId(refunds, "abcd-1234-efgh")?.id, 2);
  assert.equal(findRefundByRequestId(refunds, "zzzz-1234-efgh"), undefined);
});

test("per-item tax breakdown is validated and counted against the refund amount", async () => {
  const { currencyDecimals } = await import("../src/lib/woocommerce/refund.ts");
  const item = (taxes, refund_total = "100.00") => ({ id: 7, quantity: 1, refund_total, taxes });
  const ok = parseRefundRequest({ ...base, amount: "118.00", items: [item([{ id: 3, refund_total: "18.00" }])] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.refund.items[0].taxes, [{ id: 3, refund_total: "18.00" }]);
  assert.deepEqual(parseRefundRequest({ ...base, amount: "100.00", items: [{ id: 7, quantity: 1, refund_total: "100.00" }] }).refund.items[0].taxes, []);
  // Net plus tax may not exceed the refund amount.
  assert.equal(parseRefundRequest({ ...base, amount: "100.00", items: [item([{ id: 3, refund_total: "18.00" }])] }).ok, false);
  for (const taxes of [[{ id: 0, refund_total: "1" }], [{ id: 3, refund_total: "1" }, { id: 3, refund_total: "1" }], [{ id: 3, refund_total: 1 }], [{ id: 3, refund_total: "1", x: 1 }], "x", Array.from({ length: 21 }, (_, index) => ({ id: index + 1, refund_total: "0.01" }))]) {
    assert.equal(parseRefundRequest({ ...base, amount: "500.00", items: [item(taxes)] }).ok, false, JSON.stringify(taxes));
  }
  // Currencies with other than two decimals.
  assert.equal(currencyDecimals({ total: "57.50", line_items: [{ total: "36.66" }] }), 2);
  assert.equal(currencyDecimals({ total: "10.500", line_items: [{ total: "10.500" }] }), 3);
  assert.equal(currencyDecimals({ total: "1000", line_items: [{ total: "1000" }] }), 0);
  assert.equal(currencyDecimals({ total: "" }), 2);
});

test("partial refunds retain valid tax rates whose share rounds to zero", async () => {
  const { refundTaxShares } = await import("../src/lib/woocommerce/refund.ts");
  const item = { quantity: 3, total_tax: "0.01", taxes: [{ id: 1, total: "0.01" }] };
  assert.deepEqual(refundTaxShares(item, 1, 2), [{ id: 1, units: 0 }]);
  assert.deepEqual(refundTaxShares(item, 3, 2), [{ id: 1, units: 1 }]);
  assert.equal(refundTaxShares({ ...item, taxes: [] }, 1, 2), null);
  assert.deepEqual(refundTaxShares({ quantity: 3, total_tax: "0", taxes: [] }, 1, 2), []);
  assert.deepEqual(refundTaxShares({ quantity: 3, total_tax: "0.001", taxes: [{ id: 2, total: "0.001" }] }, 1, 3), [{ id: 2, units: 0 }]);
});
