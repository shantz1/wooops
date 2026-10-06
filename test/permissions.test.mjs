// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { identityFor, parseAccessConfig } from "../src/lib/access.ts";
import { allPermissions, meetsRequirement, permissionList, routePermissions, screenAllowed, touchesStock } from "../src/lib/permissions.ts";

test("every API route used by the panel has a permission rule", () => {
  const expectations = [
    ["GET", "/api/woo/orders", ["orders.view"]],
    ["PATCH", "/api/woo/orders/12", ["orders.status"]],
    ["POST", "/api/woo/orders/bulk", ["orders.status"]],
    ["POST", "/api/woo/orders/12/notes", ["orders.notes"]],
    ["GET", "/api/woo/orders/12/refunds", ["orders.view"]],
    ["POST", "/api/woo/orders/12/refunds", ["orders.refund"]],
    ["POST", "/api/woo/orders/12/shipments", ["orders.shipments"]],
    ["PATCH", "/api/woo/orders/12/shipments", ["orders.notify"]],
    ["DELETE", "/api/woo/orders/12/shipments", ["orders.shipments"]],
    ["GET", "/api/woo/customers", ["customers.view"]],
    ["GET", "/api/reports", ["reports.view"]],
    ["POST", "/api/woo/catalog", ["products.edit"]],
    ["GET", "/api/woo/connection", ["settings.view"]],
    ["HEAD", "/api/woo/orders", ["orders.view"]],
  ];
  for (const [method, path, expected] of expectations) assert.deepEqual(routePermissions(method, path), expected, `${method} ${path}`);
  assert.deepEqual(routePermissions("GET", "/api/woo/order-statuses"), { anyOf: ["orders.view", "reports.view"] });
  assert.equal(routePermissions("GET", "/api/settings"), "any");
  // Unknown routes and methods have no rule, so the guard refuses them unless the login has every permission.
  assert.equal(routePermissions("GET", "/api/woo/secret"), null);
  assert.equal(routePermissions("DELETE", "/api/woo/customers"), null);
  assert.equal(routePermissions("GET", "/api/woo/orders/12/../../customers"), null);
});

test("requirements and screens", () => {
  assert.equal(meetsRequirement(["orders.view", "orders.status"], ["orders.view"]), false);
  assert.equal(meetsRequirement(["orders.view"], ["orders.view", "reports.view"]), true);
  assert.equal(meetsRequirement({ anyOf: ["orders.view", "reports.view"] }, ["reports.view"]), true);
  assert.equal(meetsRequirement({ anyOf: ["orders.view", "reports.view"] }, []), false);
  assert.equal(meetsRequirement("any", []), true);
  assert.equal(screenAllowed("/orders/55/packing-slip", ["orders.view"]), true);
  assert.equal(screenAllowed("/products/new", ["products.view"]), false);
  assert.equal(screenAllowed("/products/categories", ["products.view"]), true);
  assert.equal(screenAllowed("/", ["products.view"]), false);
  assert.equal(touchesStock({ regular_price: "1" }), false);
  assert.equal(touchesStock({ stock_quantity: 3 }), true);
  assert.equal(touchesStock(null), false);
});

