// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { withOrderLock } from "../src/lib/woocommerce/order-lock.ts";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("work for the same order never overlaps and keeps arrival order", async () => {
  let running = 0, peak = 0;
  const order = [];
  const task = name => withOrderLock("13", async () => { running++; peak = Math.max(peak, running); await sleep(10); order.push(name); running--; return name; });
  const results = await Promise.all(["a", "b", "c", "d"].map(task));
  assert.equal(peak, 1);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  assert.deepEqual(results, ["a", "b", "c", "d"]);
});

test("different orders run in parallel", async () => {
  let running = 0, peak = 0;
  const task = key => withOrderLock(key, async () => { running++; peak = Math.max(peak, running); await sleep(20); running--; });
  await Promise.all([task("1"), task("2"), task("3")]);
  assert.equal(peak, 3);
});

test("a failing task does not block the next one and still reports its error", async () => {
  const failing = withOrderLock("9", async () => { await sleep(5); throw new Error("boom"); });
  const next = withOrderLock("9", async () => "ok");
  await assert.rejects(failing, /boom/);
  assert.equal(await next, "ok");
});

test("a check-then-create section with the same id creates only once", async () => {
  const created = new Set();
  const refund = id => withOrderLock("13", async () => {
    if (created.has(id)) return "duplicate";
    await sleep(5); // time between the check and the create
    created.add(id);
    return "created";
  });
  const results = await Promise.all(Array.from({ length: 6 }, () => refund("req-1")));
  assert.equal(results.filter(result => result === "created").length, 1);
  assert.equal(results.filter(result => result === "duplicate").length, 5);
});

test("after an unknown failure the lock is held, so a retry waits and then sees the store's result", async () => {
  let storeHasRefund = false;
  const first = withOrderLock("77", async () => {
    setTimeout(() => { storeHasRefund = true; }, 30); // the store finishes late, after the caller already got a timeout
    throw new Error("timeout");
  }, () => 60);
  const retry = withOrderLock("77", async () => (storeHasRefund ? "duplicate" : "created again"));
  await assert.rejects(first, /timeout/);
  assert.equal(await retry, "duplicate");
});

test("a definite failure releases the lock at once", async () => {
  const started = Date.now();
  await assert.rejects(withOrderLock("78", async () => { throw new Error("invalid"); }, () => 0));
  assert.equal(await withOrderLock("78", async () => "ok"), "ok");
  assert.ok(Date.now() - started < 50);
});
