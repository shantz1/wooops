// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { couriers, findCourier, trackingLink } from "../src/lib/couriers.ts";
import { listHref, listQuery, parseListState } from "../src/lib/orders-navigation.ts";
import { isStatusSlug } from "../src/lib/woocommerce/validation.ts";

test("courier templates are HTTPS and contain the number placeholder", () => {
  for (const courier of couriers) {
    assert.ok(courier.template.startsWith("https://"), courier.name);
    assert.ok(courier.template.includes("{number}"), courier.name);
  }
});

test("courier names match case-insensitively and by alias", () => {
  assert.equal(findCourier("dhl")?.name, "DHL Express");
  assert.equal(findCourier("  Blue-Dart ")?.name, "Blue Dart");
  assert.equal(findCourier("Unknown Freight"), null);
  assert.equal(findCourier(""), null);
});

test("tracking links encode the number and stay empty without a known courier", () => {
  assert.equal(trackingLink("UPS", " 1Z 999/AA#1 "), "https://www.ups.com/track?tracknum=1Z%20999%2FAA%231");
  assert.equal(trackingLink("UPS", "   "), "");
  assert.equal(trackingLink("My Local Courier", "123"), "");
});

test("list state is read defensively from the URL", () => {
  assert.deepEqual(parseListState(new URLSearchParams("status=processing&page=3&search=gina")), { search: "gina", status: "processing", page: 3 });
  assert.deepEqual(parseListState(new URLSearchParams("status=%3Cscript%3E&page=-2")), { search: "", status: "all", page: 1 });
  assert.deepEqual(parseListState(new URLSearchParams("status=awaiting-shipment&page=abc")), { search: "", status: "awaiting-shipment", page: 1 });
  assert.equal(parseListState(new URLSearchParams(`search=${"x".repeat(300)}`)).search.length, 200);
});

test("list URLs omit defaults", () => {
  assert.equal(listQuery({ search: "", status: "all", page: 1 }), "");
  assert.equal(listHref({ search: "", status: "all", page: 1 }), "/orders");
  assert.equal(listHref({ search: " a b ", status: "on-hold", page: 2 }), "/orders?search=a+b&status=on-hold&page=2");
});

test("status slugs allow custom statuses but not arbitrary text", () => {
  assert.equal(isStatusSlug("awaiting-shipment"), true);
  assert.equal(isStatusSlug("wc-processing x"), false);
  assert.equal(isStatusSlug("a".repeat(41)), false);
});
