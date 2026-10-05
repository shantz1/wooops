/** Validation for order edits (status, addresses, customer note). Shared by the app route; the plugin mirrors these rules in PHP. */
export const addressFields = ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", "phone"] as const;
export const billingFields = [...addressFields, "email"] as const;

export type OrderUpdate = {
  status?: string;
  billing?: Record<string, string>;
  shipping?: Record<string, string>;
  customer_note?: string;
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
  if (keys.length === 0 || keys.some(key => !["status", "billing", "shipping", "customer_note"].includes(key))) return { ok: false, error: "Nothing valid to update." };
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
  return { ok: true, update };
}
