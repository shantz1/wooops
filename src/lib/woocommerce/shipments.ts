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

export function readShipments(order: OrderWithMeta) {
  const meta = order.meta_data?.find(item => item.key === shipmentsMetaKey);
  if (!meta) return { metaId: undefined, shipments: [] as Shipment[] };
  const value = typeof meta.value === "string" ? JSON.parse(meta.value) : meta.value;
  if (!Array.isArray(value) || !value.every(item =>
    item && typeof item.id === "string" && typeof item.carrier === "string" &&
    typeof item.tracking_number === "string" && typeof item.tracking_url === "string" &&
    typeof item.shipped_at === "string")) {
    throw new Error("Stored shipment data is invalid.");
  }
  return { metaId: meta.id, shipments: value as Shipment[] };
}

export function shipmentMeta(metaId: number | undefined, shipments: Shipment[]) {
  return [{ ...(metaId ? { id: metaId } : {}), key: shipmentsMetaKey, value: JSON.stringify(shipments) }];
}
