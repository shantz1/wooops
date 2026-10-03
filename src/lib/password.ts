import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// Fixed costs prevent malformed configuration from requesting unbounded work.
const cost = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const pattern = /^scrypt:131072:8:1:([a-f0-9]{32}):([a-f0-9]{64})$/;
export const isPasswordHash = (value?: string) => Boolean(value && pattern.test(value));
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, cost, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  if (password.length < 12 || Buffer.byteLength(password) > 1024) throw new Error("Use a password of at least 12 characters and at most 1024 bytes.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt:131072:8:1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: unknown, hash?: string) {
  if (typeof password !== "string" || Buffer.byteLength(password) > 1024) return false;
  const match = hash?.match(pattern);
  return Boolean(match && timingSafeEqual(await derive(password, match[1]), Buffer.from(match[2], "hex")));
}
export function equalSecret(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}
