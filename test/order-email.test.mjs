// Run with `npm test` (Node.js 22.18+ loads the TypeScript sources directly).
import assert from "node:assert/strict";
import { test } from "node:test";
import { cooldownLeft, cooldownMs, markRequested, parseResendBody, resendRecipient, resetCooldownsForTests, sameRecipient, supportsRecipientGuard } from "../src/lib/woocommerce/order-email.ts";

test("recipient is the billing email only when it looks valid", () => {
  assert.equal(resendRecipient({ billing: { email: " a@b.co " } }), "a@b.co");
  for (const email of ["", "nope", "a@b", "a b@c.de", undefined]) assert.equal(resendRecipient({ billing: { email } }), "", String(email));
  assert.equal(resendRecipient({}), "");
});

test("remote resend requires the store's existing-recipient guard", () => {
  assert.equal(supportsRecipientGuard({ endpoints: [{ args: { email: {}, force_email_update: {} } }] }), true);
  for (const value of [null, {}, { endpoints: [{ args: { email: {} } }] }]) assert.equal(supportsRecipientGuard(value), false);
});

test("the confirmed address must still match exactly, ignoring only surrounding spaces", () => {
  assert.equal(sameRecipient(" a@b.co ", "a@b.co"), true);
  assert.equal(sameRecipient("A@b.co", "a@b.co"), false);
  assert.equal(sameRecipient("other@b.co", "a@b.co"), false);
  assert.equal(sameRecipient("a@b.co", ""), false);
  assert.equal(sameRecipient(5, "a@b.co"), false);
});

test("the body must be exactly { confirm_email }; overrides are refused", () => {
  assert.deepEqual(parseResendBody({ confirm_email: "a@b.co" }), { ok: true, confirmEmail: "a@b.co" });
  for (const body of [null, [], "x", {}, { email: "a@b.co" }, { confirm_email: "a@b.co", email: "x@y.zz" }, { confirm_email: "a@b.co", force_email_update: true }, { confirm_email: 5 }, { confirm_email: "x".repeat(255) }]) {
    assert.equal(parseResendBody(body).ok, false, JSON.stringify(body));
  }
});

test("a second request within the cooldown is blocked, then allowed again", () => {
  resetCooldownsForTests();
  assert.equal(cooldownLeft("9", 1000), 0);
  markRequested("9", 1000);
  assert.equal(cooldownLeft("9", 1000 + 10_000), cooldownMs - 10_000);
  assert.equal(cooldownLeft("9", 1000 + cooldownMs), 0);
  assert.equal(cooldownLeft("10", 1000 + 10_000), 0, "other orders are unaffected");
});
