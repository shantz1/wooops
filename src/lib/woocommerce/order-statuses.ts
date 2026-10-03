import "server-only";
import { wooFetch } from "@/lib/woocommerce/client";
import { internalStatuses, isOrderStatus, isStatusSlug } from "@/lib/woocommerce/validation";

export interface OrderStatusInfo { slug: string; name: string; count: number; settable: boolean }

let cached: { value: OrderStatusInfo[]; expires: number } | null = null;
let pending: Promise<OrderStatusInfo[]> | null = null;
let generation = 0;

/**
 * Every order status registered in the store, including custom statuses from extensions, with order counts.
 * WooCommerce builds `reports/orders/totals` from wc_get_order_statuses(). Cached briefly per process.
 */
export async function readOrderStatuses(fresh = false): Promise<OrderStatusInfo[]> {
  if (!fresh && cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  const started = generation;
  const request = wooFetch<Array<{ slug?: unknown; name?: unknown; total?: unknown }>>("reports/orders/totals", fresh ? { signal: AbortSignal.timeout(20_000) } : undefined).then(rows => {
    const value = (Array.isArray(rows) ? rows : []).flatMap(row => {
      const slug = typeof row.slug === "string" ? row.slug.replace(/^wc-/, "") : "";
      if (!isStatusSlug(slug)) return [];
      return [{
        slug,
        name: typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 80) : slug,
        count: Number.isSafeInteger(Number(row.total)) && Number(row.total) >= 0 ? Number(row.total) : 0,
        settable: !internalStatuses.includes(slug),
      }];
    });
    if (generation === started) cached = { value, expires: Date.now() + 60_000 };
    return value;
  }).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return pending;
}

export function clearOrderStatuses() { cached = null; pending = null; generation++; }

/** Standard statuses are always accepted; custom ones must be registered in the store right now. */
export async function isSettableStatus(status: unknown): Promise<boolean> {
  if (isOrderStatus(status)) return true;
  if (!isStatusSlug(status) || internalStatuses.includes(status)) return false;
  try {
    return (await readOrderStatuses(true)).some(item => item.slug === status && item.settable);
  } catch {
    return false;
  }
}
