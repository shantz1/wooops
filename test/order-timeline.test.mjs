// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTimeline, parseStoreInstant } from "../src/lib/order-timeline.ts";

const order = { date_created: "2026-01-05T09:00:00", date_created_gmt: "2026-01-05T10:00:00", date_paid_gmt: null, date_completed_gmt: null, currency: "GBP" };
const note = (id, fields) => ({ id, author: "Asha", date_created_gmt: "2026-01-05T12:00:00", note: "Hello", customer_note: false, ...fields });
const build = (fields = {}) => buildTimeline({ order, notes: [], shipments: [], refunds: [], ...fields });
const kinds = events => events.map(event => event.kind);

test("parses GMT strings as UTC and falls back to the local value as approximate", () => {
  assert.deepEqual(parseStoreInstant("2026-01-05T10:00:00", "2026-01-05T11:00:00"), { iso: "2026-01-05T10:00:00.000Z", approximate: false });
  assert.deepEqual(parseStoreInstant("", "2026-01-05T11:00:00"), { iso: "2026-01-05T11:00:00.000Z", approximate: true });
  assert.deepEqual(parseStoreInstant(undefined, "2026-01-05 11:30:00"), { iso: "2026-01-05T11:30:00.000Z", approximate: true });
  assert.deepEqual(parseStoreInstant("2026-01-05T10:00:00Z"), { iso: "2026-01-05T10:00:00.000Z", approximate: false });
  assert.equal(parseStoreInstant(undefined, undefined), null);
});

test("skips invalid and zero dates", () => {
  assert.equal(parseStoreInstant("0000-00-00 00:00:00", "not a date"), null);
  assert.equal(parseStoreInstant("2026-13-01T10:00:00"), null);
  const events = build({ order: { ...order, date_created_gmt: "0000-00-00 00:00:00", date_created: "", date_paid_gmt: "garbage" } });
  assert.deepEqual(events, []);
});

test("creates order events from real dates and the approximate flag from the local fallback", () => {
  const events = build({ order: { ...order, date_created_gmt: undefined, date_completed_gmt: "2026-01-06T08:00:00", date_paid_gmt: "2026-01-05T10:05:00" } });
  assert.deepEqual(events.map(event => [event.kind, event.title, event.at, event.approximate]), [
    ["completed", "Marked completed", "2026-01-06T08:00:00.000Z", undefined],
    ["paid", "Payment recorded", "2026-01-05T10:05:00.000Z", undefined],
    ["placed", "Order placed", "2026-01-05T09:00:00.000Z", true],
  ]);
});

test("creates no events from empty input except the placed event", () => {
  assert.deepEqual(kinds(build({ order: { currency: "GBP", date_created_gmt: "2026-01-05T10:00:00" } })), ["placed"]);
  assert.deepEqual(build({ order: { currency: "GBP" } }), []);
});

test("classifies private notes, customer notes and status changes", () => {
  const events = build({
    notes: [
      note(1, { note: "<p>Call <b>back</b></p>" }),
      note(2, { customer_note: true, note: "Your parcel is on its way", author: "Shop" }),
      note(3, { author: "system", note: "Order status changed from Pending payment to Processing.", date_created_gmt: "2026-01-05T11:00:00" }),
    ],
  });
  const byId = Object.fromEntries(events.map(event => [event.id, event]));
  assert.equal(byId["note-1-note-private"].title, "Private note");
  assert.equal(byId["note-1-note-private"].detail, "Call back");
  assert.equal(byId["note-1-note-private"].actor, "Asha");
  assert.equal(byId["note-2-note-customer"].title, "Note to customer");
  assert.equal(byId["note-2-note-customer"].actor, "Shop");
  assert.equal(byId["note-3-status"].title, "Status changed: Pending payment → Processing");
  assert.equal(byId["note-3-status"].detail, undefined);
});

test("maps system, WooCommerce and empty authors to Store system", () => {
  const events = build({
    notes: [
      note(1, { author: "SYSTEM" }),
      note(2, { author: "WooCommerce" }),
      note(3, { author: "  " }),
      note(4, { author: "Mia" }),
    ],
  });
  const actors = Object.fromEntries(events.map(event => [event.id, event.actor]));
  assert.equal(actors["note-1-note-private"], "Store system");
  assert.equal(actors["note-2-note-private"], "Store system");
  assert.equal(actors["note-3-note-private"], "Store system");
  assert.equal(actors["note-4-note-private"], "Mia");
});

