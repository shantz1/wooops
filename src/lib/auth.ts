import crypto from "node:crypto";

export const cookieName = "wooops_session";
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;

export function authEnabled() {
  return Boolean(process.env.WOOOPS_ADMIN_PASSWORD);
}

export function createSessionToken() {
  const secret = process.env.WOOOPS_SESSION_SECRET;
  if (!secret) throw new Error("Session secret is not configured.");
  const issued = Date.now().toString();
  const signature = crypto.createHmac("sha256", secret).update(issued).digest("hex");
  return `${issued}.${signature}`;
}

export function verifySessionToken(token?: string | null) {
  const secret = process.env.WOOOPS_SESSION_SECRET;
  if (!token || !authEnabled() || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d{13}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  const age = Date.now() - Number(parts[0]);
  if (age < 0 || age > sessionLifetime) return false;
  const expected = crypto.createHmac("sha256", secret).update(parts[0]).digest();
  return crypto.timingSafeEqual(Buffer.from(parts[1], "hex"), expected);
}
