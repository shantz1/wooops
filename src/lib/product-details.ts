/** Explicit catalogue fields; callers never forward arbitrary product metadata. */
export type ProductAttribute = { id: number; name: string; position: number; visible: boolean; variation: boolean; options: string[] };
export type ProductDetails = {
  name: string; status: string; type: string; sku: string; regular_price: string; sale_price: string;
  description: string; short_description: string; catalog_visibility: string; featured: boolean;
  manage_stock: boolean; stock_quantity: number | null; stock_status: string; backorders: string; sold_individually: boolean;
  weight: string; dimensions: { length: string; width: string; height: string }; shipping_class: string;
  images: Array<{ id: number; src: string; alt: string }>; categories: Array<{ id: number; name: string }>;
  attributes: ProductAttribute[]; upsell_ids: number[]; cross_sell_ids: number[]; grouped_products: number[];
  purchase_note: string; reviews_allowed: boolean; menu_order: number; total_sales: number; average_rating: string;
  permalink: string; date_modified_gmt: string; id: number; virtual: boolean;
};

export function validStoreImageUrl(value: string, storeUrl: string | undefined) {
  if (!value) return true;
  if (value.length > 2048 || !storeUrl) return false;
  try {
    const image = new URL(value), store = new URL(storeUrl);
    const local = store.hostname === "localhost" || store.hostname === "127.0.0.1";
    return image.origin === store.origin && (image.protocol === "https:" || local && image.protocol === "http:") && !image.username && !image.password;
  } catch { return false; }
}

const textLimits: Record<string, number> = { name: 200, sku: 100, description: 10000, short_description: 5000, purchase_note: 5000, shipping_class: 200 };
const enums: Record<string, string[]> = { status: ["draft", "pending", "private", "publish"], catalog_visibility: ["visible", "catalog", "search", "hidden"], stock_status: ["instock", "outofstock", "onbackorder"], backorders: ["no", "notify", "yes"] };
const ids = (v: unknown) => Array.isArray(v) && v.length <= 100 && v.every(id => Number.isSafeInteger(id) && id > 0) && new Set(v).size === v.length;
const decimal = (v: unknown) => typeof v === "string" && v.length <= 30 && (v === "" || /^\d+(?:\.\d{1,6})?$/.test(v));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Validation happens before reading or writing the store. WooCommerce additionally validates its schema. */
export function validProductDetails(value: unknown, storeUrl?: string): value is Record<string, unknown> {
  if (!object(value) || !Object.keys(value).length) return false;
  return Object.entries(value).every(([key, v]) => {
    if (Object.hasOwn(textLimits, key)) return typeof v === "string" && v.length <= textLimits[key] && (key !== "name" || !!v.trim());
    if (Object.hasOwn(enums, key)) return typeof v === "string" && enums[key].includes(v);
    if (["featured", "manage_stock", "sold_individually", "reviews_allowed", "virtual"].includes(key)) return typeof v === "boolean";
    if (["regular_price", "sale_price", "weight"].includes(key)) return decimal(v);
    if (key === "stock_quantity") return v === null || Number.isSafeInteger(v) && Number(v) >= 0;
    if (key === "menu_order") return Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 100000;
    if (["upsell_ids", "cross_sell_ids", "grouped_products"].includes(key)) return ids(v);
    if (key === "dimensions") return object(v) && Object.keys(v).every(k => ["length", "width", "height"].includes(k) && decimal(v[k]));
    if (key === "categories") return Array.isArray(v) && v.length <= 100 && v.every(c => object(c) && Object.keys(c).length === 1 && Number.isSafeInteger(c.id) && Number(c.id) > 0);
    if (key === "images") return Array.isArray(v) && v.length <= 20 && v.every(i => object(i) && Object.keys(i).every(k => ["id", "src", "alt"].includes(k)) &&
      (Number.isSafeInteger(i.id) && Number(i.id) > 0 || typeof i.src === "string" && !!i.src && validStoreImageUrl(i.src, storeUrl)) && (i.alt === undefined || typeof i.alt === "string" && i.alt.length <= 200));
    if (key === "attributes") return Array.isArray(v) && v.length <= 30 && v.every(a => object(a) && Object.keys(a).every(k => ["id", "name", "position", "visible", "variation", "options"].includes(k)) &&
      Number.isSafeInteger(a.id) && Number(a.id) >= 0 && typeof a.name === "string" && !!a.name.trim() && a.name.length <= 200 && Number.isSafeInteger(a.position) && Number(a.position) >= 0 &&
      typeof a.visible === "boolean" && typeof a.variation === "boolean" && Array.isArray(a.options) && a.options.length <= 100 && a.options.every(o => typeof o === "string" && !!o.trim() && o.length <= 200));
    return false;
  });
}