test("payment remains distinct from a nearby processing or on-hold status note", () => {
  const paidOrder = { ...order, date_paid_gmt: "2026-01-05T10:00:00" };
  const near = { note: "Order status changed from Pending payment to Processing.", date_created_gmt: "2026-01-05T10:01:59" };
  assert.deepEqual(kinds(build({ order: paidOrder, notes: [note(1, near)] })).filter(kind => kind === "paid"), ["paid"]);
  const far = { note: "Order status changed from Pending payment to Processing.", date_created_gmt: "2026-01-05T10:02:01" };
  assert.deepEqual(kinds(build({ order: paidOrder, notes: [note(1, far)] })).filter(kind => kind === "paid"), ["paid"]);
  const onHold = { note: "Order status changed from Pending payment to On hold.", date_created_gmt: "2026-01-05T10:00:30" };
  assert.deepEqual(kinds(build({ order: paidOrder, notes: [note(1, onHold)] })).filter(kind => kind === "paid"), ["paid"]);
});

test("drops the completed event only for a status note to Completed within 120 seconds", () => {
  const completedOrder = { ...order, date_completed_gmt: "2026-01-06T08:00:00" };
  const toCompleted = { note: "Order status changed from Processing to Completed.", date_created_gmt: "2026-01-06T08:00:00" };
  assert.deepEqual(kinds(build({ order: completedOrder, notes: [note(1, toCompleted)] })).filter(kind => kind === "completed"), []);
  const toProcessing = { note: "Order status changed from Pending payment to Processing.", date_created_gmt: "2026-01-06T08:00:00" };
  assert.deepEqual(kinds(build({ order: completedOrder, notes: [note(1, toProcessing)] })).filter(kind => kind === "completed"), ["completed"]);
});

test("a customer note that looks like a status change or refund is never dropped", () => {
  const paidOrder = { ...order, date_paid_gmt: "2026-01-05T10:00:00" };
  const customerStatus = { customer_note: true, note: "Order status changed from Pending payment to Processing.", date_created_gmt: "2026-01-05T10:00:00" };
  const events = build({ order: paidOrder, notes: [note(1, customerStatus)] });
  assert.ok(events.some(event => event.kind === "note-customer"));
  assert.ok(events.some(event => event.kind === "paid"));

  const refund = { id: 9, date_created_gmt: "2026-01-05T12:00:00", reason: "", amount: "5.00" };
  const customerRefund = { customer_note: true, note: "Refunded £5.00", date_created_gmt: "2026-01-05T12:00:30" };
  const refundEvents = build({ notes: [note(2, customerRefund)], refunds: [refund] });
  assert.ok(refundEvents.some(event => event.id === "note-2-note-customer"));
});

test("drops refund notes within 120 seconds of a refund event", () => {
  const refund = { id: 9, date_created_gmt: "2026-01-05T12:00:00", reason: "Damaged", amount: "5.00" };
  const near = note(1, { author: "WooCommerce", note: "Refunded £5.00 - Refund ID: 9 - Reason: Damaged", date_created_gmt: "2026-01-05T12:01:00" });
  const far = note(2, { note: "Refund requested", date_created_gmt: "2026-01-05T12:05:00" });
  const events = build({ notes: [near, far], refunds: [refund] });
  assert.ok(!events.some(event => event.id === "note-1-note-private"));
  assert.ok(events.some(event => event.id === "note-2-note-private"));
});

test("refund events show the amount, reason, items and actor only for positive integer ids", () => {
  const base = { reason: "", amount: "10.50" };
  const events = build({
    refunds: [
      { id: 1, date_created_gmt: "2026-01-05T12:00:00", ...base, reason: " Late ", refunded_by: 7, line_items: [{ name: "Mug", quantity: -2 }, { name: "Tote", quantity: -1 }] },
      { id: 2, date_created_gmt: "2026-01-05T13:00:00", ...base, refunded_by: 0 },
      { id: 3, date_created_gmt: "2026-01-05T14:00:00", ...base, refunded_by: 1.5 },
      { id: 4, date_created_gmt: "2026-01-05T15:00:00", ...base, refunded_by: "-3" },
      { id: 5, date_created_gmt: "2026-01-05T16:00:00", ...base, refunded_by: "abc" },
    ],
  });
  const byId = Object.fromEntries(events.map(event => [event.id, event]));
  assert.equal(byId["refund-1-refund"].title, "Refund of 10.50 GBP");
  assert.equal(byId["refund-1-refund"].detail, "Late · Mug × 2, Tote × 1");
  assert.equal(byId["refund-1-refund"].actor, "User #7");
  assert.equal(byId["refund-2-refund"].detail, "No reason given");
  for (const id of [2, 3, 4, 5]) assert.equal(byId[`refund-${id}-refund`].actor, undefined, String(id));
});

