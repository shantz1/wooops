import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, isPasswordHash, verifyPassword } from "../src/lib/password.ts";
import { createLoginLimiter } from "../src/lib/login-limit.ts";
import { limitedText, readRequestJson } from "../src/lib/request-body.ts";
import { createSessionToken, sessionRole, authConfigurationError } from "../src/lib/auth.ts";
import { createOtpVerifier } from "../src/lib/otp.ts";
import { TOTP } from "otpauth";

test("password hashes are salted and reject wrong, malformed and oversized inputs", async () => {
  const hash = await hashPassword("test-only-long-password");
  assert.ok(isPasswordHash(hash));
  assert.equal(await verifyPassword("test-only-long-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  assert.equal(await verifyPassword(null, hash), false);
  assert.equal(await verifyPassword("a".repeat(1025), hash), false);
  assert.equal(await verifyPassword("test-only-long-password", "scrypt:99999999:8:1:bad"), false);
  assert.notEqual(await hashPassword("test-only-long-password"), hash);
  await assert.rejects(hashPassword("short"));
});

test("login limiter bounds total attempts and expensive concurrent checks", () => {
  const limiter = createLoginLimiter(2, 1000);
  assert.equal(limiter.acquire(1000).allowed, true);
  assert.equal(limiter.acquire(1000).allowed, false);
  limiter.release();
  assert.equal(limiter.acquire(1100).allowed, true);
  limiter.release();
  assert.deepEqual(limiter.acquire(1200), { allowed: false, retryAfter: 1 });
  assert.equal(limiter.acquire(2000).allowed, true);
});

test("session roles cannot be changed and credential rotation revokes signed sessions", () => {
  const names = ["NODE_ENV", "WOOOPS_ADMIN_PASSWORD_HASH", "WOOOPS_ADMIN_PASSWORD", "WOOOPS_READONLY_PASSWORD_HASH",
    "WOOOPS_SESSION_SECRET", "WOOOPS_PUBLIC_URL", "WOOOPS_ADMIN_TOTP_SECRET", "WOOOPS_READONLY_TOTP_SECRET"];
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = "production";
    process.env.WOOOPS_ADMIN_PASSWORD_HASH = "scrypt:131072:8:1:" + "a".repeat(32) + ":" + "b".repeat(64);
    process.env.WOOOPS_SESSION_SECRET = "test-only-secret-".repeat(4);
    process.env.WOOOPS_PUBLIC_URL = "https://panel.example";
    for (const name of ["WOOOPS_ADMIN_PASSWORD", "WOOOPS_READONLY_PASSWORD_HASH", "WOOOPS_ADMIN_TOTP_SECRET", "WOOOPS_READONLY_TOTP_SECRET"]) delete process.env[name];
    assert.equal(authConfigurationError(), null);
    const token = createSessionToken("readonly");
    assert.equal(sessionRole(token), "readonly");
    assert.equal(sessionRole(token.replace("readonly", "admin")), null);
    assert.equal(sessionRole(token + "x"), null);
    assert.notEqual(token, createSessionToken("readonly"));
    process.env.WOOOPS_SESSION_SECRET += "rotation";
    assert.equal(sessionRole(token), null);
    process.env.WOOOPS_ADMIN_PASSWORD_HASH = "";
    assert.match(authConfigurationError(), /PASSWORD_HASH/);
    process.env.WOOOPS_ADMIN_PASSWORD_HASH = "malformed";
    assert.match(authConfigurationError(), /PASSWORD_HASH/);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("authenticator verification rejects wrong codes, stale codes and replay", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const totp = new TOTP({ secret, digits: 6, period: 30 });
  const verify = createOtpVerifier();
  const now = 1700000000000;
  const token = totp.generate({ timestamp: now });
  assert.equal(verify("bad", secret, now), false);
  assert.equal(verify(token, secret, now), true);
  assert.equal(verify(token, secret, now), false);
  assert.equal(verify(totp.generate({ timestamp: now - 90_000 }), secret, now), false);
  assert.equal(verify(totp.generate({ timestamp: now + 30_000 }), secret, now + 30_000), true);
});

test("JSON body bounds apply to declared and streamed bytes", async () => {
  assert.deepEqual(await readRequestJson(new Request("http://localhost", { method: "POST", body: '{"note":"ok"}' })), { note: "ok" });
  await assert.rejects(limitedText(new Request("http://localhost", { method: "POST", body: "abc", headers: { "Content-Length": "100" } }), 10));
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode("12345"));
    controller.enqueue(new TextEncoder().encode("67890"));
    controller.close();
  } });
  await assert.rejects(limitedText(new Request("http://localhost", { method: "POST", body: stream, duplex: "half" }), 8));
  await assert.rejects(readRequestJson(new Request("http://localhost", { method: "POST", body: "{" })));
});


test("slow request bodies release the login slot instead of waiting indefinitely", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request("http://localhost", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(limitedText(request, 1024, 20), /timed out/);
  assert.equal(cancelled, true);
});
