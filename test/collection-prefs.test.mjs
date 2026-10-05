// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addView,
  defaultPrefs,
  limits,
  newViewId,
  parsePrefs,
  removeView,
  sanitizePrefs,
  serializePrefs,
  setColumns,
  setDensity,
  viewMatches,
  validFilterKey,
} from "../src/lib/collection-prefs.ts";

test("defaultPrefs returns expected structure", () => {
  const defaults = defaultPrefs(["name", "email"]);
  assert.deepEqual(defaults, {
    columns: ["name", "email"],
    density: "comfortable",
    views: [],
  });
});

test("corrupt JSON and non-object input fall back to defaults", () => {
  const allColumns = ["a", "b", "c"];
  const defaultColumns = ["a", "b"];

  // Invalid JSON
  assert.deepEqual(parsePrefs("{invalid", allColumns, defaultColumns), {
    columns: ["a", "b"],
    density: "comfortable",
    views: [],
  });

  // null
  assert.deepEqual(parsePrefs(null, allColumns, defaultColumns), {
    columns: ["a", "b"],
    density: "comfortable",
    views: [],
  });

  // Non-object input
  assert.deepEqual(
    sanitizePrefs("string", allColumns, defaultColumns),
    defaultPrefs(defaultColumns)
  );
  assert.deepEqual(
    sanitizePrefs(123, allColumns, defaultColumns),
    defaultPrefs(defaultColumns)
  );
  assert.deepEqual(
    sanitizePrefs([], allColumns, defaultColumns),
    defaultPrefs(defaultColumns)
  );
});

test("unknown columns dropped and order follows allColumns", () => {
  const allColumns = ["name", "email", "status"];
  const defaultColumns = ["name", "email"];

  const raw = {
    columns: ["status", "unknown", "name"],
    density: "comfortable",
    views: [],
  };

  const result = sanitizePrefs(raw, allColumns, defaultColumns);
  // Should follow allColumns order: name, then status (unknown dropped)
  assert.deepEqual(result.columns, ["name", "status"]);
});

test("empty columns fall back to defaults", () => {
  const allColumns = ["name", "email"];
  const defaultColumns = ["name"];

  const raw = {
    columns: ["unknown1", "unknown2"],
    density: "comfortable",
    views: [],
  };

  const result = sanitizePrefs(raw, allColumns, defaultColumns);
  assert.deepEqual(result.columns, ["name"]);
});

test("invalid density falls back to comfortable", () => {
  const result = sanitizePrefs(
    { columns: [], density: "invalid", views: [] },
    ["a"],
    ["a"]
  );
  assert.equal(result.density, "comfortable");

  const result2 = sanitizePrefs(
    { columns: [], density: "compact", views: [] },
    ["a"],
    ["a"]
  );
  assert.equal(result2.density, "compact");
});

test("views with bad ids, empty names, and invalid filters are dropped", () => {
  const raw = {
    columns: ["a"],
    density: "comfortable",
    views: [
      // Invalid id (contains uppercase)
      { id: "Invalid", name: "view1", filters: { status: "done" } },
      // Invalid id (contains space)
      { id: "v 1", name: "view2", filters: {} },
      // Empty name (after trim)
      { id: "v1", name: "   ", filters: {} },
      // Valid view
      { id: "v2", name: "Valid View", filters: { status: "pending" } },
      // Invalid filter key
      { id: "v3", name: "view3", filters: { "Status-Bad": "value" } },
      // Filter value too long
      {
        id: "v4",
        name: "view4",
        filters: { status: "x".repeat(limits.filterValueLength + 1) },
      },
      // Valid view with multiple valid filters
      {
        id: "v5",
        name: "view5",
        filters: { status: "done", priority: "high" },
      },
    ],
  };

  const result = sanitizePrefs(raw, ["a"], ["a"]);
  assert.equal(result.views.length, 2);
  assert.deepEqual(result.views[0], {
    id: "v2",
    name: "Valid View",
    filters: { status: "pending" },
  });
  assert.deepEqual(result.views[1], {
    id: "v5",
    name: "view5",
    filters: { status: "done", priority: "high" },
  });
});

test("duplicate view ids are dropped", () => {
  const raw = {
    columns: ["a"],
    density: "comfortable",
    views: [
      { id: "v1", name: "first", filters: {} },
      { id: "v1", name: "duplicate", filters: {} },
      { id: "v2", name: "second", filters: {} },
    ],
  };

  const result = sanitizePrefs(raw, ["a"], ["a"]);
  assert.equal(result.views.length, 2);
  assert.deepEqual(result.views.map((v) => v.id), ["v1", "v2"]);
});

