import type { WooOrderStatus } from "@/types/woocommerce";

const editableStatuses: WooOrderStatus[] = [
  "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed",
];

export function isId(value: unknown): value is number | string {
  return (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ||
    (typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)));
}

export function isOrderStatus(value: unknown): value is WooOrderStatus {
  return editableStatuses.includes(value as WooOrderStatus);
}
