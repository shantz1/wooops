// Exercises role permissions in the built standalone app against a local fake WooCommerce store, never a real store.
// Run after `npm run build` using `npm run test:integration`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../../src/lib/password.ts";

test("role permissions are enforced by the standalone API", { timeout: 90_000 }, async t => {
  const writes = [];
  const orderReads = [];
  let omitCountHeader = false;
  const order = { id: 1, number: "1", status: "processing", currency: "USD", total: "10.00", billing: { email: "buyer@example.invalid" }, meta_data: [], line_items: [] };
  const product = { id: 1, name: "Mock product", type: "simple", manage_stock: true, stock_quantity: 5, date_modified_gmt: "2026-10-01T00:00:00" };
  const store = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    if (request.method !== "GET") writes.push(`${request.method} ${path}`);
    response.setHeader("Content-Type", "application/json");
    if (path === "/wp-json/") return response.end(JSON.stringify({ name: "Mock store", timezone_string: "UTC", gmt_offset: 0 }));
    if (path === "/wp-json/wc/v3/orders" || path === "/wp-json/wc/v3/customers" || path === "/wp-json/wc/v3/products") {
      if (path.endsWith("orders")) orderReads.push(Object.fromEntries(url.searchParams));
      if (!omitCountHeader) response.setHeader("X-WP-Total", url.searchParams.get("status") === "awaiting-shipment" ? "23" : "1");
      response.setHeader("X-WP-TotalPages", "1");
      return response.end(JSON.stringify(path.endsWith("orders") ? [order] : path.endsWith("products") ? [product] : [{ id: 7, email: "c@example.invalid" }]));
    }
    if (path === "/wp-json/wc/v3/orders/1") {
      if (request.method === "PUT") Object.assign(order, body.status ? { status: body.status } : {}, body.meta_data ? { meta_data: body.meta_data.map(meta => ({ id: 11, ...meta })) } : {});
      return response.end(JSON.stringify(order));
    }
    if (path === "/wp-json/wc/v3/orders/1/notes") return response.writeHead(request.method === "POST" ? 201 : 200).end(JSON.stringify(request.method === "POST" ? { id: 1, ...body } : []));
    if (path === "/wp-json/wc/v3/products/1") {
      if (request.method === "PUT") Object.assign(product, body);
      return response.end(JSON.stringify(product));
    }
    if (path === "/wp-json/wc/v3/reports/orders/totals") return response.end(JSON.stringify([{ slug: "processing", name: "Processing", total: 1 }, { slug: "awaiting-shipment", name: "Awaiting shipment", total: 23 }]));
    if (path === "/wp-json/wc/v3/settings/general") return response.end(JSON.stringify([{ id: "woocommerce_currency", value: "USD" }]));
    response.writeHead(404).end(JSON.stringify({ message: "Not found" }));
  });
  await new Promise(resolve => store.listen(0, "127.0.0.1", resolve));
  t.after(() => { store.closeAllConnections(); store.close(); });

  const dir = mkdtempSync(join(tmpdir(), "wooops-permissions-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const accessFile = join(dir, "access.json");
  writeFileSync(accessFile, JSON.stringify({
    roles: {
      packer: { label: "Packer", permissions: ["orders.view", "orders.notes", "orders.shipments"] },
      stock: { label: "Stock clerk", permissions: ["products.view", "inventory.edit"] },
    },
    logins: [
      { username: "pat", name: "Pat", role: "packer", password_hash: await hashPassword("packer-password-123") },
      { username: "sam", name: "Sam", role: "stock", password_hash: await hashPassword("stock-password-1234") },
    ],
  }));

  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const appPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${appPort}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: { ...process.env, WOOCOMMERCE_URL: `http://127.0.0.1:${store.address().port}`, WOOCOMMERCE_CONSUMER_KEY: "ck_mock", WOOCOMMERCE_CONSUMER_SECRET: "cs_mock",
      WOOOPS_ADMIN_PASSWORD: "", WOOOPS_ADMIN_PASSWORD_HASH: await hashPassword("admin-password-12345"), WOOOPS_READONLY_PASSWORD_HASH: await hashPassword("readonly-password-12"),
      WOOOPS_ADMIN_TOTP_SECRET: "", WOOOPS_READONLY_TOTP_SECRET: "", WOOOPS_ACCESS_FILE: accessFile,
      WOOOPS_SESSION_SECRET: "mock-only-session-signing-secret-with-32-characters", WOOOPS_PUBLIC_URL: base, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  child.stderr.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  t.after(async () => { if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } });

  async function signIn(username, password) {
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username, password }) });
        if (response.status === 401) return null;
        if (response.ok) return response.headers.get("set-cookie").split(";")[0];
      } catch { /* The app is still starting. */ }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`App did not start. ${logs}`);
  }
  const as = cookie => async (path, method = "GET", body) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  await t.test("wrong usernames and passwords are refused", async () => {
    assert.equal(await signIn("pat", "wrong-password-123"), null);
    assert.equal(await signIn("nobody", "packer-password-123"), null);
  });

  await t.test("a packer can fulfil orders but not change status, notify customers or see other screens", async () => {
    const pat = as(await signIn("pat", "packer-password-123"));
    const workspace = await pat("/api/timezone");
    assert.deepEqual(workspace.body.access.permissions, ["orders.view", "orders.notes", "orders.shipments"]);
    assert.equal(workspace.body.access.role_label, "Packer");
    assert.equal((await pat("/api/woo/orders")).status, 200);
    assert.equal((await pat("/api/woo/orders/1")).status, 200);
    assert.equal((await pat("/api/woo/order-statuses")).status, 200);
    writes.length = 0;
    assert.equal((await pat("/api/woo/orders/1", "PATCH", { status: "completed" })).status, 403);
    assert.equal((await pat("/api/woo/orders/bulk", "POST", { ids: [1], status: "completed" })).status, 403);
    assert.equal((await pat("/api/woo/orders/1/notes", "POST", { note: "Customer note", customer_note: true })).status, 403);
    const shipment = { carrier: "Mock", tracking_number: "T-1", tracking_url: "", shipped_at: "" };
    assert.equal((await pat("/api/woo/orders/1/shipments", "POST", { ...shipment, notify_customer: true })).status, 403);
    assert.deepEqual(writes, [], "refused requests must not reach the store");
    assert.equal((await pat("/api/woo/orders/1/notes", "POST", { note: "Packed in box 2", customer_note: false })).status, 201);
    assert.equal((await pat("/api/woo/orders/1/shipments", "POST", shipment)).status, 201);
    for (const path of ["/api/woo/customers", "/api/reports?kind=inventory", "/api/woo/products", "/api/woo/connection", "/api/woo/catalog?resource=categories"]) {
      assert.equal((await pat(path)).status, 403, path);
    }
    const settings = await pat("/api/settings");
    assert.equal(settings.status, 200);
    assert.equal(settings.body.access.rules, null, "role details are only shown to logins that can open Settings");
  });

  await t.test("a stock clerk can change stock but not edit products or see orders", async () => {
    const sam = as(await signIn("sam", "stock-password-1234"));
    assert.equal((await sam("/api/woo/products")).status, 200);
    assert.equal((await sam("/api/woo/products/1", "PATCH", { stock_quantity: 9 })).status, 200);
    writes.length = 0;
    assert.equal((await sam("/api/woo/products/1", "PATCH", { details: { name: "Renamed" }, modified: product.date_modified_gmt })).status, 403);
    assert.equal((await sam("/api/woo/catalog?resource=categories", "POST", { name: "New" })).status, 403);
    assert.equal((await sam("/api/woo/products", "POST", { name: "New", regular_price: "1.00", status: "draft", manage_stock: false })).status, 403);
    assert.deepEqual(writes, []);
    assert.equal((await sam("/api/woo/orders")).status, 403);
    const before = orderReads.length;
    assert.equal((await sam("/api/dashboard/metrics?cards=orders_today")).status, 403);
    assert.equal(orderReads.length, before, "refused metric requests do not read private orders");
    assert.equal((await sam("/api/woo/order-statuses")).status, 403);
  });

  await t.test("overview metrics use totals headers, bounded payloads and validated status/date filters", async () => {
    const pat = as(await signIn("pat", "packer-password-123"));
    const result = await pat("/api/dashboard/metrics?cards=orders_today,orders_week,status:awaiting-shipment");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.counts, { orders_today: 1, orders_week: 1, "status:awaiting-shipment": 23 });
    const queries = orderReads.slice(-3);
    assert.ok(queries.every(query => query.per_page === "1" && query._fields === "id"));
    assert.ok(queries.filter(query => query.after).every(query => query.dates_are_gmt === "true" && query.before));
    assert.equal(queries.find(query => query.status === "awaiting-shipment").after, undefined);
    const before = orderReads.length;
    for (const cards of ["", "recent_value", "status:trash", "orders_today,orders_today", "status:unregistered"]) {
      assert.equal((await pat(`/api/dashboard/metrics?cards=${cards}`)).status, 400);
    }
    assert.equal(orderReads.length, before, "invalid cards do not fetch order data");
    omitCountHeader = true;
    try { assert.equal((await pat("/api/dashboard/metrics?cards=orders_today")).status, 502, "missing totals must never display a false zero"); }
    finally { omitCountHeader = false; }
  });

  await t.test("built-in logins keep working: read-only cannot write, administrator sees every role", async () => {
    const reader = as(await signIn("", "readonly-password-12"));
    assert.equal((await reader("/api/woo/orders")).status, 200);
    assert.equal((await reader("/api/woo/orders/1", "PATCH", { status: "completed" })).status, 403);
    assert.equal((await reader("/api/woo/products/1", "PATCH", { stock_quantity: 1 })).status, 403);
    const admin = as(await signIn("", "admin-password-12345"));
    const settings = await admin("/api/settings");
    assert.deepEqual(settings.body.access.rules.roles.map(role => role.slug), ["admin", "readonly", "packer", "stock"]);
    assert.ok(settings.body.access.rules.logins.some(login => login.username === "pat" && login.role === "packer"));
    assert.ok(!JSON.stringify(settings.body).includes("scrypt:"), "password hashes never leave the server");
    assert.equal((await admin("/api/woo/orders/1", "PATCH", { status: "completed" })).status, 200);
  });
});
