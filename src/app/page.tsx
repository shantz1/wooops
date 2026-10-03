"use client";
import { usePanelPreferences } from "@/components/panel-preferences";

import Link from "next/link";
import { ArrowUpRight, Clock3, Coins, PackageCheck, ShoppingCart, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { formatDateTime, wooDate } from "@/lib/format";
import { formatMoney, sumDecimals } from "@/lib/money";
import { isAvailable } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";
import type { WooOrder } from "@/types/woocommerce";

type OrdersResponse = { configured?: boolean; orders: WooOrder[] };

export default function Home() {
  const { timeZone } = usePanelPreferences();
  const { data, error, loading, reload } = useRemote<OrdersResponse>("/api/woo/orders?per_page=5", "Could not load recent orders.");
  const orders = data?.orders || [];
  const currencies = new Set(orders.map(order => order.currency));
  // Amounts in different currencies are never added together.
  const revenue = currencies.size === 1 ? formatMoney(sumDecimals(orders.map(order => order.total)).value, orders[0].currency)
    : currencies.size > 1 ? "Mixed currencies" : "—";
  const registered = new Set(orders.filter(order => order.customer_id).map(order => order.customer_id)).size;
  const guests = orders.filter(order => !order.customer_id).length;
  const cards = [
    ["Recent orders", orders.length, "Latest orders loaded (max 5)", ShoppingCart],
    ["Processing or on hold", orders.filter(order => ["processing", "on-hold"].includes(order.status)).length, "Among the latest 5 orders", Clock3],
    ["Recent order value", revenue, "Sum of the latest 5 order totals, any status", Coins],
    ["Registered customers", registered, `In the latest 5 orders${guests ? ` · plus ${guests} guest order${guests === 1 ? "" : "s"}` : ""}`, Users],
  ] as const;
  const accents = ["border-t-blue-500 bg-blue-50/60 dark:bg-blue-950/20", "border-t-amber-500 bg-amber-50/60 dark:bg-amber-950/20", "border-t-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20", "border-t-violet-500 bg-violet-50/60 dark:bg-violet-950/20"];
  const iconAccents = ["bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"];

  return <AppShell><div className="space-y-8">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">A snapshot of the five most recent orders. These are not store-wide totals.</p>
      </div>
      <div className="flex gap-2">
        <RetryButton onRetry={reload} busy={loading} label="Refresh" />
        {isAvailable("/settings") && <Link href="/settings" className="inline-flex w-fit items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">Store connection<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </section>
    {error && data && <Notice tone="error">Showing the last loaded orders. {error}</Notice>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, hint, Icon], index) => <div key={label} className={`rounded-xl border border-t-4 p-5 shadow-sm ${accents[index]}`}>
      <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className={`rounded-lg p-2 ${iconAccents[index]}`}><Icon className="size-4" aria-hidden="true" /></span></div>
      <div className="mt-4 text-2xl font-semibold tabular-nums">{data ? value : "—"}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Recent orders</h2><p className="mt-1 text-sm text-muted-foreground">Latest orders from your store.</p></div><PackageCheck className="size-5 text-muted-foreground" aria-hidden="true" /></div>
        <div className="mt-5 divide-y">
          {!data ? (loading ? <LoadingState label="Loading recent orders…" className="py-10" /> : <ErrorState message={error || "Could not load recent orders."} onRetry={reload} className="py-10" />)
            : data.configured === false ? <EmptyState icon={ShoppingCart} title="Store is not configured" className="py-10">Add the store URL and API keys on the server, then check Settings.</EmptyState>
            : orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders yet" className="py-10" />
            : orders.map(order => <Link href={`/orders/${order.id}`} key={order.id} className="flex items-center justify-between gap-4 rounded-md py-4 hover:bg-muted/30">
              <div className="min-w-0"><p className="truncate font-medium">#{order.number} · {order.billing.first_name} {order.billing.last_name}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><OrderStatusBadge status={order.status} />{formatDateTime(wooDate(order.date_created, order.date_created_gmt), timeZone)}</p></div>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(order.total, order.currency)}</span>
            </Link>)}
        </div>
      </div>
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <h2 className="font-semibold">Quick actions</h2>
        <div className="mt-4 space-y-2">{[["/orders", "View all orders"], ["/products", "Manage products"], ["/customers", "Find a customer"], ["/settings", "Connection settings"]].filter(([href]) => isAvailable(href)).map(([href, label]) => <Link key={href} href={href} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted"><span>{label}</span><ArrowUpRight className="size-4" aria-hidden="true" /></Link>)}</div>
      </div>
    </section>
  </div></AppShell>;
}