test("shipments need a valid shipped_at and never have an actor", () => {
  const shipment = { carrier: "DHL", tracking_number: "ZX1", tracking_url: "", shipped_at: "2026-01-06T09:00" };
  const events = build({ shipments: [{ id: "s1", ...shipment }, { id: "s2", ...shipment, shipped_at: "" }] });
  const shipped = events.filter(event => event.kind === "shipment");
  assert.equal(shipped.length, 1);
  assert.equal(shipped[0].id, "shipment-s1-shipment");
  assert.equal(shipped[0].title, "Shipped with DHL");
  assert.equal(shipped[0].detail, "Tracking ZX1");
  assert.equal(shipped[0].approximate, true);
  assert.equal(shipped[0].actor, undefined);
  assert.equal(shipped[0].at, "2026-01-06T09:00:00.000Z");
});

test("truncates note detail to 500 characters with an ellipsis", () => {
  const events = build({ notes: [note(1, { note: "a".repeat(500) }), note(2, { note: "b".repeat(501) })] });
  const byId = Object.fromEntries(events.map(event => [event.id, event]));
  assert.equal(byId["note-1-note-private"].detail, "a".repeat(500));
  assert.equal(byId["note-2-note-private"].detail, `${"b".repeat(500)}…`);
});

test("sorts newest first and breaks ties by source: refund, shipment, note, order", () => {
  const at = "2026-01-05T10:00:00";
  const events = build({
    order: { ...order, date_created_gmt: at, date_paid_gmt: "2026-01-05T10:00:00", date_completed_gmt: "2026-01-07T10:00:00" },
    notes: [note(1, { date_created_gmt: at, note: "Tie" }), note(2, { date_created_gmt: "2026-01-06T10:00:00", note: "Later" })],
    shipments: [{ id: "s1", carrier: "UPS", tracking_number: "1", tracking_url: "", shipped_at: "2026-01-05T10:00:00" }],
    refunds: [{ id: 1, date_created_gmt: at, reason: "", amount: "1" }],
  });
  assert.deepEqual(events.map(event => event.id), [
    "order-order-completed",
    "note-2-note-private",
    "refund-1-refund",
    "shipment-s1-shipment",
    "note-1-note-private",
    "order-order-placed",
    "order-order-paid",
  ]);
  const times = events.map(event => Date.parse(event.at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.deepEqual(events.slice(2, 4).map(event => event.source), ["refund", "shipment"]);
});

test("ids are unique even when the same source id appears twice", () => {
  const events = build({ notes: [note(1, {}), note(1, { note: "Another" })] });
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
});

test("store-local fallbacks and staff-entered dates use the configured timezone", () => {
  const events = build({ timeZone: "Asia/Kolkata", order: { currency: "INR", date_created: "2026-11-01T10:00:00", date_paid: "2026-11-01T10:05:00" }, shipments: [{ id: "day", carrier: "Courier", tracking_number: "1", tracking_url: "", shipped_at: "2026-11-01" }] });
  assert.equal(events.find(event => event.kind === "placed").at, "2026-11-01T04:30:00.000Z");
  assert.equal(events.find(event => event.kind === "paid").at, "2026-11-01T04:35:00.000Z");
  assert.equal(events.find(event => event.kind === "shipment").at, "2026-10-31T18:30:00.000Z");
  assert.equal(events.find(event => event.kind === "shipment").dateOnly, true);
});

test("refund deduplication never hides a staff note, unrelated refund id or failed refund", () => {
  const events = build({ notes: [note(1, { note: "Refund failed: investigate" }), note(2, { note: "Refunded £5.00 - Refund ID: 9 - Reason: check" }), note(3, { author: "WooCommerce", note: "Refunded £5.00 - Refund ID: 10 - Reason: different refund" })], refunds: [{ id: 9, amount: "5.00", reason: "", date_created_gmt: "2026-01-05T12:00:00" }] });
  for (const id of [1, 2, 3]) assert.ok(events.some(event => event.id === `note-${id}-note-private`));
});
