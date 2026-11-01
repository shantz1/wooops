/** Validation for order edits (status, addresses, customer note). Shared by the app route; the plugin mirrors these rules in PHP. */
export const addressFields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", "phone"] as const;
export const billingFields = [...addressFields, "email"] as const;

export type OrderUpdate = {
  status?: string;
  billing?: Record<string, string>;
  shipping?: Record<string, string>;
  customer_note?: string;
  /** 0 returns the order to guest checkout; any other id must be a registered customer (checked by the route). */
  customer_id?: number;
  /** With a customer_id: copy that customer's saved billing and shipping address onto the order. Off by default. */
  replace_addresses?: boolean;
  /** The order's `date_modified_gmt` as the editor saw it. The route refuses the edit when the order has changed since. */
  if_unmodified_since?: string;
  /** Opaque revision returned with the order; required for ownership changes. */
  if_match?: string;
};
export type OrderUpdateResult = { ok: true; update: OrderUpdate } | { ok: false; error: string };

const maxLength = 200;
const maxNote = 1000;

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanAddress(value: unknown, allowed: readonly string[], label: string): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  if (!plainObject(value)) return { ok: false, error: `${label} must be an object.` };
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.includes(key)) return { ok: false, error: `${label} has an unsupported field.` };
    if (typeof raw !== "string") return { ok: false, error: `${label} fields must be text.` };
    const text = raw.trim();
    if (text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return { ok: false, error: `${label} has an invalid value.` };
    if (key === "country" && text !== "" && !/^[A-Za-z]{2}$/.test(text)) return { ok: false, error: `${label} country must be a two-letter code.` };
    if (key === "email" && text !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, error: "Enter a valid billing email address." };
    out[key] = key === "country" ? text.toUpperCase() : text;
  }
  return Object.keys(out).length ? { ok: true, value: out } : { ok: false, error: `${label} has nothing to change.` };
}

/** `isSettableStatus` is injected because the allowed statuses come from the store. */
export async function parseOrderUpdate(body: unknown, isSettableStatus: (status: unknown) => Promise<boolean> | boolean): Promise<OrderUpdateResult> {
  if (!plainObject(body)) return { ok: false, error: "Invalid request." };
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some(key => !["status", "billing", "shipping", "customer_note", "customer_id", "replace_addresses", "if_unmodified_since", "if_match"].includes(key))) return { ok: false, error: "Nothing valid to update." };
  const update: OrderUpdate = {};
  if ("status" in body) {
    if (!(await isSettableStatus(body.status))) return { ok: false, error: "Invalid order ID or status." };
    update.status = body.status as string;
  }
  for (const [name, allowed, label] of [["billing", billingFields, "Billing address"], ["shipping", addressFields, "Shipping address"]] as const) {
    if (name in body) {
      const result = cleanAddress(body[name], allowed, label);
      if (!result.ok) return result;
      update[name] = result.value;
    }
  }
  if ("customer_note" in body) {
    if (typeof body.customer_note !== "string" || body.customer_note.length > maxNote) return { ok: false, error: "The customer note is too long." };
    update.customer_note = body.customer_note.trim();
  }
  if ("customer_id" in body) {
    if (!Number.isSafeInteger(body.customer_id) || (body.customer_id as number) < 0) return { ok: false, error: "Choose a valid customer." };
    update.customer_id = body.customer_id as number;
  }
  if ("replace_addresses" in body) {
    if (body.replace_addresses !== true || !update.customer_id) return { ok: false, error: "Addresses can only be replaced when assigning a registered customer." };
    update.replace_addresses = true;
  }
  if ("if_unmodified_since" in body) {
    if (typeof body.if_unmodified_since !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(body.if_unmodified_since)) return { ok: false, error: "Invalid request." };
    update.if_unmodified_since = body.if_unmodified_since;
  }
  // The token only guards other changes; on its own there is nothing to update.
  if ("if_match" in body) {
    if (typeof body.if_match !== "string" || !/^[a-f0-9]{64}$/.test(body.if_match)) return { ok: false, error: "Invalid order revision. Reload the order." };
    update.if_match = body.if_match;
  }
  if (update.customer_id !== undefined && !update.if_match) return { ok: false, error: "Reload the order before changing its customer." };
  if (Object.keys(update).every(key => ["if_unmodified_since", "if_match"].includes(key))) return { ok: false, error: "Nothing valid to update." };
  return { ok: true, update };
}

/** The whitelisted, trimmed address fields of a saved customer address (anything else is ignored). */
export function savedAddress(value: unknown, allowed: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== "object" || value === null) return out;
  for (const key of allowed) {
    const raw = (value as Record<string, unknown>)[key];
    out[key] = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
  }
  return out;
}

/** True when the order was changed after the editor loaded it (WooCommerce stamps `date_modified_gmt` on every save). */
export function isStale(token: string | undefined, currentModifiedGmt: string | undefined): boolean {
  return token !== undefined && token !== currentModifiedGmt;
}
