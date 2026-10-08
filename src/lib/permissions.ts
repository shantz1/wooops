/**
 * The permissions shared by the standalone app and the WordPress plugin. The plugin stores each one as a
 * WordPress capability (`capability`); the standalone app grants them to roles in its access file.
 * Keep this list in sync with KartoDesk_Access::PERMISSIONS in the plugin.
 */
export const permissionList = [
  { key: "orders.view", capability: "kartodesk_view_orders", group: "Orders", label: "View orders",
    description: "Overview, order list and details, notes, tracking and packing slips." },
  { key: "orders.status", capability: "kartodesk_change_order_status", group: "Orders", label: "Change order status",
    description: "Single and bulk status changes. The store may email customers about status changes." },
  { key: "orders.notes", capability: "kartodesk_add_order_notes", group: "Orders", label: "Add private notes",
    description: "Staff-only order notes." },
  { key: "orders.notify", capability: "kartodesk_notify_customers", group: "Orders", label: "Notify customers",
    description: "Customer-facing notes and tracking messages, which the store may email." },
  { key: "orders.shipments", capability: "kartodesk_manage_shipments", group: "Orders", label: "Manage shipment tracking",
    description: "Add and remove courier tracking on orders." },
  { key: "products.view", capability: "kartodesk_view_products", group: "Catalogue", label: "View products and inventory",
    description: "Products, categories, attributes, variations, reviews and stock levels." },
  { key: "products.edit", capability: "kartodesk_edit_products", group: "Catalogue", label: "Create and edit products",
    description: "Product details, prices, categories, attributes, variations and review moderation." },
  { key: "inventory.edit", capability: "kartodesk_edit_stock", group: "Catalogue", label: "Change stock",
    description: "Stock quantities, stock status, backorders and enabling stock management." },
  { key: "customers.view", capability: "kartodesk_view_customers", group: "Customers", label: "View customers",
    description: "Registered customer list and contact details." },
  { key: "reports.view", capability: "kartodesk_view_reports", group: "Insights", label: "View and export reports",
    description: "Order and inventory reports and CSV exports." },
  { key: "settings.view", capability: "kartodesk_manage_settings", group: "System", label: "Open settings",
    description: "Connection status, store details and panel preferences." },
  { key: "orders.refund", capability: "kartodesk_refund_orders", group: "Orders", label: "Issue refunds",
    description: "Record refunds on orders." },
  { key: "discounts.manage", capability: "kartodesk_manage_discounts", group: "Catalogue", label: "Manage discounts",
    description: "View, create, edit and delete discount codes." },
  { key: "customers.edit", capability: "kartodesk_edit_customers", group: "Customers", label: "Edit customers",
    description: "Create and edit registered customers." },
  { key: "tools.run", capability: "kartodesk_run_tools", group: "System", label: "Run maintenance tools",
    description: "Clear caches, rebuild lookup tables and other store maintenance." },
] as const;

export type Permission = (typeof permissionList)[number]["key"];

export const allPermissions: Permission[] = permissionList.map(item => item.key);

/** What the built-in read-only login can do: look at everything, change nothing. */
export const viewPermissions: Permission[] = ["orders.view", "products.view", "customers.view", "reports.view", "settings.view"];

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (allPermissions as string[]).includes(value);
}

/** Product and variation fields that change stock; editing them also needs `inventory.edit`. */
export const stockFields = ["manage_stock", "stock_quantity", "stock_status", "backorders", "low_stock_amount"];

export function touchesStock(value: unknown) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    stockFields.some(field => Object.prototype.hasOwnProperty.call(value, field));
}

/** The screen each panel path belongs to, for navigation and for "no access" messages. */
export const screenPermissions: Record<string, Permission[]> = {
  "/": ["orders.view"],
  "/orders": ["orders.view"],
  "/products": ["products.view"],
  "/products/new": ["products.edit"],
  "/customers": ["customers.view"],
  "/inventory": ["products.view"],
  "/reports": ["reports.view"],
  "/settings": ["settings.view"],
};

export function screenAllowed(path: string, granted: readonly string[]) {
  const key = path === "/" ? "/" : Object.keys(screenPermissions).filter(prefix => prefix !== "/" && (path === prefix || path.startsWith(`${prefix}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const required = key ? screenPermissions[key] : [];
  return required.every(permission => granted.includes(permission));
}

/** All listed permissions, at least one of them, or any signed-in user. */
export type Requirement = Permission[] | { anyOf: Permission[] } | "any";
type Rule = { pattern: RegExp; methods: Record<string, Requirement> };

export function meetsRequirement(requirement: Requirement, granted: readonly string[]) {
  if (requirement === "any") return true;
  if (Array.isArray(requirement)) return requirement.every(permission => granted.includes(permission));
  return requirement.anyOf.some(permission => granted.includes(permission));
}

/**
 * API route permissions for the standalone app. A route that is not listed is refused to anyone without
 * every permission. Body-dependent checks (customer notes, stock fields) are added in the route handlers.
 * `any` means any signed-in user (e.g. workspace and store details needed by every screen).
 */
const rules: Rule[] = [
  { pattern: /^\/api\/dashboard\/preferences$/, methods: { GET: "any", PUT: ["settings.view"] } },
  { pattern: /^\/api\/dashboard\/metrics$/, methods: { GET: ["orders.view"] } },
  { pattern: /^\/api\/(timezone|settings)$/, methods: { GET: "any" } },
  { pattern: /^\/api\/woo\/connection$/, methods: { GET: ["settings.view"] } },
  { pattern: /^\/api\/reports$/, methods: { GET: ["reports.view"] } },
  { pattern: /^\/api\/woo\/orders$/, methods: { GET: ["orders.view"], POST: ["orders.status"] } },
  // Status names and counts are used by the orders screens and the reports filter.
  { pattern: /^\/api\/woo\/order-statuses$/, methods: { GET: { anyOf: ["orders.view", "reports.view"] } } },
  { pattern: /^\/api\/woo\/orders\/bulk$/, methods: { POST: ["orders.status"] } },
  { pattern: /^\/api\/woo\/orders\/\d+$/, methods: { GET: ["orders.view"], PATCH: ["orders.status"], DELETE: ["orders.status"] } },
  { pattern: /^\/api\/woo\/orders\/\d+\/notes$/, methods: { GET: ["orders.view"], POST: ["orders.notes"] } },
  { pattern: /^\/api\/woo\/orders\/\d+\/refunds$/, methods: { GET: ["orders.view"], POST: ["orders.refund"] } },
  { pattern: /^\/api\/woo\/orders\/\d+\/shipments$/, methods: { GET: ["orders.view"], POST: ["orders.shipments"], PATCH: ["orders.notify"], DELETE: ["orders.shipments"] } },
  { pattern: /^\/api\/woo\/products$/, methods: { GET: ["products.view"], POST: ["products.edit"] } },
  // PATCH is a product edit or a stock change; the handler decides which permission applies.
  { pattern: /^\/api\/woo\/products\/\d+$/, methods: { GET: ["products.view"], PATCH: "any" } },
  { pattern: /^\/api\/woo\/catalog$/, methods: { GET: ["products.view"], POST: ["products.edit"], PATCH: ["products.edit"] } },
  { pattern: /^\/api\/woo\/customers$/, methods: { GET: ["customers.view"] } },
];

/** Required permissions for an API request, `any` for any signed-in user, or `null` when the route is unknown. */
export function routePermissions(method: string, path: string): Requirement | null {
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  const rule = rules.find(item => item.pattern.test(path));
  if (!rule) return null;
  return rule.methods[verb] ?? null;
}
