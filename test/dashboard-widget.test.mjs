import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../wordpress/kartodesk-for-woocommerce/dashboard-widget.js", import.meta.url), "utf8");
function fixture(readyState = "complete") {
  const nodes = {};
  function node(id, parent) {
    const value = nodes[id] = { id, parentNode: null, children: [],
      appendChild(child) { if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1); this.children.push(child); child.parentNode = this; },
      insertBefore(child, reference) { if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1); this.children.splice(this.children.indexOf(reference), 0, child); child.parentNode = this; },
    };
    parent?.appendChild(value);
    return value;
  }
  const root = node("root");
  node("notices", root);
  const dashboard = node("dashboard-widgets", root);
  const normal = node("normal-sortables", dashboard);
  node("wordpress-widget", normal);
  node("kartodesk_overview", normal); // Saved 0.1.8 layout: our widget is in a narrow column.
  node("another-plugin-widget", normal);
  const row = node("kartodesk-dashboard-wide", root);
  node("kartodesk-sortables", row);
  let listener;
  const document = { readyState, getElementById: id => nodes[id], addEventListener(event, callback, options) { listener = { event, callback, options }; } };
  return { nodes, document, listener: () => listener };
}

test("full-width placement moves only our widget and retains a native sortable context", () => {
  const { nodes, document } = fixture();
  let controlsRefreshed = 0;
  runInNewContext(script, { document, window: { postboxes: { page: "dashboard", updateOrderButtonsProperties() { controlsRefreshed++; } } } });
  assert.equal(controlsRefreshed, 1, "native move controls refresh when WordPress initialized before our script");
  assert.deepEqual(nodes.root.children.map(node => node.id), ["notices", "kartodesk-dashboard-wide", "dashboard-widgets"]);
  assert.deepEqual(nodes["normal-sortables"].children.map(node => node.id), ["wordpress-widget", "another-plugin-widget"]);
  assert.equal(nodes.kartodesk_overview.parentNode.id, "kartodesk-sortables");
  runInNewContext(script, { document });
  assert.equal(nodes["kartodesk-sortables"].children.length, 1, "initialization never clones a native widget or its controls");
});

test("placement waits for footer markup when the document is still loading", () => {
  const setup = fixture("loading");
  runInNewContext(script, { document: setup.document });
  assert.equal(setup.nodes.kartodesk_overview.parentNode.id, "normal-sortables");
  assert.equal(setup.listener().event, "DOMContentLoaded");
  assert.equal(setup.listener().options.once, true);
  setup.listener().callback();
  assert.equal(setup.nodes.kartodesk_overview.parentNode.id, "kartodesk-sortables");
});

test("a disabled or unavailable widget leaves the dashboard layout untouched", () => {
  const { nodes, document } = fixture();
  delete nodes.kartodesk_overview;
  runInNewContext(script, { document });
  assert.deepEqual(nodes.root.children.map(node => node.id), ["notices", "dashboard-widgets", "kartodesk-dashboard-wide"]);
});
