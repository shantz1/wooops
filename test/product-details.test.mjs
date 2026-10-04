import assert from "node:assert/strict";
import { test } from "node:test";
import { validProductDetails, validStoreImageUrl } from "../src/lib/product-details.ts";
import { catalogPath, validCatalogWrite } from "../src/lib/catalog.ts";
import { validVariationOptions, overlapsVariation } from "../src/lib/variation-options.ts";

test("catalogue writes allow only bounded explicit fields", () => {
  assert.equal(validProductDetails({ name: "Soap", description: "<p>Details</p>", regular_price: "12.345", manage_stock: false, stock_quantity: null }), true);
  for (const body of [{}, { meta_data: [] }, { name: "" }, { stock_quantity: -1 }, { regular_price: "NaN" }, { attributes: [{}] }, { dimensions: { secret: "2" } }, { upsell_ids: [1, 1] }, JSON.parse('{"__proto__":"x"}')]) assert.equal(validProductDetails(body), false);
});
test("image URLs cannot escape the configured store or contain credentials", () => {
  const store = "https://shop.example";
  assert.equal(validStoreImageUrl(store + "/wp-content/uploads/photo.jpg", store), true);
  for (const url of ["http://shop.example/image.jpg", "https://evil.example/image.jpg", "https://shop.example.evil.example/image.jpg", "https://user:secret@shop.example/image.jpg", "file:///image.jpg"]) assert.equal(validStoreImageUrl(url, store), false);
  assert.equal(validProductDetails({ images: [{ id: 1, alt: "Keep existing" }, { src: store + "/new.jpg" }] }, store), true);
  assert.equal(validProductDetails({ images: [] }, store), true);
  assert.equal(validProductDetails({ images: [{ src: "https://evil.example/new.jpg" }] }, store), false);
});
test("catalogue resource selection cannot introduce arbitrary WooCommerce paths", () => {
  assert.equal(catalogPath("categories", null), "products/categories");
  assert.equal(catalogPath("terms", "2"), "products/attributes/2/terms");
  assert.equal(catalogPath("variations", "3"), "products/3/variations");
  for (const [resource, parent] of [["orders", null], ["variations", "../2"], ["terms", "0"], ["variations", "9007199254740992"]]) assert.equal(catalogPath(resource, parent), null);
});
test("catalogue writes cannot change review content or inject variation metadata", () => {
  assert.equal(validCatalogWrite("reviews", { status: "approved" }, false), true);
  assert.equal(validCatalogWrite("reviews", { status: "approved", review: "replacement" }, false), false);
  assert.equal(validCatalogWrite("variations", { regular_price: "10", manage_stock: true, stock_quantity: 2 }, false), true);
  for (const body of [{ meta_data: [] }, { stock_quantity: -2 }, { regular_price: "1e5" }, { image: { src: "http://localhost/private" } }]) assert.equal(validCatalogWrite("variations", body, false), false);
  assert.equal(validCatalogWrite("categories", { name: "New", parent: 0 }, true), true);
});
test("variation creation requires complete saved options and detects wildcard overlaps", () => {
  const attributes = [{ id: 0, name: "Size", variation: true, options: ["S", "M"] }];
  const options = [{ id: 0, name: "Size", option: "S" }];
  assert.equal(validVariationOptions(attributes, options), true);
  assert.equal(validVariationOptions(attributes, []), false);
  assert.equal(validVariationOptions(attributes, [{ id: 0, name: "Size", option: "L" }]), false);
  assert.equal(overlapsVariation(options, [{ id: 0, name: "Size", option: "" }]), true);
  assert.equal(overlapsVariation(options, [{ id: 0, name: "Size", option: "M" }]), false);
});
