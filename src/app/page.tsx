"use client";
import { usePanelPreferences } from "@/components/panel-preferences";

import Link from "next/link";
import { useState } from "react";
import { OverviewCards } from "@/components/overview-cards";
import { ArrowUpRight, PackageCheck, ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { formatDateTime, wooDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { isAvailable } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";
import type { WooOrder } from "@/types/woocommerce";

type OrdersResponse = { configured?: boolean; orders: WooOrder[] };

export default function Home() {
  const { timeZone } = usePanelPreferences();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading, reload } = useRemote<OrdersResponse>("/api/woo/orders?per_page=5", "Could not load recent orders.");
  const orders = data?.orders || [];

  return <AppShell><div className="space-y-8">
    <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted-foreground">Your selected store metrics and the five most recent orders.</p>
      </div>
      <div className="flex gap-2">
        <RetryButton onRetry={() => { reload(); setRefreshKey(value => value + 1); }} busy={loading} label="Refresh" />
        {isAvailable("/settings") && <Link href="/settings" className="inline-flex w-fit items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Store connection<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </section>
    {error && data && <Notice tone="error">Showing the last loaded orders. {error}</Notice>}
    <OverviewCards orders={orders} available={Boolean(data) && data?.configured !== false} refreshKey={refreshKey} />
    <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Recent orders</h2><p className="mt-1 text-sm text-muted-foreground">Latest orders from your store.</p></div><PackageCheck className="size-5 text-muted-foreground" aria-hidden="true" /></div>
        <div className="mt-5 divide-y">
          {!data ? (loading ? <LoadingState label="Loading recent orders…" className="py-10" /> : <ErrorState message={error || "Could not load recent orders."} onRetry={reload} className="py-10" />)
            : data.configured === false ? <EmptyState icon={ShoppingCart} title="Store is not configured" className="py-10">Add the store URL and API keys on the server, then check Settings.</EmptyState>
            : orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders yet" className="py-10" />
            : orders.map(order => <Link href={`/orders/${order.id}`} key={order.id} className="flex items-center justify-between gap-4 rounded-md py-4 hover:bg-accent">
              <div className="min-w-0"><p className="truncate font-medium">#{order.number} · {order.billing.first_name} {order.billing.last_name}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><OrderStatusBadge status={order.status} />{formatDateTime(wooDate(order.date_created, order.date_created_gmt), timeZone)}</p></div>
              <span className="shrink-0 font-medium tabular-nums">{formatMoney(order.total, order.currency)}</span>
            </Link>)}
        </div>
      </div>
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <h2 className="font-semibold">Quick actions</h2>
        <div className="mt-4 space-y-2">{[["/orders", "View all orders"], ["/products", "Manage products"], ["/customers", "Find a customer"], ["/settings", "Connection settings"]].filter(([href]) => isAvailable(href)).map(([href, label]) => <Link key={href} href={href} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent"><span>{label}</span><ArrowUpRight className="size-4" aria-hidden="true" /></Link>)}</div>
      </div>
    </section>
  </div></AppShell>;
}
