import { test } from "node:test";
import assert from "node:assert/strict";
import { orderRevision, withOrderRevision } from "../src/lib/woocommerce/order-revision.ts";
import { parseOrderUpdate } from "../src/lib/woocommerce/order-update.ts";

const order = { id: 5, status: "processing", customer_id: 0, date_modified_gmt: "2026-11-01T10:00:00", billing: { email: "buyer@example.invalid", city: "Pune" }, shipping: { city: "Pune" } };
test("revision detects same-second customer, address and financial changes", () => {
  for (const changes of [{ customer_id: 7 }, { billing: { ...order.billing, email: "other@example.invalid" } }, { shipping: { city: "Mumbai" } }, { status: "completed" }, { total: "20.00" }]) {
    assert.notEqual(orderRevision(order), orderRevision({ ...order, ...changes }));
  }
});
test("revision ignores object key ordering, transport links and the revision itself", () => {
  assert.equal(orderRevision(order), orderRevision({ ...order, billing: { city: "Pune", email: "buyer@example.invalid" } }));
  assert.equal(orderRevision(order), orderRevision({ ...order, _links: { self: "/orders/5" }, edit_token: "old" }));
  assert.match(withOrderRevision(order).edit_token, /^[a-f0-9]{64}$/);
});
test("revisions cannot be malformed, used alone or omitted from ownership changes", async () => {
  const parse = body => parseOrderUpdate(body, () => true);
  for (const body of [{ if_match: "x" }, { status: "completed", if_match: "x" }, { if_match: orderRevision(order) }, { customer_id: 4 }, { customer_id: 0 }]) assert.equal((await parse(body)).ok, false);
  assert.equal((await parse({ customer_id: 4, if_match: orderRevision(order) })).ok, true);
});