test("the plugin's capability list matches the shared permission list", () => {
  const php = readFileSync(new URL("../wordpress/kartodesk-for-woocommerce/includes/class-kartodesk-access.php", import.meta.url), "utf8");
  const block = php.slice(php.indexOf("const PERMISSIONS = array("), php.indexOf(");", php.indexOf("const PERMISSIONS = array(")));
  const pairs = [...block.matchAll(/'([a-z.]+)'\s*=>\s*'([a-z_]+)'/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(pairs, permissionList.map(item => [item.key, item.capability]));
  const woo = php.slice(php.indexOf("const WOOCOMMERCE_CAPS = array("), php.indexOf("const MENU_CAPABILITY"));
  for (const key of allPermissions) assert.match(woo, new RegExp(`'${key.replace(".", "\\.")}'`), `WooCommerce capabilities listed for ${key}`);
});

test("new permissions exist and administrators get all of them", () => {
  assert.equal(allPermissions.length, 15);
  assert.ok(allPermissions.includes("orders.refund"));
  assert.ok(!allPermissions.includes("orders.delete"), "order deletion is not part of KartoDesk");
  assert.ok(allPermissions.includes("discounts.manage"));
  assert.ok(allPermissions.includes("customers.edit"));
  assert.ok(allPermissions.includes("tools.run"));
  const testHash = "scrypt:131072:8:1:" + "a".repeat(32) + ":" + "b".repeat(64);
  const valid = parseAccessConfig({ roles: { packer: { label: "Packer", permissions: ["orders.refund", "tools.run"] } },
    logins: [{ username: "packer", name: "Packer", role: "packer", password_hash: testHash }] });
  assert.equal(valid.error, null);
  const identity = identityFor("u-packer", valid.config);
  assert.ok(identity.permissions.includes("orders.refund"));
  assert.ok(identity.permissions.includes("tools.run"));
});

const hash = "scrypt:131072:8:1:" + "a".repeat(32) + ":" + "b".repeat(64);

test("access files are validated strictly", () => {
  const valid = parseAccessConfig({ roles: { packer: { label: "Packer", permissions: ["orders.view", "orders.shipments"] } },
    logins: [{ username: "Ravi", name: "Ravi", role: "packer", password_hash: hash }] });
  assert.equal(valid.error, null);
  assert.equal(valid.config.logins[0].id, "u-ravi");
  const identity = identityFor("u-ravi", valid.config);
  assert.deepEqual(identity.permissions, ["orders.view", "orders.shipments"]);
  assert.equal(identity.roleLabel, "Packer");
  assert.equal(identityFor("u-nobody", valid.config), null);
  assert.deepEqual(identityFor("admin", valid.config).permissions, allPermissions);
  const failures = [
    { roles: { admin: { permissions: [] } } },
    { roles: { packer: { permissions: ["orders.fake"] } } },
    { roles: { "Bad Role": { permissions: [] } } },
    { logins: [{ username: "x", role: "admin", password_hash: hash }] },
    { logins: [{ username: "ravi", role: "ghost", password_hash: hash }] },
    { logins: [{ username: "ravi", role: "admin", password_hash: "plain-text" }] },
    { logins: [{ username: "ravi", role: "admin", password_hash: hash }, { username: "RAVI", role: "admin", password_hash: hash }] },
    { logins: [{ username: "ravi", role: "admin", password_hash: hash, totp_secret: "short" }] },
    [],
  ];
  for (const value of failures) assert.match(parseAccessConfig(value).error ?? "", /^Access file:/, JSON.stringify(value));
});

test("named logins sign in, carry their role's permissions and are signed out when the access file changes", async () => {
  const names = ["NODE_ENV", "WOOOPS_ADMIN_PASSWORD_HASH", "WOOOPS_ADMIN_PASSWORD", "WOOOPS_READONLY_PASSWORD_HASH", "WOOOPS_SESSION_SECRET",
    "WOOOPS_PUBLIC_URL", "WOOOPS_ADMIN_TOTP_SECRET", "WOOOPS_READONLY_TOTP_SECRET", "WOOOPS_ACCESS_FILE"];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const dir = mkdtempSync(join(tmpdir(), "wooops-access-"));
  try {
    const { hashPassword } = await import("../src/lib/password.ts");
    const auth = await import("../src/lib/auth.ts");
    const file = join(dir, "access.json");
    const write = permissions => writeFileSync(file, JSON.stringify({ roles: { packer: { label: "Packer", permissions } },
      logins: [{ username: "ravi", name: "Ravi", role: "packer", password_hash: packerHash }] }));
    const packerHash = await hashPassword("packer-password-123");
    write(["orders.view", "orders.shipments"]);
    process.env.NODE_ENV = "production";
    process.env.WOOOPS_ADMIN_PASSWORD_HASH = hash;
    process.env.WOOOPS_SESSION_SECRET = "test-only-secret-".repeat(4);
    process.env.WOOOPS_PUBLIC_URL = "https://panel.example";
    process.env.WOOOPS_ACCESS_FILE = file;
    for (const name of ["WOOOPS_ADMIN_PASSWORD", "WOOOPS_READONLY_PASSWORD_HASH", "WOOOPS_ADMIN_TOTP_SECRET", "WOOOPS_READONLY_TOTP_SECRET"]) delete process.env[name];
    assert.equal(auth.authConfigurationError(), null);
    assert.equal(await auth.authenticateLogin("RAVI", "packer-password-123"), "u-ravi");
    assert.equal(await auth.authenticateLogin("ravi", "wrong-password-123"), null);
    assert.equal(await auth.authenticateLogin("nobody", "packer-password-123"), null);
    const pendingLogin = auth.authenticateLogin("ravi", "packer-password-123");
    write(["orders.view"]);
    assert.equal(await pendingLogin, null, "an in-flight password check cannot use replaced access rules");
    write(["orders.view", "orders.shipments"]);
    const token = auth.createSessionToken("u-ravi");
    assert.deepEqual(auth.sessionIdentity(token).permissions, ["orders.view", "orders.shipments"]);
    assert.equal(auth.sessionIdentity(token.replace("u-ravi", "admin")), null);
    // Changing the file (here: granting more) revokes existing sessions; the next sign-in gets the new permissions.
    await new Promise(resolve => setTimeout(resolve, 20));
    write(["orders.view", "orders.shipments", "orders.status"]);
    assert.equal(auth.sessionIdentity(token), null);
    assert.ok(auth.sessionIdentity(auth.createSessionToken("u-ravi")).permissions.includes("orders.status"));
    writeFileSync(file, "{ not json");
    assert.match(auth.authConfigurationError(), /Access file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
