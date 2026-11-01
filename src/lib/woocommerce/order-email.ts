/** Rules for resending an order's details email. Shared by the app route; the plugin mirrors them in PHP. */
export const sendRoute = "/wc/v3/orders/(?P<id>[\\d]+)/actions/send_order_details";
export const cooldownMs = 60_000;

/** WooCommerce 9.8+ advertises the guard that refuses overwriting an existing different billing email. */
export function supportsRecipientGuard(route: unknown): boolean {
  if (!route || typeof route !== "object") return false;
  const endpoints = (route as { endpoints?: unknown }).endpoints;
  return Array.isArray(endpoints) && endpoints.some(endpoint => endpoint && typeof endpoint === "object" &&
    endpoint.args && typeof endpoint.args === "object" && "email" in endpoint.args && "force_email_update" in endpoint.args);
}

/** The billing address the email would go to, or "" when the order has none that looks valid. */
export function resendRecipient(order: { billing?: { email?: string } }): string {
  const email = (order.billing?.email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : "";
}

/** Exact confirmation: even a case-only change must be reconfirmed because local parts can be case-sensitive. */
export function sameRecipient(confirmed: unknown, recipient: string): boolean {
  return typeof confirmed === "string" && recipient !== "" && confirmed.trim() === recipient;
}

/** The body must be exactly `{ confirm_email }`; anything else (an address override, for example) is refused. */
export function parseResendBody(body: unknown): { ok: true; confirmEmail: string } | { ok: false } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false };
  const keys = Object.keys(body);
  const value = (body as Record<string, unknown>).confirm_email;
  return keys.length === 1 && keys[0] === "confirm_email" && typeof value === "string" && value.length <= 254 ? { ok: true, confirmEmail: value } : { ok: false };
}

const lastRequest = new Map<string, number>();

/** Remaining cooldown in ms for this order (0 when a new request is allowed). */
export function cooldownLeft(orderId: string, now = Date.now()): number {
  const at = lastRequest.get(orderId);
  return at === undefined ? 0 : Math.max(0, at + cooldownMs - now);
}

/** Records a request before it is sent, so an unclear outcome (a timeout) is never repeated automatically. */
export function markRequested(orderId: string, now = Date.now()) {
  lastRequest.set(orderId, now);
  for (const [key, at] of lastRequest) if (now - at > cooldownMs) lastRequest.delete(key);
}

export function resetCooldownsForTests() { lastRequest.clear(); }