test("sanitize respects the 12-view cap", () => {
  const views = Array.from({ length: 15 }, (_, i) => ({
    id: `v${i + 1}`,
    name: `view${i + 1}`,
    filters: {},
  }));

  const raw = {
    columns: ["a"],
    density: "comfortable",
    views,
  };

  const result = sanitizePrefs(raw, ["a"], ["a"]);
  assert.equal(result.views.length, limits.views);
  assert.equal(limits.views, 12);
});

test("sanitize respects the 10-filter-per-view cap", () => {
  const filters = {};
  const keys = [
    "status",
    "priority",
    "category",
    "type_a",
    "source",
    "owner",
    "stage",
    "level",
    "mode",
    "flag",
    "extra",
    "another",
    "third",
    "fourth",
    "fifth",
  ];
  for (let i = 0; i < 15; i++) {
    filters[keys[i]] = `value${i}`;
  }

  const raw = {
    columns: ["a"],
    density: "comfortable",
    views: [{ id: "v1", name: "view", filters }],
  };

  const result = sanitizePrefs(raw, ["a"], ["a"]);
  assert.equal(Object.keys(result.views[0].filters).length, limits.filters);
  assert.equal(limits.filters, 10);
});

test("addView returns error for empty name", () => {
  const prefs = defaultPrefs(["a"]);
  const result = addView(prefs, "  ", { status: "done" });
  assert.equal(result.error, "Give the view a name.");
  assert.equal(result.prefs, prefs); // Same object
});

test("addView returns error for name too long", () => {
  const prefs = defaultPrefs(["a"]);
  const longName = "x".repeat(limits.nameLength + 1);
  const result = addView(prefs, longName, {});
  assert.equal(result.error, "Use 40 characters or fewer.");
  assert.equal(result.prefs, prefs);
});

test("addView returns error for duplicate name (case-insensitive)", () => {
  const prefs = defaultPrefs(["a"]);
  prefs.views.push({ id: "v1", name: "My View", filters: {} });

  const result = addView(prefs, "my view", {});
  assert.equal(result.error, "A view with that name already exists.");
  assert.equal(result.prefs, prefs);
});

test("addView returns error when at limits.views cap", () => {
  const prefs = defaultPrefs(["a"]);
  for (let i = 0; i < limits.views; i++) {
    prefs.views.push({ id: `v${i + 1}`, name: `view${i + 1}`, filters: {} });
  }

  const result = addView(prefs, "new view", {});
  assert.equal(result.error, "You can save up to 12 views.");
  assert.equal(result.prefs, prefs);
});

test("addView success does not mutate input and strips empty filter values", () => {
  const prefs = defaultPrefs(["a"]);
  const filters = { status: "done", priority: "", search: "test", empty: "" };
  const result = addView(prefs, "My View", filters);

  assert.equal(result.error, undefined);
  assert.notEqual(result.prefs, prefs); // New object
  assert.equal(prefs.views.length, 0); // Original unchanged
  assert.equal(result.prefs.views.length, 1);

  const addedView = result.prefs.views[0];
  assert.deepEqual(addedView.filters, { status: "done", search: "test" });
  assert.equal(addedView.name, "My View");
});

test("removeView removes view by id", () => {
  const prefs = defaultPrefs(["a"]);
  prefs.views.push(
    { id: "v1", name: "view1", filters: {} },
    { id: "v2", name: "view2", filters: {} },
    { id: "v3", name: "view3", filters: {} }
  );

  const result = removeView(prefs, "v2");
  assert.equal(result.views.length, 2);
  assert.deepEqual(
    result.views.map((v) => v.id),
    ["v1", "v3"]
  );
});

test("removeView with unknown id returns an equal copy", () => {
  const prefs = defaultPrefs(["a"]);
  prefs.views.push({ id: "v1", name: "view1", filters: {} });

  const result = removeView(prefs, "unknown");
  assert.equal(result, prefs); // Same object
});

test("setColumns validates and reorders by allColumns", () => {
  const prefs = defaultPrefs(["a", "b"]);
  const result = setColumns(
    prefs,
    ["c", "a", "unknown"],
    ["a", "b", "c"],
    ["a", "b"]
  );

  assert.deepEqual(result.columns, ["a", "c"]);
  assert.notEqual(result, prefs);
});

test("setColumns falls back to defaults if result would be empty", () => {
  const prefs = defaultPrefs(["a", "b"]);
  const result = setColumns(
    prefs,
    ["unknown1", "unknown2"],
    ["a", "b"],
    ["a", "b"]
  );

  assert.deepEqual(result.columns, ["a", "b"]);
});

test("setDensity updates density without mutating", () => {
  const prefs = defaultPrefs(["a"]);
  const result = setDensity(prefs, "compact");

  assert.equal(result.density, "compact");
  assert.equal(prefs.density, "comfortable");
  assert.notEqual(result, prefs);
});

