"use client";

import { usePanelPreferences } from "@/components/panel-preferences";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShoppingCart } from "lucide-react";
import { OrderStatusBadge, statusLabel } from "@/components/order-status-badge";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { wooDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { useDebouncedValue, useRemote } from "@/lib/use-remote";
import { editableStatuses } from "@/lib/woocommerce/validation";
import type { KnownOrderStatus, WooOrder } from "@/types/woocommerce";

type OrdersResponse = { configured?: boolean; orders: WooOrder[]; total: number; pages: number };

export function OrdersTable() {
  const { timeZone } = usePanelPreferences();
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [bulkStatus, setBulkStatus] = useState<KnownOrderStatus>("processing");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const params = new URLSearchParams({ page: String(page), per_page: "20", search: debouncedSearch, status });
  const { data, error, loading, reload } = useRemote<OrdersResponse>(`/api/woo/orders?${params}`, "Could not load orders.");
  const orders = data?.orders || [];
  const pages = Math.max(data?.pages || 1, 1);
  // Only orders visible on the current page can stay selected.
  const visibleSelected = selected.filter(id => orders.some(order => order.id === id));

  async function bulk() {
    if (!visibleSelected.length || saving) return;
    if (!window.confirm(`Change ${visibleSelected.length} order(s) to "${statusLabel(bulkStatus)}"? Store may email customers about status changes.`)) return;
    setSaving(true);
    setBulkResult(null);
    try {
      const result = await fetchJson<{ updated: number }>("/api/woo/orders/bulk", { method: "POST", json: { ids: visibleSelected, status: bulkStatus } });
      setBulkResult({ tone: "success", message: `${result.updated} order(s) updated to ${statusLabel(bulkStatus)}.` });
      setSelected([]);
    } catch (cause) {
      setBulkResult({ tone: "error", message: errorMessage(cause, "Bulk update failed.") });
    } finally {
      setSaving(false);
      reload();
    }
  }

  const allSelected = orders.length > 0 && orders.every(order => visibleSelected.includes(order.id));

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" aria-label="Search orders" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search orders, customers or email..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <select aria-label="Filter by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border bg-background px-3 text-sm capitalize">
        <option value="all">All statuses</option>
        {editableStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </select>
      <button type="button" onClick={reload} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted disabled:opacity-60"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button>
    </div>
    {visibleSelected.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-sm">
      <span className="text-sm font-medium">{visibleSelected.length} selected</span>
      <select aria-label="New status for selected orders" value={bulkStatus} onChange={event => setBulkStatus(event.target.value as KnownOrderStatus)} className="h-9 rounded-md border px-2 text-sm capitalize">{editableStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
      <button type="button" disabled={saving} onClick={bulk} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{saving ? "Updating..." : "Update status"}</button>
    </div>}
    {bulkResult && <Notice tone={bulkResult.tone}>{bulkResult.message}</Notice>}
    {error && data && <Notice tone="error" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded orders. {error}</Notice>}
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {!data ? (loading ? <LoadingState label="Loading orders…" /> : <ErrorState message={error || "Could not load orders."} onRetry={reload} busy={loading} />)
        : data.configured === false ? <EmptyState icon={ShoppingCart} title="Store is not configured">Add the store URL and API keys on the server, then check Settings.</EmptyState>
        : orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders found">{debouncedSearch || status !== "all" ? "Try a different search or status." : undefined}</EmptyState>
        : <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}><table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="w-12 px-5 py-3"><input type="checkbox" aria-label="Select all orders on this page" checked={allSelected} onChange={event => setSelected(event.target.checked ? orders.map(order => order.id) : [])} /></th><th className="px-3 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Date</th></tr></thead>
          <tbody className="divide-y">{orders.map(order => <tr key={order.id} className="group relative hover:bg-muted/20">
            <td className="relative px-5 py-4"><input type="checkbox" aria-label={`Select order ${order.number}`} checked={visibleSelected.includes(order.id)} onChange={event => setSelected(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} className="relative z-10" /></td>
            <td className="px-3 py-4"><Link href={`/orders/${order.id}`} className="font-medium after:absolute after:inset-0 hover:underline focus-visible:underline group-hover:underline">#{order.number}</Link></td>
            <td className="px-5 py-4"><div className="font-medium">{order.billing.first_name} {order.billing.last_name}{!order.customer_id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(guest)</span>}</div><div className="text-xs text-muted-foreground">{order.billing.email}</div></td>
            <td className="px-5 py-4"><OrderStatusBadge status={order.status} /></td>
            <td className="px-5 py-4 text-muted-foreground">{order.payment_method_title || "—"}</td>
            <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums">{formatMoney(order.total, order.currency)}</td>
            <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{wooDate(order.date_created, order.date_created_gmt)?.toLocaleDateString(undefined, { timeZone }) || "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
        <span className="text-muted-foreground">Page {page} of {pages}{data ? ` · ${data.total} order${data.total === 1 ? "" : "s"}` : ""}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)} className="rounded-md border p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="size-4" aria-hidden="true" /></button>
          <button type="button" disabled={page >= pages || loading} onClick={() => setPage(current => current + 1)} className="rounded-md border p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  </div>;
}
