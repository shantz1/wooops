import { storeDate, storeDateBounds } from "./timezone.ts";

export const dashboardCards = [
  { id: "recent_orders", label: "Recent orders", hint: "Latest orders loaded (max 5)" },
  { id: "recent_pending", label: "Processing or on hold", hint: "Among the latest 5 orders" },
  { id: "recent_value", label: "Recent order value", hint: "Sum of the latest 5 totals, any status" },
  { id: "recent_customers", label: "Registered customers", hint: "Unique registered customers in the latest 5 orders" },
  { id: "orders_today", label: "Orders today", hint: "All statuses · store timezone" },
  { id: "orders_week", label: "Orders this week", hint: "Since Monday · all statuses · store timezone" },
] as const;
export type DashboardPreferences = { cards: string[]; widget_enabled: boolean };
export const defaultDashboard: DashboardPreferences = { cards: dashboardCards.slice(0, 4).map(card => card.id), widget_enabled: false };

export function isDashboardCard(id: unknown): id is string {
  return typeof id === "string" && (dashboardCards.some(card => card.id === id) || /^status:[a-z0-9_-]{1,40}$/.test(id) && !["trash", "draft", "auto-draft", "checkout-draft"].includes(id.slice(7)));
}

/** Validate without silently dropping or reordering a user's selection. */
export function validDashboardPreferences(value: unknown): value is DashboardPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as DashboardPreferences;
  return Array.isArray(candidate.cards) && candidate.cards.length >= 1 && candidate.cards.length <= 4 &&
    candidate.cards.every(isDashboardCard) && new Set(candidate.cards).size === candidate.cards.length && typeof candidate.widget_enabled === "boolean";
}

export function isCountCard(id: string) { return id === "orders_today" || id === "orders_week" || id.startsWith("status:"); }

/** Calendar weeks start Monday in both runtimes, independent of the server timezone. */
export function dashboardCountQuery(id: string, timezone: string, now = new Date()) {
  if (!isDashboardCard(id) || !isCountCard(id)) throw new Error("Invalid dashboard count card.");
  const query = new URLSearchParams({ per_page: "1", _fields: "id", status: "any" });
  if (id.startsWith("status:")) query.set("status", id.slice(7));
  else {
    const today = storeDate(now, timezone);
    const start = new Date(`${today}T00:00:00Z`);
    if (id === "orders_week") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const bounds = storeDateBounds(start.toISOString().slice(0, 10), today, timezone);
    query.set("after", bounds.after);
    query.set("before", bounds.before);
    query.set("dates_are_gmt", "true");
  }
  return query;
}
