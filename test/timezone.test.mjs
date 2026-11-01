import { test } from "node:test";
import assert from "node:assert/strict";
import { storeTimezone, storeDateBounds, storeDate, storeLocalInstant } from "../src/lib/timezone.ts";

test("IST named and manual timezone settings produce the same report boundaries", () => {
  assert.equal(storeTimezone("Asia/Kolkata", 5.5), "Asia/Kolkata");
  assert.equal(storeTimezone("", 5.5), "+05:30");
  const expected = { after: "2026-09-30T18:30:00", before: "2026-10-02T18:29:59" };
  assert.deepEqual(storeDateBounds("2026-10-01", "2026-10-02", "Asia/Kolkata"), expected);
  assert.deepEqual(storeDateBounds("2026-10-01", "2026-10-02", "+05:30"), expected);
  assert.equal(storeDate(new Date("2026-10-01T19:00:00Z"), "Asia/Kolkata"), "2026-10-02");
});

test("store wall-clock timestamps resolve to real UTC instants including DST", () => {
  assert.equal(storeLocalInstant("2026-11-01T10:00:00", "Asia/Kolkata").toISOString(), "2026-11-01T04:30:00.000Z");
  assert.equal(storeLocalInstant("2026-11-01", "Asia/Kolkata").toISOString(), "2026-10-31T18:30:00.000Z");
  assert.equal(storeLocalInstant("2026-03-08T02:30:00", "America/New_York"), null);
  assert.equal(storeLocalInstant("2026-11-01T01:30:00", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(storeLocalInstant("2026-02-30T12:00:00", "UTC"), null);
});

test("report days respect daylight saving changes", () => {
  assert.deepEqual(storeDateBounds("2026-03-08", "2026-03-08", "America/New_York"), { after: "2026-03-08T05:00:00", before: "2026-03-09T03:59:59" });
  assert.deepEqual(storeDateBounds("2026-11-01", "2026-11-01", "America/New_York"), { after: "2026-11-01T04:00:00", before: "2026-11-02T04:59:59" });
});
