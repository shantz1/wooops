import type { WooOrderStatus } from "@/types/woocommerce";

const styles: Record<WooOrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  processing: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  "on-hold": "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  refunded: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  trash: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

export function OrderStatusBadge({ status }: { status: WooOrderStatus }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles[status] || styles.pending}`}>
      {status.replace("-", " ")}
    </span>
  );
}
