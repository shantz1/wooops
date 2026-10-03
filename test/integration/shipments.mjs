import { createHmac } from "node:crypto";
import { hashPassword } from "../../src/lib/password.ts";
import { TOTP } from "otpauth";
// Exercises the built Next.js routes against a local fake WooCommerce server, never the configured store.
// Run after `npm run build` using `npm run test:integration`.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("shipment and note routes against an isolated mock store", { timeout: 60_000 }, async t => {
  let order = { id: 1, billing: { email: "buyer@example.invalid" }, meta_data: [] };
  let requests = [];
  let notes = [];
  let saveMode = "normal";
  let noteMode = "normal";
  let reportCount = 2;
  let listDelay = 0;
  let initialLoginCode = "";
  const product = { id: 1, name: "Mock product", manage_stock: false, stock_quantity: null };
  const store = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    const path = new URL(request.url, "http://localhost").pathname;
    requests.push({ method: request.method, path, body, url: request.url });
    response.setHeader("Content-Type", "application/json");
    if (path === "/wp-json/") {
      assert.equal(request.headers.authorization, undefined);
      response.end(JSON.stringify({ timezone_string: "Asia/Kolkata", gmt_offset: 5.5 }));
    } else if (request.headers.authorization !== `Basic ${Buffer.from("ck_mock:cs_mock").toString("base64")}`) {
      response.writeHead(401).end(JSON.stringify({ error: "Expected mock credentials" }));
    } else if (path === "/wp-json/wc/v3/orders" || path === "/wp-json/wc/v3/products") {
      if (listDelay) await new Promise(resolve => setTimeout(resolve, listDelay));
      const page = Number(new URL(request.url, "http://localhost").searchParams.get("page") || 1);
      const count = path.endsWith("orders") ? reportCount : 2;
      const data = Array.from({ length: count }, (_, index) => ({ id: index + 1, number: String(index + 1), status: "completed", currency: "USD", total: "10.10", date_created: "2026-10-02T01:00:00", refunds: [], name: "Product", sku: "ABC", stock_status: "instock", manage_stock: index === 0, stock_quantity: index === 0 ? 5 : null }));
      response.setHeader("X-WP-Total", String(count));
      response.setHeader("X-WP-TotalPages", String(Math.ceil(count / 100)));
      response.end(JSON.stringify(data.slice((page - 1) * 100, page * 100)));
    } else if (path === "/wp-json/wc/v3/reports/orders/totals") {
      // The store's registered statuses, including an extension's custom status and an internal one.
      response.end(JSON.stringify([{ slug: "processing", name: "Processing", total: 3 }, { slug: "completed", name: "Completed", total: 9 },
        { slug: "awaiting-shipment", name: "Awaiting shipment", total: 1 }, { slug: "checkout-draft", name: "Draft", total: 0 }]));
    } else if (path === "/wp-json/wc/v3/products/1") {
      if (request.method === "PUT") Object.assign(product, body);
      response.end(JSON.stringify(product));
    } else if (path === "/wp-json/wc/v3/settings/general") {
      response.end(JSON.stringify([{ id: "woocommerce_currency", value: "USD" }, { id: "woocommerce_price_num_decimals", value: 2 }, { id: "unrelated_secret", value: "DO-NOT-EXPOSE" }]));
    } else if (path === "/wp-json/wc/v3/orders/1/notes") {
      if (request.method === "POST") {
        if (noteMode === "disconnect") { response.destroy(); return; }
        if (noteMode === "unreadable") { response.end("not-json"); return; }
        if (noteMode === "reject") { response.writeHead(400).end(JSON.stringify({ error: "Rejected note" })); return; }
        const note = { id: notes.length + 1, ...body };
        notes.push(note);
        response.writeHead(201).end(JSON.stringify(note));
      } else response.end(JSON.stringify(notes));
    } else if (path === "/wp-json/wc/v3/orders/1") {
      if (request.method === "PUT" && saveMode === "normal" && body.meta_data) {
        order.meta_data = body.meta_data.map(meta => ({ id: 11, ...meta }));
      }
      if (request.method === "PUT" && body.status) order.status = body.status;
      response.end(JSON.stringify(order));
    } else response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
  });
  await new Promise(resolve => store.listen(0, "127.0.0.1", resolve));
  t.after(() => { store.closeAllConnections(); store.close(); });
  const storePort = store.address().port;
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
  const appPort = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const adminHash = await hashPassword("mock-only-password");
  const readHash = await hashPassword("mock-readonly-password");
  const otpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const readOtpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    cwd: root,
    env: { ...process.env, WOOCOMMERCE_URL: `http://127.0.0.1:${storePort}`, WOOCOMMERCE_CONSUMER_KEY: "ck_mock",
      WOOCOMMERCE_CONSUMER_SECRET: "cs_mock", WOOOPS_ADMIN_PASSWORD: "", WOOOPS_ADMIN_PASSWORD_HASH: adminHash, WOOOPS_READONLY_PASSWORD_HASH: readHash,
      WOOOPS_SESSION_SECRET: "mock-only-session-signing-secret-with-32-characters", WOOOPS_PUBLIC_URL: `http://127.0.0.1:${appPort}`,
      WOOOPS_ADMIN_TOTP_SECRET: otpSecret, WOOOPS_READONLY_TOTP_SECRET: readOtpSecret, WOOCOMMERCE_WEBHOOK_SECRET: "mock-webhook-secret", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  child.stderr.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
  });
  const base = `http://127.0.0.1:${appPort}`;
  let sessionCookie = "";
  async function api(path, method = "GET", body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: base, Cookie: sessionCookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) break;
    try {
      if (!sessionCookie) {
        initialLoginCode = new TOTP({ secret: otpSecret }).generate();
        const login = await api("/api/auth/login", "POST", { password: "mock-only-password", code: initialLoginCode });
        assert.equal(login.status, 200);
        sessionCookie = login.headers.get("set-cookie").split(";")[0];
      }
      const result = await api("/api/woo/orders/1");
      assert.equal(result.status, 200);
      assert.equal(result.body.id, 1);
      // Verify the app really reached our mock BEFORE allowing any write test.
      assert.ok(requests.some(request => request.path === "/wp-json/wc/v3/orders/1"));
      ready = true;
      break;
    } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, `Isolated test app failed to reach the mock store. ${logs}`);
  const endpoint = "/api/woo/orders/1/shipments";
  const shipment = { carrier: "Mock Courier", tracking_number: "TRACK-1", tracking_url: "https://example.invalid/track", shipped_at: "2026-10-02" };

  await t.test("invalid writes never reach WooCommerce", async () => {
    const before = requests.length;
    for (const [path, method, body] of [[endpoint, "POST", {}], [endpoint, "PATCH", {}],
      ["/api/woo/orders/1/notes", "POST", { note: " " }], ["/api/woo/orders/1", "PATCH", { status: "invalid" }]]) {
      assert.equal((await api(path, method, body)).status, 400);
    }
    // An unknown status slug is checked against the store's registered statuses (a read); nothing is written.
    assert.deepEqual(requests.slice(before).map(request => `${request.method} ${request.path}`), ["GET /wp-json/wc/v3/reports/orders/totals"]);
  });
  await t.test("custom statuses registered in the store can be set; internal ones cannot", async () => {
    requests = [];
    const statuses = await api("/api/woo/order-statuses");
    assert.equal(statuses.status, 200);
    assert.deepEqual(statuses.body.statuses.map(item => [item.slug, item.settable]),
      [["processing", true], ["completed", true], ["awaiting-shipment", true], ["checkout-draft", false]]);
    const custom = await api("/api/woo/orders/1", "PATCH", { status: "awaiting-shipment" });
    assert.equal(custom.status, 200);
    assert.equal(custom.body.status, "awaiting-shipment");
    const report = await api("/api/reports?kind=orders&from=2026-01-01&to=2026-12-31&status=awaiting-shipment");
    assert.equal(report.status, 200);
    assert.equal(report.body.filters.status, "awaiting-shipment");
    assert.ok(requests.some(request => request.url.includes("status=awaiting-shipment")));
    requests = [];
    assert.equal((await api("/api/woo/orders/1", "PATCH", { status: "draft" })).status, 400);
    assert.equal((await api("/api/woo/orders/1", "PATCH", { status: "checkout-draft" })).status, 400);
    assert.equal((await api("/api/woo/orders/bulk", "POST", { ids: [1], status: "not-registered" })).status, 400);
    assert.ok(requests.every(request => request.method === "GET"), "rejected statuses must not reach WooCommerce writes");
    delete order.status;
  });
  await t.test("saves tracking before adding the customer-facing note", async () => {
    requests = [];
    const result = await api(endpoint, "POST", { ...shipment, notify_customer: true });
    assert.equal(result.status, 201);
    assert.equal(result.body.email_requested, true);
    assert.equal(result.body.shipments.length, 1);
    assert.deepEqual(requests.map(request => request.method), ["GET", "PUT", "POST"]);
    assert.equal(notes[0].customer_note, true);
    assert.match(notes[0].note, /Mock Courier/);
    assert.match(notes[0].note, /https:\/\/example.invalid\/track/);
  });
  await t.test("duplicate tracking is rejected without writing or notifying", async () => {
    const count = notes.length;
    requests = [];
    assert.equal((await api(endpoint, "POST", shipment)).status, 409);
    assert.deepEqual(requests.map(request => request.method), ["GET"]);
    assert.equal(notes.length, count);
  });
  await t.test("unconfirmed save never triggers a customer note", async () => {
    saveMode = "ignore";
    const count = notes.length;
    const result = await api(endpoint, "POST", { ...shipment, tracking_number: "NOT-SAVED", notify_customer: true });
    assert.equal(result.status, 502);
    assert.equal(notes.length, count);
    saveMode = "normal";
  });
  await t.test("notification connection failure preserves the shipment and reports uncertainty", async () => {
    noteMode = "disconnect";
    const result = await api(endpoint, "POST", { ...shipment, tracking_number: "SAVED-NOTE-UNKNOWN", notify_customer: true });
    assert.equal(result.status, 201);
    assert.equal(result.body.saved, true);
    assert.equal(result.body.email_outcome_unknown, true);
    assert.equal(result.body.shipments.length, 2);
    noteMode = "normal";
  });
  await t.test("missing billing email reports saved tracking with a definite notification failure", async () => {
    order.billing.email = "";
    const result = await api(endpoint, "POST", { ...shipment, tracking_number: "NO-EMAIL", notify_customer: true });
    assert.equal(result.status, 201);
    assert.equal(result.body.saved, true);
    assert.equal(result.body.email_outcome_unknown, false);
    assert.match(result.body.email_error, /no billing email/);
    order.billing.email = "buyer@example.invalid";
  });
  await t.test("unreadable notification response is an uncertain outcome", async () => {
    noteMode = "unreadable";
    const result = await api(endpoint, "POST", { ...shipment, tracking_number: "NOTE-UNREADABLE", notify_customer: true });
    assert.equal(result.status, 201);
    assert.equal(result.body.saved, true);
    assert.equal(result.body.email_outcome_unknown, true);
    noteMode = "normal";
  });
  await t.test("resend and removal operate on an existing saved shipment", async () => {
    const shipments = (await api(endpoint)).body.shipments;
    const id = shipments[0].id;
    assert.equal((await api(endpoint, "PATCH", { shipment_id: id })).body.email_requested, true);
    const removed = await api(endpoint, "DELETE", { shipment_id: id });
    assert.equal(removed.status, 200);
    assert.ok(!removed.body.shipments.some(item => item.id === id));
  });
  await t.test("malformed stored metadata cannot be overwritten", async () => {
    order.meta_data = [{ id: 11, key: "wooops_shipments", value: "invalid" }];
    requests = [];
    assert.equal((await api(endpoint, "POST", shipment)).status, 409);
    assert.deepEqual(requests.map(request => request.method), ["GET"]);
  });
  await t.test("unsafe stored tracking links cannot be rendered or edited", async () => {
    order.meta_data = [{ id: 11, key: "wooops_shipments", value: JSON.stringify([{ id: "unsafe", ...shipment, tracking_url: "javascript:alert(1)" }]) }];
    assert.equal((await api(endpoint)).status, 409);
  });
  await t.test("private notes stay private and missing orders return 404", async () => {
    const result = await api("/api/woo/orders/1/notes", "POST", { note: "Internal test note", customer_note: false });
    assert.equal(result.status, 201);
    assert.equal(result.body.customer_note, false);
    assert.equal((await api("/api/woo/orders/999")).status, 404);
  });
  await t.test("reports validate before fetching and convert store dates to UTC", async () => {
    const before = requests.length;
    assert.equal((await api("/api/reports?kind=orders&from=2026-02-30&to=2026-03-01")).status, 400);
    assert.equal(requests.length, before);
    const result = await api("/api/reports?kind=orders&from=2026-10-01&to=2026-10-02&status=completed");
    assert.equal(result.status, 200);
    assert.equal(result.body.complete, true);
    assert.equal(result.body.loaded, 2);
    assert.equal(result.body.filters.status, "completed");
    const url = new URL(requests.at(-1).url, "http://localhost");
    assert.equal(url.searchParams.get("dates_are_gmt"), "true");
    assert.equal(url.searchParams.get("before"), "2026-10-02T18:29:59");
  });
  await t.test("reports paginate but mark the 500-record limit as incomplete", async () => {
    reportCount = 105;
    let result = await api("/api/reports?kind=orders&from=2026-10-01&to=2026-10-02");
    assert.equal(result.body.loaded, 105);
    assert.equal(result.body.complete, true);
    reportCount = 505;
    result = await api("/api/reports?kind=orders&from=2026-10-01&to=2026-10-02");
    assert.equal(result.body.loaded, 500);
    assert.equal(result.body.total, 505);
    assert.equal(result.body.complete, false);
  });
  await t.test("inventory preserves unmanaged quantities and settings expose only selected fields", async () => {
    const inventory = await api("/api/reports?kind=inventory");
    assert.equal(inventory.status, 200);
    assert.equal(inventory.body.products[1].manage_stock, false);
    assert.equal(inventory.body.products[1].stock_quantity, null);
    const settings = await api("/api/settings");
    assert.equal(settings.status, 200);
    assert.equal(settings.body.store.currency, "USD");
    assert.equal(settings.body.store.decimal_places, "2");
    assert.ok(!JSON.stringify(settings.body).includes("DO-NOT-EXPOSE"));
    assert.ok(!JSON.stringify(settings.body).includes("cs_mock"));
  });
  await t.test("stock updates cannot silently enable stock management", async () => {
    const before = requests.length;
    assert.equal((await api("/api/woo/products/1", "PATCH", { stock_quantity: 7 })).status, 409);
    assert.equal(product.manage_stock, false);
    assert.deepEqual(requests.slice(before).map(request => request.method), ["GET"]);
    const enabled = await api("/api/woo/products/1", "PATCH", { stock_quantity: 7, enable_stock_management: true });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.manage_stock, true);
    const updated = await api("/api/woo/products/1", "PATCH", { stock_quantity: 8 });
    assert.equal(updated.body.stock_quantity, 8);
    assert.deepEqual(requests.at(-1).body, { stock_quantity: 8 });
  });
  await t.test("concurrent connection reads share one store request and list fields are bounded", async () => {
    listDelay = 100;
    const before = requests.length;
    const results = await Promise.all([api("/api/woo/connection"), api("/api/woo/connection")]);
    assert.ok(results.every(result => result.status === 200));
    assert.equal(requests.length - before, 1);
    assert.equal(new URL(requests.at(-1).url, "http://localhost").searchParams.get("_fields"), "id");
    listDelay = 0;
    await api("/api/woo/products?per_page=20&page=2");
    assert.equal(new URL(requests.at(-1).url, "http://localhost").searchParams.get("page"), "2");
    assert.ok(new URL(requests.at(-1).url, "http://localhost").searchParams.get("_fields").includes("images"));
  });
  await t.test("sessions, CSRF and read-only access block unauthorized store operations", async () => {
    const before = requests.length;
    const anon = await fetch(base + "/api/woo/orders/1");
    assert.equal(anon.status, 401);
    assert.match(anon.headers.get("cache-control"), /no-store/);
    assert.equal(anon.headers.get("x-frame-options"), "DENY");
    assert.equal(anon.headers.get("x-content-type-options"), "nosniff");
    assert.equal(anon.headers.get("x-powered-by"), null);
    for (const origin of [undefined, "https://attacker.invalid"]) {
      const response = await fetch(base + "/api/woo/orders/1", { method: "PATCH", headers: {
        Cookie: sessionCookie, "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}),
      }, body: JSON.stringify({ status: "completed" }) });
      assert.equal(response.status, 403);
    }
    assert.equal((await api("/api/woo/orders", "POST", { malicious: true })).status, 405);
    assert.equal((await api("/api/woo/orders/1", "DELETE")).status, 405);
    assert.equal(requests.length, before);
    const adminCookie = sessionCookie;
    const readLogin = await api("/api/auth/login", "POST", { password: "mock-readonly-password", code: new TOTP({ secret: readOtpSecret }).generate() });
    assert.equal(readLogin.status, 200);
    assert.equal(readLogin.body.role, "readonly");
    assert.match(readLogin.headers.get("set-cookie"), /HttpOnly/);
    assert.match(readLogin.headers.get("set-cookie"), /Secure/);
    assert.match(readLogin.headers.get("set-cookie"), /SameSite=strict/i);
    sessionCookie = readLogin.headers.get("set-cookie").split(";")[0];
    assert.equal((await api("/api/settings")).body.access.role, "readonly");
    assert.equal((await api("/api/timezone")).body.access.role, "readonly");
    const reads = requests.length;
    for (const [path, method, body] of [["/api/woo/orders/1", "PATCH", { status: "completed" }],
      ["/api/woo/orders/bulk", "POST", { ids: [1], status: "completed" }],
      ["/api/woo/orders/1/notes", "POST", { note: "Blocked" }],
      ["/api/woo/orders/1/shipments", "POST", shipment],
      ["/api/woo/products/1", "PATCH", { stock_quantity: 2 }],
      ["/api/woo/products", "POST", { name: "Blocked" }]]) {
      assert.equal((await api(path, method, body)).status, 403);
    }
    assert.equal(requests.length, reads);
    assert.equal((await api("/api/auth/logout", "POST")).status, 200);
    sessionCookie = adminCookie;
  });
  await t.test("webhooks require a valid HMAC and malformed or oversized bodies cannot write", async () => {
    const before = requests.length;
    assert.equal((await api("/api/woo/webhooks", "POST", {})).status, 401);
    const raw = JSON.stringify({ event: "mock-only", note: "?" });
    const signature = createHmac("sha256", "mock-webhook-secret").update(raw).digest("base64");
    const webhook = await fetch(base + "/api/woo/webhooks", { method: "POST", headers: { "x-wc-webhook-signature": signature }, body: raw });
    assert.equal(webhook.status, 200);
    assert.equal((await webhook.json()).received, true);
    assert.equal((await api("/api/woo/orders/1/notes", "POST", { note: "x".repeat(70_000) })).status, 400);
    const broken = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: base }, body: "{" });
    assert.equal(broken.status, 400);
    assert.equal(requests.length, before);
  });
  await t.test("authenticator failures and reused codes do not grant sessions", async () => {
    const bad = await api("/api/auth/login", "POST", { password: "mock-only-password", code: "wrong" });
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get("set-cookie"), null);
    assert.equal((await api("/api/auth/login", "POST", { password: "mock-only-password", code: initialLoginCode })).status, 401);
  });
  await t.test("sign-in attempts are bounded and return a retry delay", async () => {
    let limited = false;
    for (let attempt = 0; attempt < 22; attempt++) {
      const result = await api("/api/auth/login", "POST", { password: 123 });
      if (result.status === 429) {
        assert.ok(Number(result.headers.get("retry-after")) > 0);
        limited = true;
        break;
      }
      assert.equal(result.status, 401);
    }
    assert.equal(limited, true);
  });
  await t.test("production refuses unconfigured authentication instead of opening the panel", async () => {
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const protectedPort = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const secured = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(protectedPort), "-H", "127.0.0.1"], {
      cwd: root, env: { ...process.env, WOOCOMMERCE_URL: `http://127.0.0.1:${storePort}`, WOOCOMMERCE_CONSUMER_KEY: "ck_mock", WOOCOMMERCE_CONSUMER_SECRET: "cs_mock",
        WOOOPS_ADMIN_PASSWORD: "", WOOOPS_ADMIN_PASSWORD_HASH: "", WOOOPS_READONLY_PASSWORD_HASH: "",
        WOOOPS_SESSION_SECRET: "mock-only-session-signing-secret-with-32-characters", WOOOPS_PUBLIC_URL: `http://127.0.0.1:${protectedPort}`, WOOOPS_ADMIN_TOTP_SECRET: "", WOOOPS_READONLY_TOTP_SECRET: "", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore", windowsHide: true,
    });
    t.after(async () => { if (secured.exitCode === null) { const exited = once(secured, "exit"); secured.kill(); await exited; } });
    const securedBase = `http://127.0.0.1:${protectedPort}`;
    let online = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { assert.equal((await fetch(`${securedBase}/api/settings`)).status, 503); online = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(online);
    assert.equal((await fetch(`${securedBase}/api/reports?kind=inventory`)).status, 503);
    const login = await fetch(`${securedBase}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: securedBase }, body: JSON.stringify({ password: "mock-only-password" }) });
    assert.equal(login.status, 503);
    assert.equal(login.headers.get("set-cookie"), null);
  });
});
