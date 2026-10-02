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
      const page = Number(new URL(request.url, "http://localhost").searchParams.get("page") || 1);
      const count = path.endsWith("orders") ? reportCount : 2;
      const data = Array.from({ length: count }, (_, index) => ({ id: index + 1, number: String(index + 1), status: "completed", currency: "USD", total: "10.10", date_created: "2026-10-02T01:00:00", refunds: [], name: "Product", sku: "ABC", stock_status: "instock", manage_stock: index === 0, stock_quantity: index === 0 ? 5 : null }));
      response.setHeader("X-WP-Total", String(count));
      response.setHeader("X-WP-TotalPages", String(Math.ceil(count / 100)));
      response.end(JSON.stringify(data.slice((page - 1) * 100, page * 100)));
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
      if (request.method === "PUT" && saveMode === "normal") {
        order.meta_data = body.meta_data.map(meta => ({ id: 11, ...meta }));
      }
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
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort), "-H", "127.0.0.1"], {
    cwd: root,
    env: { ...process.env, WOOCOMMERCE_URL: `http://127.0.0.1:${storePort}`, WOOCOMMERCE_CONSUMER_KEY: "ck_mock",
      WOOCOMMERCE_CONSUMER_SECRET: "cs_mock", WOOOPS_ADMIN_PASSWORD: "", WOOOPS_SESSION_SECRET: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  child.stderr.on("data", chunk => { logs = (logs + chunk).slice(-4000); });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
  });
  const base = `http://127.0.0.1:${appPort}`;
  async function api(path, method = "GET", body) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25_000) });
    return { status: response.status, body: await response.json() };
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) break;
    try {
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
    assert.equal(requests.length, before);
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
  await t.test("reports and settings require a session when password protection is enabled", async () => {
    const probe = createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const protectedPort = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const secured = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(protectedPort), "-H", "127.0.0.1"], {
      cwd: root, env: { ...process.env, WOOCOMMERCE_URL: `http://127.0.0.1:${storePort}`, WOOCOMMERCE_CONSUMER_KEY: "ck_mock", WOOCOMMERCE_CONSUMER_SECRET: "cs_mock",
        WOOOPS_ADMIN_PASSWORD: "mock-only-password", WOOOPS_SESSION_SECRET: "mock-only-session-signing-secret", NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore", windowsHide: true,
    });
    t.after(async () => { if (secured.exitCode === null) { const exited = once(secured, "exit"); secured.kill(); await exited; } });
    const securedBase = `http://127.0.0.1:${protectedPort}`;
    let online = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { assert.equal((await fetch(`${securedBase}/api/settings`)).status, 401); online = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(online);
    assert.equal((await fetch(`${securedBase}/api/reports?kind=inventory`)).status, 401);
    const login = await fetch(`${securedBase}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "mock-only-password" }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(`${securedBase}/api/settings`, { headers: { cookie } })).status, 200);
  });
});
