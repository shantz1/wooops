import crypto from "node:crypto";
import { equalSecret, isPasswordHash, verifyPassword } from "./password.ts";
import { isOtpSecret } from "./otp.ts";
import { identityFor, openIdentity, readAccess, type Identity } from "./access.ts";

/** A built-in role. Roles from the access file are plain strings. */
export type AccessRole = "admin" | "readonly";
export const cookieName = "wooops_session";
export const sessionSeconds = 12 * 60 * 60;
export function authEnabled() {
  return Boolean(process.env.WOOOPS_ADMIN_PASSWORD_HASH || process.env.WOOOPS_ADMIN_PASSWORD || process.env.WOOOPS_READONLY_PASSWORD_HASH ||
    readAccess().config.logins.length);
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
  const access = readAccess();
  if (access.error) return access.error;
  return null;
}
function signingKey() {
  // Changing credentials revokes existing sessions.
  return crypto.createHmac("sha256", process.env.WOOOPS_SESSION_SECRET || "")
    .update(JSON.stringify([process.env.WOOOPS_ADMIN_PASSWORD_HASH, process.env.WOOOPS_ADMIN_PASSWORD,
      process.env.WOOOPS_READONLY_PASSWORD_HASH, process.env.WOOOPS_PUBLIC_URL,
      process.env.WOOOPS_ADMIN_TOTP_SECRET, process.env.WOOOPS_READONLY_TOTP_SECRET, readAccess().fingerprint])).digest();
}
const loginIdPattern = "admin|readonly|u-[a-z0-9_-]{2,40}";
const tokenPattern = new RegExp(String.raw`^(v3\.(${loginIdPattern})\.(\d{13})\.[a-f0-9]{32})\.([a-f0-9]{64})$`);

/** Signs a session for a login ID ("admin", "readonly" or "u-<username>" from the access file). */
export function createSessionToken(loginId: string = "admin") {
  if (authConfigurationError() || !authEnabled()) throw new Error("Authentication is not configured.");
  if (!new RegExp(`^(${loginIdPattern})$`).test(loginId)) throw new Error("Unknown login.");
  const payload = `v3.${loginId}.${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
  return `${payload}.${crypto.createHmac("sha256", signingKey()).update(payload).digest("hex")}`;
}

/** The signed-in login, its role and permissions, or null. A login removed from the access file is signed out. */
export function sessionIdentity(token?: string | null): Identity | null {
  if (!authEnabled()) return authConfigurationError() ? null : openIdentity;
  if (!token || authConfigurationError()) return null;
  const match = tokenPattern.exec(token);
  if (!match) return null;
  const age = Date.now() - Number(match[3]);
  if (age < 0 || age > sessionSeconds * 1000) return null;
  const expected = crypto.createHmac("sha256", signingKey()).update(match[1]).digest();
  if (!crypto.timingSafeEqual(Buffer.from(match[4], "hex"), expected)) return null;
  return identityFor(match[2]);
}

/** The signed-in role slug (built-in or from the access file), or null. */
export function sessionRole(token?: string | null): string | null {
  if (!token || !authEnabled()) return null;
  return sessionIdentity(token)?.role ?? null;
}
export const verifySessionToken = (token?: string | null) => sessionRole(token) !== null;

/** The authenticator secret that protects a login, if two-factor sign-in is enabled for it. */
export function totpSecretFor(loginId: string) {
  if (loginId === "admin") return process.env.WOOOPS_ADMIN_TOTP_SECRET;
  if (loginId === "readonly") return process.env.WOOOPS_READONLY_TOTP_SECRET;
  return readAccess().config.logins.find(login => login.id === loginId)?.totpSecret;
}

/** A dummy hash so unknown usernames cost the same as real ones and are not revealed by timing. */
const decoyHash = `scrypt:131072:8:1:${"0".repeat(32)}:${"0".repeat(64)}`;

/** A named login from the access file; returns its login ID or null. */
export async function authenticateLogin(username: unknown, password: unknown): Promise<string | null> {
  const name = typeof username === "string" ? username.trim().toLowerCase() : "";
  const access = readAccess();
  const login = access.config.logins.find(item => item.username === name);
  const valid = await verifyPassword(password, login?.passwordHash ?? decoyHash);
  // Password verification is asynchronous: reject if credentials or grants changed while it ran.
  return login && valid && !access.error && readAccess().fingerprint === access.fingerprint ? login.id : null;
}
export async function authenticatePassword(password: unknown): Promise<AccessRole | null> {
  if (await verifyPassword(password, process.env.WOOOPS_ADMIN_PASSWORD_HASH)) return "admin";
  if (typeof password === "string" && !process.env.WOOOPS_ADMIN_PASSWORD_HASH && process.env.NODE_ENV !== "production" &&
      process.env.WOOOPS_ADMIN_PASSWORD && equalSecret(password, process.env.WOOOPS_ADMIN_PASSWORD)) return "admin";
  if (await verifyPassword(password, process.env.WOOOPS_READONLY_PASSWORD_HASH)) return "readonly";
  return null;
}
