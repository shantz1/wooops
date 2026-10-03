import crypto from "node:crypto";
import { equalSecret, isPasswordHash, verifyPassword } from "./password.ts";
import { isOtpSecret } from "./otp.ts";

export type AccessRole = "admin" | "readonly";
export const cookieName = "wooops_session";
export const sessionSeconds = 12 * 60 * 60;
export function authEnabled() {
  return Boolean(process.env.WOOOPS_ADMIN_PASSWORD_HASH || process.env.WOOOPS_ADMIN_PASSWORD || process.env.WOOOPS_READONLY_PASSWORD_HASH);
}
export function publicOrigin() {
  try {
    const url = new URL(process.env.WOOOPS_PUBLIC_URL || "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
export function authConfigurationError() {
  const production = process.env.NODE_ENV === "production";
  if (production && !isPasswordHash(process.env.WOOOPS_ADMIN_PASSWORD_HASH)) return "Configure WOOOPS_ADMIN_PASSWORD_HASH before serving this panel.";
  if (process.env.WOOOPS_ADMIN_PASSWORD_HASH && !isPasswordHash(process.env.WOOOPS_ADMIN_PASSWORD_HASH)) return "The administrator password hash is invalid.";
  if (process.env.WOOOPS_READONLY_PASSWORD_HASH && !isPasswordHash(process.env.WOOOPS_READONLY_PASSWORD_HASH)) return "The read-only password hash is invalid.";
  if (authEnabled() && (process.env.WOOOPS_SESSION_SECRET || "").length < 32) return "Configure a session secret of at least 32 characters.";
  if (production && !publicOrigin()) return "Configure WOOOPS_PUBLIC_URL with the panel's HTTPS origin.";
  for (const secret of [process.env.WOOOPS_ADMIN_TOTP_SECRET, process.env.WOOOPS_READONLY_TOTP_SECRET]) {
    if (secret && !isOtpSecret(secret)) return "An authenticator secret is invalid. Use an uppercase Base32 secret.";
  }
  if (process.env.WOOOPS_ADMIN_TOTP_SECRET && process.env.WOOOPS_READONLY_PASSWORD_HASH && !process.env.WOOOPS_READONLY_TOTP_SECRET) {
    return "Configure a separate authenticator secret for the read-only login.";
  }
  return null;
}
function signingKey() {
  // Changing credentials revokes existing sessions.
  return crypto.createHmac("sha256", process.env.WOOOPS_SESSION_SECRET || "")
    .update(JSON.stringify([process.env.WOOOPS_ADMIN_PASSWORD_HASH, process.env.WOOOPS_ADMIN_PASSWORD,
      process.env.WOOOPS_READONLY_PASSWORD_HASH, process.env.WOOOPS_PUBLIC_URL,
      process.env.WOOOPS_ADMIN_TOTP_SECRET, process.env.WOOOPS_READONLY_TOTP_SECRET])).digest();
}
export function createSessionToken(role: AccessRole = "admin") {
  if (authConfigurationError() || !authEnabled()) throw new Error("Authentication is not configured.");
  const payload = `v2.${role}.${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${crypto.createHmac("sha256", signingKey()).update(payload).digest("hex")}`;
}
export function sessionRole(token?: string | null): AccessRole | null {
  if (!token || !authEnabled() || authConfigurationError()) return null;
  const match = /^(v2\.(admin|readonly)\.(\d{13})\.[a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const age = Date.now() - Number(match[3]);
  if (age < 0 || age > sessionSeconds * 1000) return null;
  const expected = crypto.createHmac("sha256", signingKey()).update(match[1]).digest();
  return crypto.timingSafeEqual(Buffer.from(match[4], "hex"), expected) ? match[2] as AccessRole : null;
}
export const verifySessionToken = (token?: string | null) => sessionRole(token) !== null;
export async function authenticatePassword(password: unknown): Promise<AccessRole | null> {
  if (await verifyPassword(password, process.env.WOOOPS_ADMIN_PASSWORD_HASH)) return "admin";
  if (typeof password === "string" && !process.env.WOOOPS_ADMIN_PASSWORD_HASH && process.env.NODE_ENV !== "production" &&
      process.env.WOOOPS_ADMIN_PASSWORD && equalSecret(password, process.env.WOOOPS_ADMIN_PASSWORD)) return "admin";
  if (await verifyPassword(password, process.env.WOOOPS_READONLY_PASSWORD_HASH)) return "readonly";
  return null;
}
