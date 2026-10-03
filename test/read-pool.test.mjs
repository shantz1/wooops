import assert from "node:assert/strict";
import { test } from "node:test";
import { createReadPool } from "../src/lib/read-pool.ts";

test("concurrent reads share work but resolved responses are not cached", async () => {
  const pool = createReadPool();
  let calls = 0;
  const load = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { id: calls }; };
  const [a, b] = await Promise.all([pool.read("orders", load), pool.read("orders", load)]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await pool.read("orders", load);
  assert.equal(calls, 2);
});

test("cancelling one subscriber preserves the other and clears all cancelled reads", async () => {
  const pool = createReadPool();
  const a = new AbortController();
  const b = new AbortController();
  let aborted = false;
  const load = signal => new Promise(resolve => {
    signal.addEventListener("abort", () => { aborted = true; }, { once: true });
    setTimeout(() => resolve("loaded"), 10);
  });
  const first = pool.read("settings", load, a.signal);
  const second = pool.read("settings", load, b.signal);
  await Promise.resolve();
  a.abort();
  await assert.rejects(first, { name: "AbortError" });
  assert.equal(aborted, false);
  assert.equal(await second, "loaded");
  const c = new AbortController();
  const pending = pool.read("settings", load, c.signal);
  await Promise.resolve();
  c.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(aborted, true);
  assert.equal(await pool.read("settings", async () => "fresh"), "fresh");
});

test("errors are not retained and clearing prevents joining a pre-write read", async () => {
  const pool = createReadPool();
  await assert.rejects(pool.read("orders", async () => { throw new Error("failed"); }), /failed/);
  let finish;
  const old = pool.read("orders", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  pool.clear();
  assert.equal(await pool.read("orders", async () => "after write"), "after write");
  finish("old");
  assert.equal(await old, "old");
});
