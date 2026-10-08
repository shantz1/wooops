import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardCards, defaultDashboard, validDashboardPreferences, isDashboardCard, dashboardCountQuery } from "../src/lib/dashboard.ts";
import { routePermissions, meetsRequirement } from "../src/lib/permissions.ts";

test("dashboard defaults preserve the existing four cards and do not enable a WP widget", () => {
  assert.deepEqual(defaultDashboard, { cards: dashboardCards.slice(0, 4).map(card => card.id), widget_enabled: false });
  assert.equal(validDashboardPreferences(defaultDashboard), true);
});

test("dashboard preferences allow ordered subsets and custom statuses, and reject malformed selections", () => {
  assert.equal(validDashboardPreferences({ cards: ["orders_today", "orders_week", "status:awaiting-payment", "status:ready-to-ship"], widget_enabled: true }), true);
  assert.equal(validDashboardPreferences({ cards: ["recent_value"], widget_enabled: false }), true);
  for (const cards of [[], ["orders_today", "orders_today"], [...defaultDashboard.cards, "orders_week"], ["status:trash"], ["status:checkout-draft"], ["status:<script>"], ["unknown"], [null]]) {
    assert.equal(validDashboardPreferences({ cards, widget_enabled: false }), false);
  }
  for (const value of [null, {}, { cards: ["orders_today"], widget_enabled: "true" }]) assert.equal(validDashboardPreferences(value), false);
  assert.equal(isDashboardCard("status:READY"), false);
});

test("daily counts use IST calendar boundaries even when the UTC day differs", () => {
  const query = dashboardCountQuery("orders_today", "Asia/Kolkata", new Date("2026-10-07T20:00:00Z"));
  assert.deepEqual(Object.fromEntries(query), { per_page: "1", _fields: "id", status: "any", after: "2026-10-07T18:30:00", before: "2026-10-08T18:29:59", dates_are_gmt: "true" });
});

test("weekly counts start Monday and follow daylight saving boundaries", () => {
  const sunday = dashboardCountQuery("orders_week", "America/New_York", new Date("2026-03-08T18:00:00Z"));
  assert.equal(sunday.get("after"), "2026-03-02T05:00:00");
  assert.equal(sunday.get("before"), "2026-03-09T03:59:59");
  const monday = dashboardCountQuery("orders_week", "Asia/Kolkata", new Date("2026-10-05T04:00:00Z"));
  assert.equal(monday.get("after"), "2026-10-04T18:30:00");
});

test("custom status cards count the whole store without date filters or a large payload", () => {
  assert.deepEqual(Object.fromEntries(dashboardCountQuery("status:ready-to-ship", "UTC")), { per_page: "1", _fields: "id", status: "ready-to-ship" });
  assert.throws(() => dashboardCountQuery("recent_value", "UTC"));
  assert.throws(() => dashboardCountQuery("status:trash", "UTC"));
});

test("dashboard permissions distinguish personal preferences from private order metrics", () => {
  assert.equal(routePermissions("GET", "/api/dashboard/preferences"), "any");
  assert.equal(meetsRequirement(routePermissions("PUT", "/api/dashboard/preferences"), ["orders.view"]), false);
  assert.equal(meetsRequirement(routePermissions("PUT", "/api/dashboard/preferences"), ["settings.view"]), true);
  assert.equal(meetsRequirement(routePermissions("GET", "/api/dashboard/metrics"), ["products.view"]), false);
  assert.equal(meetsRequirement(routePermissions("GET", "/api/dashboard/metrics"), ["orders.view"]), true);
});
