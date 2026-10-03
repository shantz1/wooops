import { TOTP, Secret } from "otpauth";
import { createHash } from "node:crypto";

export const isOtpSecret = (value?: string) => Boolean(value && /^[A-Z2-7]{32,64}$/.test(value));
export function createOtpVerifier() {
  const used = new Map<string, number>();
  return (code: unknown, secret: string, now = Date.now()) => {
    if (!isOtpSecret(secret) || typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 });
    const delta = totp.validate({ token: code, timestamp: now, window: 1 });
    if (delta === null) return false;
    const counter = Math.floor(now / 30_000) + delta;
    const key = createHash("sha256").update(secret).digest("hex");
    if (counter <= (used.get(key) ?? -1)) return false;
    // Only the two deployment-configured secrets can reach this verifier.
    if (!used.has(key) && used.size >= 2) used.delete(used.keys().next().value!);
    used.set(key, counter);
    return true;
  };
}
export const verifyOtp = createOtpVerifier();
