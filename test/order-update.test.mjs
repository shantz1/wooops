// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { isStale, parseOrderUpdate, savedAddress, addressFields } from "../src/lib/woocommerce/order-update.ts";

const settable = status => ["processing", "completed"].includes(status);
const revision = "a".repeat(64);

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

test("customer assignment: ids must be non-negative integers; 0 means guest", async () => {
  assert.deepEqual(await parseOrderUpdate({ customer_id: 12, if_match: revision }, settable), { ok: true, update: { customer_id: 12, if_match: revision } });
  assert.deepEqual(await parseOrderUpdate({ customer_id: 0, if_match: revision }, settable), { ok: true, update: { customer_id: 0, if_match: revision } });
  assert.equal((await parseOrderUpdate({ customer_id: 12 }, settable)).ok, false, "ownership changes require a revision");
  for (const customer_id of [-1, 1.5, "12", null, NaN, Number.MAX_SAFE_INTEGER + 2]) assert.equal((await parseOrderUpdate({ customer_id }, settable)).ok, false, String(customer_id));
});

test("replace_addresses is only valid together with a real customer id", async () => {
  assert.equal((await parseOrderUpdate({ customer_id: 4, replace_addresses: true, if_match: revision }, settable)).ok, true);
  for (const body of [{ replace_addresses: true }, { customer_id: 0, replace_addresses: true }, { customer_id: 4, replace_addresses: "yes" }, { customer_id: 4, replace_addresses: false }]) {
    assert.equal((await parseOrderUpdate(body, settable)).ok, false, JSON.stringify(body));
  }
});

test("the stale-edit token has a strict shape and cannot be sent alone", async () => {
  assert.equal((await parseOrderUpdate({ customer_id: 4, if_match: revision, if_unmodified_since: "2026-10-05T10:11:12" }, settable)).ok, true);
  assert.equal((await parseOrderUpdate({ customer_id: 4, if_match: revision, if_unmodified_since: "2026-10-05T10:11:12.5" }, settable)).ok, true);
  for (const token of ["", "yesterday", "2026-10-05", 5, null]) assert.equal((await parseOrderUpdate({ customer_id: 4, if_unmodified_since: token }, settable)).ok, false, String(token));
  assert.equal((await parseOrderUpdate({ if_unmodified_since: "2026-10-05T10:11:12" }, settable)).ok, false);
});

test("a change is stale when the order's modified time differs from the one the editor saw", () => {
  assert.equal(isStale(undefined, "2026-10-05T10:11:12"), false);
  assert.equal(isStale("2026-10-05T10:11:12", "2026-10-05T10:11:12"), false);
  assert.equal(isStale("2026-10-05T10:11:12", "2026-10-05T10:11:13"), true);
  assert.equal(isStale("2026-10-05T10:11:12", undefined), true);
});

test("saved addresses keep only known text fields, trimmed and capped", () => {
  const saved = savedAddress({ first_name: " Gina ", city: "x".repeat(300), role: "admin", phone: 5, country: "IN" }, addressFields);
  assert.deepEqual(Object.keys(saved).sort(), [...addressFields].sort());
  assert.equal(saved.company, "", "replacement clears missing saved fields instead of creating a hybrid address");
  assert.equal(saved.first_name, "Gina");
  assert.equal(saved.city.length, 200);
  assert.deepEqual(savedAddress(null, addressFields), {});
});
