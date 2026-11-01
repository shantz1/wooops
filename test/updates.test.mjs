import { test } from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion, releaseVersion } from "../src/lib/updates.ts";
import { routePermissions, meetsRequirement } from "../src/lib/permissions.ts";

test("only stable semantic release tags are accepted", () => {
  assert.equal(releaseVersion("v0.2.1"), "0.2.1");
  for (const value of [null, "main", "v0.3.0-beta.1", "0.2", "javascript:alert(1)", "1.2.99999999999999999999999"]) assert.equal(releaseVersion(value), null);
});
test("update comparison is numeric, never a downgrade or repeat of the installed release", () => {
  assert.equal(isNewerVersion("0.10.0", "0.2.0"), true);
  assert.equal(isNewerVersion("0.2.1", "0.2.0"), true);
  for (const value of ["0.1.9", "0.2.0", "beta"]) assert.equal(isNewerVersion(value, "0.2.0"), false);
});
test("update metadata requires settings access and has no code-install API", () => {
  assert.equal(meetsRequirement(routePermissions("GET", "/api/updates"), ["orders.view"]), false);
  assert.equal(meetsRequirement(routePermissions("GET", "/api/updates"), ["settings.view"]), true);
  assert.equal(routePermissions("POST", "/api/updates"), null);
});
