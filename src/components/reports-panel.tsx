"use client";

import { usePanelPreferences } from "@/components/panel-preferences";
import { storeDate } from "@/lib/timezone";
import Link from "next/link";
import { useState } from "react";
import { BarChart3, Download, Package } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { formatDateTime, plainText, wooDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { reportCsv, reportCurrencyTotals } from "@/lib/reports";
import { useRemote } from "@/lib/use-remote";
import { statusName, useOrderStatusError, useOrderStatuses } from "@/lib/use-order-statuses";
import type { ReportResponse } from "@/types/reports";

function OrderReport({ data }: { data: ReportResponse }) {
  const currencies = reportCurrencyTotals(data.orders);
  const counts = new Map<string, number>();
  for (const order of data.orders) counts.set(order.status, (counts.get(order.status) || 0) + 1);
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{currencies.map(group => <section key={group.currency} className="rounded-xl border border-t-4 border-t-emerald-500 bg-background p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{group.currency} · {group.orders} orders</p>
      <h2 className="mt-3 text-sm text-muted-foreground">Recorded order value</h2><p className="mt-1 text-2xl font-semibold tabular-nums">{group.valid ? formatMoney(group.total, group.currency) : "Unavailable"}</p>
      <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-2"><dt className="text-muted-foreground">Refunds</dt><dd>{group.valid ? formatMoney(group.refunds, group.currency) : "Unavailable"}</dd></div><div className="flex justify-between gap-2"><dt className="text-muted-foreground">After refunds</dt><dd>{group.valid ? formatMoney(group.after_refunds, group.currency) : "Unavailable"}</dd></div></dl>
    </section>)}</div>
    <div className="flex flex-wrap gap-3">{[...counts].map(([status, count]) => <div key={status} className="flex items-center gap-2 rounded-lg border bg-background p-3"><OrderStatusBadge status={status} /><span className="font-semibold tabular-nums">{count}</span></div>)}</div>
    <p className="text-xs text-muted-foreground">Values include tax and shipping and every selected status, including unpaid or cancelled orders when selected. They represent stored order amounts, not profit or confirmed payments. Refunds are current amounts on orders created in the selected period, not refunds issued during that period.</p>
    <div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Order", "Created", "Status", "Currency", "Order value"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{data.orders.map(order => <tr key={order.id} className="hover:bg-accent/40"><td className="px-5 py-3"><Link className="font-medium text-primary hover:underline" href={`/orders/${order.id}`}>#{order.number}</Link></td><td className="whitespace-nowrap px-5 py-3">{formatDateTime(wooDate(order.date_created, order.date_created_gmt), data.timezone)}</td><td className="px-5 py-3"><OrderStatusBadge status={order.status} /></td><td className="px-5 py-3">{order.currency}</td><td className="whitespace-nowrap px-5 py-3 tabular-nums">{formatMoney(order.total, order.currency)}</td></tr>)}</tbody></table></div>
  </div>;
}

function InventoryReport({ data }: { data: ReportResponse }) {
  const managed = data.products.filter(product => product.manage_stock);
  const cards = [["Products loaded", data.products.length, "border-t-blue-500"], ["Managed stock", managed.length, "border-t-emerald-500"], ["Out of stock", data.products.filter(product => product.stock_status === "outofstock").length, "border-t-amber-500"]] as const;
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3">{cards.map(([label, count, color]) => <div key={label} className={`rounded-xl border border-t-4 bg-background p-5 ${color}`}><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold">{count}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">Parent product records only. Variation quantities are not included. Unmanaged stock has no numeric quantity and is never treated as zero.</p>
    <div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>{["Product", "SKU", "Stock status", "Stock management", "Quantity"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{data.products.map(product => <tr key={product.id}><td className="min-w-52 px-5 py-3 font-medium">{plainText(product.name)}</td><td className="px-5 py-3">{product.sku || "—"}</td><td className="px-5 py-3">{product.stock_status.replaceAll("_", " ").replace("outofstock", "Out of stock").replace("instock", "In stock").replace("onbackorder", "On backorder")}</td><td className="px-5 py-3">{product.manage_stock ? "Managed" : "Not managed"}</td><td className="px-5 py-3">{product.manage_stock ? product.stock_quantity ?? "Unavailable" : "—"}</td></tr>)}</tbody></table></div>
  </div>;
}

export function ReportsPanel() {
  const { timeZone } = usePanelPreferences();
  return <ReportWorkspace key={timeZone} timeZone={timeZone} />;
}

function ReportWorkspace({ timeZone }: { timeZone: string }) {
  const statuses = useOrderStatuses();
  const statusError = useOrderStatusError();
  const [kind, setKind] = useState<"orders" | "inventory">("orders");
  const [from, setFrom] = useState(() => storeDate(new Date(Date.now() - 29 * 86400000), timeZone));
  const [to, setTo] = useState(() => storeDate(new Date(), timeZone));
  const [status, setStatus] = useState("all");
  const [stock, setStock] = useState("all");
  const [query, setQuery] = useState(() => new URLSearchParams({ kind: "orders", from, to, status: "all" }).toString());
  const { data, error, loading, reload } = useRemote<ReportResponse>(`/api/reports?${query}`, "Could not load report.");

  function exportCsv() {
    if (!data) return;
    const scope = data.filters;
    const values = data.kind === "orders"
      ? [["Order", "Created UTC", "Status", "Currency", "Order value"], ...data.orders.map(order => [order.number, order.date_created_gmt || order.date_created, order.status, order.currency, order.total])]
      : [["Product ID", "Product", "SKU", "Stock status", "Stock managed", "Quantity"], ...data.products.map(product => [product.id, plainText(product.name), product.sku, product.stock_status, product.manage_stock ? "Yes" : "No", product.manage_stock ? product.stock_quantity : ""])];
    const rows = [["Report", data.kind], ["Generated UTC", data.generated_at], ["Store timezone", data.timezone], ["From store date", scope.from], ["To store date", scope.to], ["Status filter", scope.status], ["Stock filter", scope.stock], ["Data scope", data.complete ? "All matching records fetched" : "Partial report"], ["Loaded", data.loaded], ["Matching", data.total], [], ...values];
    const url = URL.createObjectURL(new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${data.kind}-report${data.complete ? "" : "-partial"}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Insights</p><h1 className="mt-1 text-2xl font-semibold">Reports</h1><p className="mt-1 text-muted-foreground">Understand orders and stock, then export the records you need.</p></div><button type="button" disabled={!data || !data.loaded || loading} onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Download className="size-4" />Export CSV</button></div>
    <form onSubmit={event => { event.preventDefault(); setQuery(new URLSearchParams({ kind, from, to, status, stock }).toString()); reload(); }} className="flex flex-wrap items-end gap-4 rounded-xl border bg-background p-4 shadow-sm">
      <label className="text-sm font-medium">Report<select value={kind} onChange={event => setKind(event.target.value as typeof kind)} className="mt-2 block h-10 rounded-lg border bg-background px-3"><option value="orders">Orders</option><option value="inventory">Inventory</option></select></label>
      {kind === "orders" ? <><label className="text-sm font-medium">From (store date)<input required type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-2 block h-10 rounded-lg border bg-background px-3" /></label><label className="text-sm font-medium">To (store date)<input required type="date" min={from} value={to} onChange={event => setTo(event.target.value)} className="mt-2 block h-10 rounded-lg border bg-background px-3" /></label><label className="text-sm font-medium">Order status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-2 block h-10 rounded-lg border bg-background px-3"><option value="all">All statuses</option>{statuses.filter(item => item.settable).map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label></>
        : <label className="text-sm font-medium">Stock status<select value={stock} onChange={event => setStock(event.target.value)} className="mt-2 block h-10 rounded-lg border bg-background px-3"><option value="all">All products</option><option value="instock">In stock</option><option value="outofstock">Out of stock</option><option value="onbackorder">On backorder</option></select></label>}
      <button disabled={loading} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{loading ? "Generating..." : "Generate report"}</button>
    </form>
    {statusError && <Notice tone="warning">{statusError}</Notice>}
    {error && <Notice tone="error" action={<RetryButton onRetry={reload} busy={loading} />}>{data ? "Showing the last successful report. " : ""}{error}</Notice>}
    {!data ? loading ? <LoadingState label="Generating report..." /> : <ErrorState message={error || "Report unavailable."} onRetry={reload} />
      : !data.configured ? <EmptyState title="Store connection is not configured">Check Settings.</EmptyState>
      : <><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="font-medium">{data.kind === "orders" ? "Order report" : "Inventory report"} · {data.loaded} of {data.total} matching records{data.kind === "orders" && <> · {data.filters.from} to {data.filters.to} {data.timezone} · {data.filters.status === "all" ? "All statuses" : statusName(statuses, data.filters.status || "all")}</>}</span><span>Fetched {formatDateTime(new Date(data.generated_at), data.timezone)}</span></div>
        {data.timezone_warning && <Notice tone="warning">{data.timezone_warning}</Notice>}
        {!data.complete && <Notice tone="warning">This report is incomplete. It includes {data.loaded} of {data.total} matching records, with a limit of {data.limit}. Totals and CSV include only loaded records. Narrow the date range or filter and generate again. Store changes during loading can also make a report incomplete.</Notice>}
        {!data.loaded ? <EmptyState icon={kind === "orders" ? BarChart3 : Package} title="No matching records" /> : data.kind === "orders" ? <OrderReport data={data} /> : <InventoryReport data={data} />}
      </>}
    <p className="text-xs text-muted-foreground">Reports are bounded live reads with up to 500 records. Data can change while the store is being read. Dates and displayed times follow the store timezone shown in Settings.</p>
  </div>;
}
