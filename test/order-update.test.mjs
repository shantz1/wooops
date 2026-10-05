// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOrderUpdate } from "../src/lib/woocommerce/order-update.ts";

const settable = status => ["processing", "completed"].includes(status);

test("accepts a status change and rejects unknown statuses", async () => {
  assert.deepEqual(await parseOrderUpdate({ status: "completed" }, settable), { ok: true, update: { status: "completed" } });
  assert.equal((await parseOrderUpdate({ status: "wc-trash" }, settable)).ok, false);
});

test("rejects empty bodies, non-objects and unknown top-level keys", async () => {
  for (const body of [null, [], "x", {}, { total: "1" }, { status: "completed", line_items: [] }]) {
    assert.equal((await parseOrderUpdate(body, settable)).ok, false, JSON.stringify(body));
  }
});

test("trims address fields, upper-cases country and keeps empty values (to clear a field)", async () => {
  const result = await parseOrderUpdate({ shipping: { first_name: "  Gina ", country: "in", company: "" } }, settable);
  assert.deepEqual(result, { ok: true, update: { shipping: { first_name: "Gina", country: "IN", company: "" } } });
});

test("only billing may carry an email, and it must look like one", async () => {
  assert.equal((await parseOrderUpdate({ billing: { email: "a@b.co" } }, settable)).ok, true);
  assert.equal((await parseOrderUpdate({ billing: { email: "nope" } }, settable)).ok, false);
  assert.equal((await parseOrderUpdate({ shipping: { email: "a@b.co" } }, settable)).ok, false);
});

test("rejects unsupported, non-text, oversized and control-character address values", async () => {
  for (const shipping of [{ role: "admin" }, { city: 5 }, { city: "x".repeat(201) }, { city: "a\u0000b" }, { country: "IND" }, [], {}]) {
    assert.equal((await parseOrderUpdate({ shipping }, settable)).ok, false, JSON.stringify(shipping));
  }
});

test("customer note is trimmed and limited to 1000 characters", async () => {
  assert.deepEqual(await parseOrderUpdate({ customer_note: " leave at door " }, settable), { ok: true, update: { customer_note: "leave at door" } });
  assert.equal((await parseOrderUpdate({ customer_note: "x".repeat(1001) }, settable)).ok, false);
  assert.equal((await parseOrderUpdate({ customer_note: 5 }, settable)).ok, false);
});
