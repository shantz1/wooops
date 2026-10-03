import { WooApiError } from "@/lib/woocommerce/client";

export const shipmentsMetaKey = "wooops_shipments";

export interface Shipment {
  id: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string;
  shipped_at: string;
}

export interface OrderWithMeta {
  meta_data?: Array<{ id: number; key: string; value: unknown }>;
  billing?: { email?: string };
}

function isShipment(item: unknown): item is Shipment {
  const value = item as Shipment;
  if (!(Boolean(value) && typeof value.id === "string" && typeof value.carrier === "string" &&
    typeof value.tracking_number === "string" && typeof value.tracking_url === "string" &&
    typeof value.shipped_at === "string")) return false;
  if (!value.id || !value.carrier.trim() || value.carrier.length > 80 || !value.tracking_number.trim() || value.tracking_number.length > 120) return false;
  if (value.tracking_url) {
    try { const url = new URL(value.tracking_url); if (url.protocol !== "https:" || url.username || url.password || value.tracking_url.length > 2048) return false; }
    catch { return false; }
  }
  if (value.shipped_at && (!/^\d{4}-\d{2}-\d{2}$/.test(value.shipped_at) || Number.isNaN(Date.parse(value.shipped_at)) || new Date(value.shipped_at).toISOString().slice(0, 10) !== value.shipped_at)) return false;
  return true;
}

/**
 * Reads WooOps shipments from order metadata. Malformed or duplicated metadata is reported as a conflict
 * instead of being treated as empty, so a later write cannot overwrite data WooOps does not understand.
 */
export function readShipments(order: OrderWithMeta) {
  const entries = order.meta_data?.filter(item => item.key === shipmentsMetaKey) || [];
  if (entries.length > 1) {
    throw new WooApiError("This order has more than one wooops_shipments metadata entry. Resolve it in your store before editing tracking.", 409);
  }
  const meta = entries[0];
  if (!meta) return { metaId: undefined, shipments: [] as Shipment[] };
  let value = meta.value;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!Array.isArray(value) || !value.every(isShipment) || new Set(value.map(item => item.id)).size !== value.length) {
    throw new WooApiError("Stored shipment data on this order is not in the expected tracking format. It was left unchanged.", 409);
  }
  return { metaId: meta.id, shipments: value };
}

export function shipmentMeta(metaId: number | undefined, shipments: Shipment[]) {
  return [{ ...(metaId ? { id: metaId } : {}), key: shipmentsMetaKey, value: JSON.stringify(shipments) }];
}
