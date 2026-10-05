import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isOtpSecret } from "./otp.ts";
import { isPasswordHash } from "./password.ts";
import { allPermissions, isPermission, viewPermissions, type Permission } from "./permissions.ts";

/**
 * Standalone access control without a database. Two built-in logins come from environment variables
 * (administrator and read-only). Further roles and named logins come from an optional JSON file named by
 * WOOOPS_ACCESS_FILE, for example:
 *
 * {
 *   "roles": { "packer": { "label": "Packer", "permissions": ["orders.view", "orders.shipments"] } },
 *   "logins": [{ "username": "ravi", "name": "Ravi", "role": "packer", "password_hash": "scrypt:…", "totp_secret": "…" }]
 * }
 *
 * The file is re-read when it changes; editing it signs everyone out (see auth.ts signingKey).
 */
export interface AccessRole { slug: string; label: string; permissions: Permission[]; builtIn: boolean }
export interface AccessLogin { id: string; username: string; name: string; role: string; passwordHash?: string; totpSecret?: string }
export interface AccessConfig { roles: AccessRole[]; logins: AccessLogin[] }
export interface Identity { login: string; name: string; role: string; roleLabel: string; permissions: Permission[] }

export const builtInRoles: AccessRole[] = [
  { slug: "admin", label: "Administrator", permissions: [...allPermissions], builtIn: true },
  { slug: "readonly", label: "Read-only", permissions: [...viewPermissions], builtIn: true },
];

const roleSlug = /^[a-z][a-z0-9_-]{1,31}$/;
const usernamePattern = /^[a-z0-9_-]{2,40}$/;
let cache: { key: string; config: AccessConfig; error: string | null; fingerprint: string } | null = null;

/** Validates an access file's parsed JSON. Returns a configuration or a human-readable error. */
export function parseAccessConfig(value: unknown): { config: AccessConfig; error: null } | { config: null; error: string } {
  const fail = (error: string) => ({ config: null, error: `Access file: ${error}` } as const);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("expected a JSON object with \"roles\" and \"logins\".");
  const raw = value as { roles?: unknown; logins?: unknown };
  const roles: AccessRole[] = [...builtInRoles];
  if (raw.roles !== undefined) {
    if (!raw.roles || typeof raw.roles !== "object" || Array.isArray(raw.roles)) return fail("\"roles\" must be an object.");
    for (const [slug, definition] of Object.entries(raw.roles as Record<string, unknown>)) {
      if (!roleSlug.test(slug)) return fail(`role "${slug}" must be 2-32 lowercase letters, numbers, - or _.`);
      if (builtInRoles.some(role => role.slug === slug)) return fail(`role "${slug}" is built in and cannot be redefined.`);
      const item = definition as { label?: unknown; permissions?: unknown };
      if (!item || typeof item !== "object" || !Array.isArray(item.permissions) || !item.permissions.every(isPermission)) {
        return fail(`role "${slug}" needs a "permissions" list using only known permissions.`);
      }
      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 60) : slug;
      roles.push({ slug, label, permissions: [...new Set(item.permissions as Permission[])], builtIn: false });
    }
  }
  const logins: AccessLogin[] = [];
  if (raw.logins !== undefined) {
    if (!Array.isArray(raw.logins) || raw.logins.length > 200) return fail("\"logins\" must be a list of at most 200 logins.");
    for (const entry of raw.logins as unknown[]) {
      const item = entry as { username?: unknown; name?: unknown; role?: unknown; password_hash?: unknown; totp_secret?: unknown };
      const username = typeof item?.username === "string" ? item.username.trim().toLowerCase() : "";
      if (!usernamePattern.test(username)) return fail("each login needs a \"username\" of 2-40 lowercase letters, numbers, - or _.");
      if (logins.some(login => login.username === username)) return fail(`username "${username}" is used twice.`);
      if (typeof item.role !== "string" || !roles.some(role => role.slug === item.role)) return fail(`login "${username}" uses an unknown role.`);
      if (typeof item.password_hash !== "string" || !isPasswordHash(item.password_hash)) {
        return fail(`login "${username}" needs a "password_hash" from npm run setup:password.`);
      }
      if (item.totp_secret !== undefined && (typeof item.totp_secret !== "string" || !isOtpSecret(item.totp_secret))) {
        return fail(`login "${username}" has an invalid "totp_secret" (uppercase Base32).`);
      }
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 80) : username;
      logins.push({ id: `u-${username}`, username, name, role: item.role, passwordHash: item.password_hash,
        totpSecret: typeof item.totp_secret === "string" ? item.totp_secret : undefined });
    }
  }
  return { config: { roles, logins }, error: null };
}

/** The current access configuration. Without WOOOPS_ACCESS_FILE, only the built-in roles exist. */
export function readAccess(): { config: AccessConfig; error: string | null; fingerprint: string } {
  const file = process.env.WOOOPS_ACCESS_FILE;
  if (!file) return { config: { roles: [...builtInRoles], logins: [] }, error: null, fingerprint: "" };
  let key: string;
  try {
    const stat = statSync(file);
    key = `${file}:${stat.mtimeMs}:${stat.size}`;
  } catch {
    return { config: { roles: [...builtInRoles], logins: [] }, error: "Access file: WOOOPS_ACCESS_FILE cannot be read.", fingerprint: "missing" };
  }
  if (cache?.key === key) return cache;
  let text = "";
  let parsed: unknown;
  try {
    text = readFileSync(file, "utf8");
    parsed = JSON.parse(text);
  } catch {
    cache = { key, config: { roles: [...builtInRoles], logins: [] }, error: "Access file: the file is not valid JSON.", fingerprint: "invalid" };
    return cache;
  }
  const result = parseAccessConfig(parsed);
  cache = {
    key,
    config: result.config ?? { roles: [...builtInRoles], logins: [] },
    error: result.error,
    fingerprint: createHash("sha256").update(text).digest("hex"),
  };
  return cache;
}

/** Built-in logins use their role as their login ID; file logins use "u-<username>". */
export function identityFor(loginId: string, config: AccessConfig = readAccess().config): Identity | null {
  const login = config.logins.find(item => item.id === loginId);
  const roleSlug = login ? login.role : loginId;
  if (!login && !builtInRoles.some(role => role.slug === loginId)) return null;
  const role = config.roles.find(item => item.slug === roleSlug);
  if (!role) return null;
  return {
    login: loginId,
    name: login?.name ?? role.label,
    role: role.slug,
    roleLabel: role.label,
    permissions: [...role.permissions],
  };
}

/** Full access when sign-in is not configured at all (local development only). */
export const openIdentity: Identity = { login: "admin", name: "Administrator", role: "admin", roleLabel: "Administrator", permissions: [...allPermissions] };
