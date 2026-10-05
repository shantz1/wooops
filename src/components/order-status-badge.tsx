"use client";

import { statusName, useOrderStatuses } from "@/lib/use-order-statuses";
import type { KnownOrderStatus, WooOrderStatus } from "@/types/woocommerce";

const styles: Record<KnownOrderStatus, string> = {
  pending: "border border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300",
  processing: "border border-blue-300 text-blue-800 dark:border-blue-700 dark:text-blue-300",
  "on-hold": "border border-orange-300 text-orange-800 dark:border-orange-700 dark:text-orange-300",
  completed: "border border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300",
  cancelled: "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300",
  refunded: "border border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-300",
  failed: "border border-red-300 text-red-800 dark:border-red-700 dark:text-red-300",
  trash: "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300",
};

const custom = "border border-dashed border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200";

export function statusLabel(status: WooOrderStatus) {
  return status.replace(/^wc-/, "").replace(/[-_]+/g, " ");
}

/**
 * Custom statuses registered by extensions are shown with a neutral outlined style, never as a known status.
 * The label is the store's own name for the status when available.
 */
export function OrderStatusBadge({ status }: { status: WooOrderStatus }) {
  const statuses = useOrderStatuses();
  const known = Object.hasOwn(styles, status);
  return (
    <span title={known ? undefined : "Custom status from your store or an extension"}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${known ? styles[status as KnownOrderStatus] : custom}`}>
      {known && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {statusName(statuses, status)}
    </span>
  );
}
