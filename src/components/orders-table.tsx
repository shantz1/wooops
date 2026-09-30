"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import type { WooOrder, WooOrderStatus } from "@/types/woocommerce";

const statuses = ["all", "pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"];

export function OrdersTable() {
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [bulkStatus, setBulkStatus] = useState<WooOrderStatus>("processing");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "20", search, status });
      const response = await fetch(`/api/woo/orders?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load orders.");
      setOrders(result.orders || []);
      setPages(result.pages || 1);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function bulk() {
    if (!selected.length) return;
    setSaving(true);
    try {
      const response = await fetch("/api/woo/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, status: bulkStatus }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Bulk update failed.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bulk update failed.");
    } finally {
      setSaving(false);
    }
  }

  const allSelected = orders.length > 0 && orders.every(order => selected.includes(order.id));

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search orders, customers or email..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
      <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border bg-background px-3 text-sm">{statuses.map(value => <option key={value} value={value}>{value === "all" ? "All statuses" : value}</option>)}</select>
      <button type="button" onClick={load} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted"><RefreshCw className="size-4" />Refresh</button>
    </div>
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-sm"><span className="text-sm font-medium">{selected.length} selected</span><select value={bulkStatus} onChange={event => setBulkStatus(event.target.value as WooOrderStatus)} className="h-9 rounded-md border px-2 text-sm">{statuses.slice(1).map(value => <option key={value} value={value}>{value.replace("-", " ")}</option>)}</select><button type="button" disabled={saving} onClick={bulk} className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background disabled:opacity-50">{saving ? "Updating..." : "Update status"}</button></div>}
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="w-12 px-5 py-3"><input type="checkbox" aria-label="Select all orders" checked={allSelected} onChange={event => setSelected(event.target.checked ? orders.map(order => order.id) : [])} /></th><th className="px-3 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Date</th></tr></thead>
      <tbody className="divide-y">{loading ? <tr><td colSpan={7} className="px-5 py-16 text-center"><Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /></td></tr> : error ? <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-destructive">{error}</td></tr> : orders.length === 0 ? <tr><td colSpan={7} className="px-5 py-16 text-center text-muted-foreground">No orders found.</td></tr> : orders.map(order => <tr key={order.id} className="group relative hover:bg-muted/20">
        <td className="relative px-5 py-4"><input type="checkbox" aria-label={`Select order ${order.number}`} checked={selected.includes(order.id)} onChange={event => setSelected(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} className="relative z-10" /></td>
        <td className="px-3 py-4"><Link href={`/orders/${order.id}`} className="font-medium after:absolute after:inset-0 hover:underline group-hover:underline">#{order.number}</Link></td>
        <td className="px-5 py-4"><div className="font-medium">{order.billing.first_name} {order.billing.last_name}</div><div className="text-xs text-muted-foreground">{order.billing.email}</div></td>
        <td className="px-5 py-4"><OrderStatusBadge status={order.status} /></td>
        <td className="px-5 py-4 text-muted-foreground">{order.payment_method_title || "—"}</td>
        <td className="px-5 py-4 font-medium">{order.currency} {order.total}</td>
        <td className="px-5 py-4 text-muted-foreground">{new Date(order.date_created).toLocaleDateString()}</td>
      </tr>)}</tbody>
    </table></div><div className="flex items-center justify-between border-t px-5 py-3 text-sm"><span className="text-muted-foreground">Page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)} className="rounded-md border p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="size-4" /></button><button type="button" disabled={page >= pages} onClick={() => setPage(current => current + 1)} className="rounded-md border p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="size-4" /></button></div></div></div>
  </div>;
}
