// Per-process protection; a public reverse proxy must also limit requests per client.
export function createLoginLimiter(limit = 20, windowMs = 5 * 60_000) {
  let started = 0;
  let attempts = 0;
  let busy = false;
  return {
    acquire(now = Date.now()) {
      if (now - started >= windowMs) { started = now; attempts = 0; }
      if (busy || attempts >= limit) return { allowed: false, retryAfter: busy ? 2 : Math.max(1, Math.ceil((started + windowMs - now) / 1000)) };
      attempts++;
      busy = true;
      return { allowed: true, retryAfter: 0 };
    },
    release() { busy = false; },
  };
}
export const loginLimiter = createLoginLimiter();
