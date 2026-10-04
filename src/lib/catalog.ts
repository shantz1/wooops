export const catalogResources = ["categories", "attributes", "terms", "reviews", "shipping", "variations"] as const;
export type CatalogResource = typeof catalogResources[number];
export type CatalogItem = { id: number; name: string; slug?: string; description?: string; parent?: number; count?: number; type?: string; order_by?: string; has_archives?: boolean; product_id?: number; product_name?: string; review?: string; reviewer?: string; rating?: number; status?: string; sku?: string; regular_price?: string; sale_price?: string; manage_stock?: boolean; stock_quantity?: number | null; stock_status?: string; attributes?: Array<{ id: number; name: string; option: string }> };
export type CatalogResponse = { items: CatalogItem[]; total: number; pages: number };

export function catalogPath(resource: string | null, parent: string | null) {
  if (!catalogResources.includes(resource as CatalogResource)) return null;
  if (["terms", "variations"].includes(resource!) && (!parent || !/^[1-9]\d*$/.test(parent) || !Number.isSafeInteger(Number(parent)))) return null;
  if (resource === "terms") return `products/attributes/${parent}/terms`;
  if (resource === "variations") return `products/${parent}/variations`;
  return `products/${resource === "shipping" ? "shipping_classes" : resource}`;
}

export function validCatalogWrite(resource: string, value: unknown, creating: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (!keys.length || resource === "shipping") return false;
  if (resource === "reviews") return !creating && keys.length === 1 && ["approved", "hold", "spam"].includes(String(body.status));
  const allowed = resource === "variations" ? ["sku", "regular_price", "sale_price", "manage_stock", "stock_quantity", "stock_status", "status", "attributes"] :
    resource === "attributes" ? ["name", "slug", "type", "order_by", "has_archives"] : ["name", "slug", "description", "parent"];
  if (keys.some(key => !allowed.includes(key))) return false;
  if (creating && resource !== "variations" && (typeof body.name !== "string" || !body.name.trim())) return false;
  if (creating && resource === "variations" && (!Array.isArray(body.attributes) || !body.attributes.length)) return false;
  return keys.every(key => {
    const v = body[key];
    if (["name", "slug", "sku"].includes(key)) return typeof v === "string" && v.length <= 200 && (key !== "name" || !!v.trim());
    if (key === "description") return typeof v === "string" && v.length <= 5000;
    if (["regular_price", "sale_price"].includes(key)) return typeof v === "string" && v.length <= 30 && (v === "" || /^\d+(?:\.\d{1,6})?$/.test(v));
    if (key === "parent") return Number.isSafeInteger(v) && Number(v) >= 0;
    if (key === "stock_quantity") return v === null || Number.isSafeInteger(v) && Number(v) >= 0;
    if (["manage_stock", "has_archives"].includes(key)) return typeof v === "boolean";
    if (key === "type") return v === "select";
    if (key === "order_by") return ["menu_order", "name", "name_num", "id"].includes(String(v));
    if (key === "stock_status") return ["instock", "outofstock", "onbackorder"].includes(String(v));
    if (key === "status") return ["publish", "private"].includes(String(v));
    if (key === "attributes") return Array.isArray(v) && v.length <= 30 && v.every(a => a && typeof a === "object" && Object.keys(a).every(k => ["id", "name", "option"].includes(k)) &&
      Number.isSafeInteger(a.id) && a.id >= 0 && typeof a.name === "string" && a.name.length <= 200 && typeof a.option === "string" && !!a.option.trim() && a.option.length <= 200);
    return false;
  });
}
