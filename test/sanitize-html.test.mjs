import assert from "node:assert/strict";
import { test } from "node:test";
import { isSafeUrl } from "../src/lib/sanitize-html.ts";

test("isSafeUrl link URLs - allows http URLs", () => {
  assert.equal(isSafeUrl("http://example.com", "link"), true);
});

test("isSafeUrl link URLs - allows https URLs", () => {
  assert.equal(isSafeUrl("https://example.com", "link"), true);
});

test("isSafeUrl link URLs - allows mailto URLs", () => {
  assert.equal(isSafeUrl("mailto:test@example.com", "link"), true);
});

test("isSafeUrl link URLs - allows tel URLs", () => {
  assert.equal(isSafeUrl("tel:+1234567890", "link"), true);
});

test("isSafeUrl link URLs - allows absolute path", () => {
  assert.equal(isSafeUrl("/page", "link"), true);
});

test("isSafeUrl link URLs - rejects relative path without slash", () => {
  assert.equal(isSafeUrl("page", "link"), false);
});

test("isSafeUrl link URLs - allows hash fragments", () => {
  assert.equal(isSafeUrl("#section", "link"), true);
});

test("isSafeUrl link URLs - rejects javascript URLs", () => {
  assert.equal(isSafeUrl("javascript:alert('xss')", "link"), false);
});

test("isSafeUrl link URLs - rejects data URLs", () => {
  assert.equal(isSafeUrl("data:text/html,<script>alert('xss')</script>", "link"), false);
});

test("isSafeUrl link URLs - rejects vbscript URLs", () => {
  assert.equal(isSafeUrl("vbscript:msgbox('xss')", "link"), false);
});

test("isSafeUrl link URLs - rejects protocol-relative URLs", () => {
  assert.equal(isSafeUrl("//example.com", "link"), false);
});

test("isSafeUrl link URLs - rejects empty URLs", () => {
  assert.equal(isSafeUrl("", "link"), false);
});

test("isSafeUrl link URLs - rejects whitespace-only URLs", () => {
  assert.equal(isSafeUrl("   ", "link"), false);
});

test("isSafeUrl link URLs - rejects URLs with control characters", () => {
  assert.equal(isSafeUrl("http://example.com\x00", "link"), false);
});

test("isSafeUrl link URLs - rejects javascript with tab character tricks", () => {
  assert.equal(isSafeUrl("java\tscript:alert('xss')", "link"), false);
});

test("isSafeUrl image URLs - allows http URLs", () => {
  assert.equal(isSafeUrl("http://example.com/image.jpg", "image"), true);
});

test("isSafeUrl image URLs - allows https URLs", () => {
  assert.equal(isSafeUrl("https://example.com/image.jpg", "image"), true);
});

test("isSafeUrl image URLs - allows relative paths", () => {
  assert.equal(isSafeUrl("/images/photo.jpg", "image"), true);
});

test("isSafeUrl image URLs - rejects data URLs", () => {
  assert.equal(isSafeUrl("data:image/png;base64,iVBORw0K", "image"), false);
});

test("isSafeUrl image URLs - rejects mailto URLs", () => {
  assert.equal(isSafeUrl("mailto:test@example.com", "image"), false);
});

test("isSafeUrl image URLs - rejects tel URLs", () => {
  assert.equal(isSafeUrl("tel:+1234567890", "image"), false);
});

test("isSafeUrl image URLs - rejects javascript URLs", () => {
  assert.equal(isSafeUrl("javascript:alert('xss')", "image"), false);
});

test("isSafeUrl image URLs - rejects protocol-relative URLs", () => {
  assert.equal(isSafeUrl("//example.com/image.jpg", "image"), false);
});

test("isSafeUrl image URLs - rejects empty URLs", () => {
  assert.equal(isSafeUrl("", "image"), false);
});

test("isSafeUrl edge cases - handles URLs with query strings", () => {
  assert.equal(isSafeUrl("https://example.com?param=value", "link"), true);
});

test("isSafeUrl edge cases - handles URLs with fragments", () => {
  assert.equal(isSafeUrl("https://example.com#section", "link"), true);
});

test("isSafeUrl edge cases - rejects URLs with newlines", () => {
  assert.equal(isSafeUrl("http://example.com\n", "link"), false);
});

test("isSafeUrl edge cases - case-insensitive for schemes", () => {
  assert.equal(isSafeUrl("HTTPS://example.com", "link"), true);
  assert.equal(isSafeUrl("JavaScript:alert('xss')", "link"), false);
});
