// Opt-in checks against a disposable local WordPress site. Never runs against a public store.
// WP_TEST_URL, WP_TEST_USER, WP_TEST_PASSWORD and WP_TEST_SUB_PASSWORD must be set externally.
import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.WP_TEST_URL;
test("WordPress plugin catalog, reports and access", { skip: !base }, async () => {
  const target = new URL(base);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Use a disposable local site only");
  assert.ok(process.env.WP_TEST_PASSWORD && process.env.WP_TEST_SUB_PASSWORD);
  const calls = [];
  async function api(path, method = "GET", body, role = "admin") {
    const auth = role === "admin" ? `${process.env.WP_TEST_USER}:${process.env.WP_TEST_PASSWORD}` : `sub:${process.env.WP_TEST_SUB_PASSWORD}`;
    const url = base + path.replace("?", base.includes("?") ? "&" : "?");
    const response = await fetch(url, { method, headers: { Authorization: `Basic ${Buffer.from(auth).toString("base64")}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
    assert.match(response.headers.get("cache-control") || "", /no-store/, path);
    const data = await response.json();
    calls.push(`${method} ${path}: ${response.status}`);
    return { status: response.status, data };
  }
  for (const path of ["timezone", "settings", "woo/connection", "woo/products?per_page=2", "woo/customers?per_page=2", "woo/orders?per_page=2", "woo/order-statuses", "reports?kind=inventory"]) {
    const result = await api(path);
    assert.equal(result.status, 200, path);
    assert.equal((await api(path, "GET", undefined, "sub")).status, 403, `Subscriber: ${path}`);
  }
  const details = { name: `StoreOps review ${Date.now()}`, regular_price: "12.34", sku: "", description: "Review draft", image_url: "", status: "draft", manage_stock: true, stock_quantity: 7 };
  assert.equal((await api("woo/products", "POST", { ...details, regular_price: "bad" })).status, 400);
  assert.equal((await api("woo/products", "POST", { ...details, image_url: "https://example.invalid/image.png" })).status, 400);
  assert.equal((await api("woo/products", "POST", details, "sub")).status, 403);
  const created = await api("woo/products", "POST", details);
  assert.equal(created.status, 201);
  assert.equal(created.data.status, "draft");
  const id = created.data.id;
  assert.equal((await api(`woo/products/${id}`)).data.stock_quantity, 7);
  assert.equal((await api(`woo/products/${id}`, "PATCH", { stock_quantity: -1 })).status, 400);
  assert.equal((await api(`woo/products/${id}`, "PATCH", { stock_quantity: 8 }, "sub")).status, 403);
  assert.equal((await api(`woo/products/${id}`, "PATCH", { stock_quantity: 8 })).data.stock_quantity, 8);
  const products = await api(`woo/products?search=${encodeURIComponent(details.name)}`);
  assert.ok(products.data.products.some(product => product.id === id));
  assert.equal((await api("reports?kind=orders&from=2026-02-30&to=2026-03-01")).status, 400);
  assert.equal((await api("reports?kind=inventory&stock=bad")).status, 400);
  const report = await api("reports?kind=orders&from=2020-01-01&to=2020-12-31");
  assert.equal(report.status, 200);
  assert.equal(report.data.limit, 500);
  assert.ok(report.data.timezone);
  assert.ok(report.data.orders.every(order => !("billing" in order)));
  const inventory = await api("reports?kind=inventory");
  assert.ok(inventory.data.products.some(product => product.id === id && product.stock_quantity === 8));
  assert.ok(inventory.data.loaded <= 500);
  const unmanaged = await api("woo/products", "POST", { ...details, name: "Unmanaged review draft", manage_stock: false });
  assert.equal(unmanaged.status, 201);
  assert.equal((await api(`woo/products/${unmanaged.data.id}`, "PATCH", { stock_quantity: 3 })).status, 409);
  assert.equal((await api(`woo/products/${unmanaged.data.id}`)).data.manage_stock, false);
  const enabled = await api(`woo/products/${unmanaged.data.id}`, "PATCH", { stock_quantity: 3, enable_stock_management: true });
  assert.equal(enabled.data.manage_stock, true);
  assert.equal(enabled.data.stock_quantity, 3);
  const anon = await fetch(base + "settings");
  assert.equal(anon.status, 401);
  console.log(`${calls.length + 1} WordPress requests verified; draft product ${id} is disposable test data.`);
});
