"use client";
import { CalendarDays, Clock3, Coins, ShoppingCart, Users } from "lucide-react";
import { dashboardCards, isCountCard } from "@/lib/dashboard";
import { useDashboardPreferences } from "@/lib/use-dashboard-preferences";
import { useOrderStatuses } from "@/lib/use-order-statuses";
import { useRemote } from "@/lib/use-remote";
import { Notice, RetryButton } from "@/components/ui/feedback";
import { formatMoney, sumDecimals } from "@/lib/money";
import type { WooOrder } from "@/types/woocommerce";

type Metrics = { configured: boolean; counts: Record<string, number>; timezone_warning?: string | null };
export function OverviewCards({ orders, available, refreshKey }: { orders: WooOrder[]; available: boolean; refreshKey: number }) {
  const { preferences, loaded, error: preferencesError, reload: reloadPreferences } = useDashboardPreferences();
  const statuses = useOrderStatuses();
  const countCards = preferences.cards.filter(isCountCard);
  const { data, loading, error, reload } = useRemote<Metrics>(loaded && countCards.length ? `/api/dashboard/metrics?cards=${encodeURIComponent(countCards.join(","))}` : null, "Could not load overview counts.", refreshKey);
  const currencies = new Set(orders.map(order => order.currency));
  const guests = orders.filter(order => !order.customer_id).length;
  const revenue = currencies.size === 1 ? formatMoney(sumDecimals(orders.map(order => order.total)).value, orders[0].currency) : currencies.size > 1 ? "Mixed currencies" : "—";
  const recent: Record<string, number | string> = {
    recent_orders: orders.length,
    recent_pending: orders.filter(order => ["processing", "on-hold"].includes(order.status)).length,
    recent_value: revenue,
    recent_customers: new Set(orders.filter(order => order.customer_id).map(order => order.customer_id)).size,
  };
  const accents = ["border-t-blue-500", "border-t-amber-500", "border-t-emerald-500", "border-t-cyan-500"];
  const iconAccents = ["text-blue-700 dark:text-blue-300", "text-amber-800 dark:text-amber-300", "text-emerald-700 dark:text-emerald-300", "text-cyan-700 dark:text-cyan-300"];
  return <div className="space-y-3">
    {preferencesError && <Notice tone="warning">Showing default cards. {preferencesError} <RetryButton onRetry={reloadPreferences} /></Notice>}
    {countCards.length > 0 && error && <Notice tone="error">{data ? "Showing the last loaded counts. " : ""}{error} <RetryButton onRetry={reload} busy={loading} /></Notice>}
    {countCards.length > 0 && data?.timezone_warning && <Notice tone="warning">{data.timezone_warning}</Notice>}
    <section aria-label="Overview metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{preferences.cards.map((id, index) => {
      const card = dashboardCards.find(item => item.id === id);
      const status = statuses.find(item => item.slug === id.slice(7));
      const label = card?.label || status?.name || id.slice(7);
      const hint = id === "recent_customers" ? `In the latest 5 orders${guests ? ` · plus ${guests} guest order${guests === 1 ? "" : "s"}` : ""}` : card?.hint || "All orders currently in this status";
      const value = isCountCard(id) ? data?.configured ? data.counts[id] ?? "—" : "—" : available ? recent[id] : "—";
      const Icon = id === "recent_value" ? Coins : id === "recent_customers" ? Users : id === "recent_orders" ? ShoppingCart : id.startsWith("orders_") ? CalendarDays : Clock3;
      return <div key={id} className={`rounded-xl border border-t-4 p-5 shadow-sm ${accents[index]}`}><div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{label}</span><span className={`rounded-lg p-2 ${iconAccents[index]}`}><Icon className="size-4" aria-hidden="true" /></span></div><div className="mt-4 text-2xl font-semibold tabular-nums">{value}</div><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
    })}</section>
  </div>;
}
