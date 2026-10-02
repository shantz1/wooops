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
  return Boolean(value) && typeof value.id === "string" && typeof value.carrier === "string" &&
    typeof value.tracking_number === "string" && typeof value.tracking_url === "string" &&
    typeof value.shipped_at === "string";
}

/**
 * Reads WooOps shipments from order metadata. Malformed or duplicated metadata is reported as a conflict
 * instead of being treated as empty, so a later write cannot overwrite data WooOps does not understand.
 */
export function readShipments(order: OrderWithMeta) {
  const entries = order.meta_data?.filter(item => item.key === shipmentsMetaKey) || [];
  if (entries.length > 1) {
    throw new WooApiError("This order has more than one wooops_shipments metadata entry. Resolve it in WooCommerce before editing tracking.", 409);
  }
  const meta = entries[0];
  if (!meta) return { metaId: undefined, shipments: [] as Shipment[] };
  let value = meta.value;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!Array.isArray(value) || !value.every(isShipment)) {
    throw new WooApiError("Stored shipment data on this order is not in the WooOps format. It was left unchanged.", 409);
  }
  return { metaId: meta.id, shipments: value };
}

export function shipmentMeta(metaId: number | undefined, shipments: Shipment[]) {
  return [{ ...(metaId ? { id: metaId } : {}), key: shipmentsMetaKey, value: JSON.stringify(shipments) }];
}