test("viewMatches ignores empty strings and order", () => {
  const view = {
    id: "v1",
    name: "view",
    filters: { status: "done", priority: "", search: "test" },
  };

  // Exact match (order doesn't matter)
  assert.equal(
    viewMatches(view, { priority: "", status: "done", search: "test" }),
    true
  );

  // A key that is empty on one side counts as missing: same non-empty filters still match.
  assert.equal(viewMatches(view, { status: "done", search: "test" }), true);

  // Extra key
  assert.equal(
    viewMatches(view, {
      status: "done",
      search: "test",
      extra: "value",
    }),
    false
  );

  // Different value
  assert.equal(
    viewMatches(view, { status: "pending", search: "test" }),
    false
  );

  // All empty strings match only a view that has no non-empty filters.
  assert.equal(viewMatches(view, { priority: "", extra: "" }), false);
});

test("newViewId skips used ids", () => {
  const existing = [
    { id: "v1", name: "a", filters: {} },
    { id: "v2", name: "b", filters: {} },
    { id: "v3", name: "c", filters: {} },
  ];

  assert.equal(newViewId(existing), "v4");
});

test("parsePrefs parses JSON and calls sanitizePrefs", () => {
  const allColumns = ["a", "b", "c"];
  const defaultColumns = ["a", "b"];

  const json = JSON.stringify({
    columns: ["a"],
    density: "compact",
    views: [{ id: "v1", name: "view", filters: { status: "done" } }],
  });

  const result = parsePrefs(json, allColumns, defaultColumns);
  assert.deepEqual(result, {
    columns: ["a"],
    density: "compact",
    views: [{ id: "v1", name: "view", filters: { status: "done" } }],
  });
});

test("serializePrefs uses JSON.stringify", () => {
  const prefs = {
    columns: ["a", "b"],
    density: "compact",
    views: [{ id: "v1", name: "view", filters: { status: "done" } }],
  };

  const result = serializePrefs(prefs);
  assert.equal(result, JSON.stringify(prefs));
});

test("hostile payload with prototype pollution is sanitized", () => {
  const hostile = {
    columns: ["__proto__"],
    views: [
      {
        id: "x",
        name: "a",
        filters: {
          __proto__: "x",
          status: "processing",
        },
      },
    ],
  };

  const result = sanitizePrefs(hostile, ["a", "b"], ["a"]);

  // Check that prototype pollution did not occur
  assert.equal(({}).polluted, undefined);

  // __proto__ should not be in columns
  assert.deepEqual(result.columns, ["a"]); // Falls back to default

  // __proto__ should not be in filters (it's not a valid filter key)
  assert.deepEqual(result.views[0].filters, { status: "processing" });
});

test("filter keys must match /^[a-z_]{1,30}$/", () => {
  const raw = {
    columns: ["a"],
    density: "comfortable",
    views: [
      {
        id: "v1",
        name: "view",
        filters: {
          valid_key: "value",
          "invalid-key": "value",
          UPPERCASE: "value",
          "": "value",
          a: "value", // 1 char is valid
          "a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_": "value", // 30 chars OK
          "a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_": "value", // 32 chars invalid
        },
      },
    ],
  };

  const result = sanitizePrefs(raw, ["a"], ["a"]);
  const filters = result.views[0].filters;
  assert.ok(filters.valid_key);
  assert.ok(!filters["invalid-key"]);
  assert.ok(!filters.UPPERCASE);
  assert.ok(!filters[""]);
  assert.ok(filters.a);
  assert.equal(Object.keys(filters).filter((k) => k.length === 30).length, 1);
  assert.equal(
    Object.keys(filters).filter((k) => k.length === 31).length,
    0
  );
});

test("viewMatches compares non-empty filters only, in any order", () => {
  const view = { id: "v1", name: "Open", filters: { status: "processing", search: "gina" } };
  assert.equal(viewMatches(view, { search: "gina", status: "processing" }), true);
  assert.equal(viewMatches(view, { status: "processing", search: "gina", page: "" }), true);
  assert.equal(viewMatches(view, { status: "processing" }), false);
  assert.equal(viewMatches(view, { status: "failed", search: "gina" }), false);
  assert.equal(viewMatches(view, {}), false);
  // An empty filter set matches only a view that is itself empty (the "All" view), never a filtered one.
  assert.equal(viewMatches({ id: "v2", name: "All", filters: {} }, { status: "", search: "" }), true);
});

test("prototype-related filter keys are rejected everywhere", () => {
  assert.equal(validFilterKey("status"), true);
  for (const key of ["__proto__", "constructor", "prototype", "Status", "a-b", ""]) assert.equal(validFilterKey(key), false, key);
  const added = addView(defaultPrefs(["a"]), "x", JSON.parse('{"__proto__":"x","status":"failed"}'));
  assert.deepEqual(added.prefs.views[0].filters, { status: "failed" });
});
