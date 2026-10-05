"use client";

import { usePanelPreferences } from "@/components/panel-preferences";
import { ViewTabs } from "@/components/collection/view-tabs";
import { ColumnMenu } from "@/components/collection/column-menu";
import { DensityToggle } from "@/components/collection/density-toggle";
import { BulkBar } from "@/components/collection/bulk-bar";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShoppingCart } from "lucide-react";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { wooDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { defaultListState, listHref, readListState, saveNavigation, writeListState } from "@/lib/orders-navigation";
import { refreshOrderStatuses, statusName, useOrderStatusError, useOrderStatuses } from "@/lib/use-order-statuses";
import { useDebouncedValue, useRemote } from "@/lib/use-remote";
import { useCollectionPrefs } from "@/lib/use-collection-prefs";
import { addView, removeView, setColumns, setDensity, viewMatches } from "@/lib/collection-prefs";
import type { WooOrder } from "@/types/woocommerce";

type OrdersResponse = { configured?: boolean; orders: WooOrder[]; total: number; pages: number };

const perPage = 20;
const allColumns = ["number", "customer", "status", "payment", "total", "date"];
const defaultColumns = ["number", "customer", "status", "payment", "total", "date"];

const builtInViews: Array<{ id: string; name: string; custom: boolean; filters: Record<string, string> }> = [
  { id: "all", name: "All orders", custom: false, filters: {} },
  { id: "processing", name: "Processing", custom: false, filters: { status: "processing" } },
  { id: "on-hold", name: "On hold", custom: false, filters: { status: "on-hold" } },
  { id: "failed", name: "Failed", custom: false, filters: { status: "failed" } },
  { id: "completed", name: "Completed", custom: false, filters: { status: "completed" } },
];

export function OrdersTable() {
  const { timeZone, can, access } = usePanelPreferences();
  const canWrite = can("orders.status");
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState(defaultListState.search);
  const [status, setStatus] = useState(defaultListState.status);
  const [bulkStatus, setBulkStatus] = useState("processing");
  const [page, setPage] = useState(defaultListState.page);
  // Filters come from the URL after mount, so nothing loads until they are known.
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const statuses = useOrderStatuses();
  const statusError = useOrderStatusError();
  const filterStatuses = statuses.filter(item => item.slug !== "trash");
  const settableStatuses = statuses.filter(item => item.settable);

  const { prefs, ready: prefsReady, update: updatePrefs } = useCollectionPrefs(
    "orders",
    allColumns,
    defaultColumns,
    access ? access.user ?? "default" : null
  );

  // Column definitions for the menu
  const columnDefs = [
    { key: "number", label: "Order" },
    { key: "customer", label: "Customer" },
    { key: "status", label: "Status" },
    { key: "payment", label: "Payment" },
    { key: "total", label: "Total" },
    { key: "date", label: "Date" },
  ];

  // Find the active view based on current filters
  const currentFilters: Record<string, string> = {
    search: debouncedSearch,
    status: status === "all" ? "" : status,
  };
  const allViews = [
    ...builtInViews,
    ...prefs.views.map((v) => ({ ...v, custom: true as const })),
  ];
  const activeViewId = allViews.find((v) => viewMatches(v, currentFilters))?.id ?? null;
  const canSaveView = !activeViewId && Object.values(currentFilters).some((v) => v !== "");

  useEffect(() => {
    const restore = () => {
      const state = readListState();
      setSearch(state.search);
      setStatus(state.status);
      setPage(state.page);
      setReady(true);
    };
    queueMicrotask(restore);
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);

  // Keep the URL in step with the filters (replacing, not adding, history entries).
  useEffect(() => {
    if (ready && search.trim() === debouncedSearch) writeListState({ search: debouncedSearch, status, page });
  }, [ready, search, debouncedSearch, status, page]);

  const params = new URLSearchParams({ page: String(page), per_page: String(perPage), search: debouncedSearch, status });
  const { data, error, loading, reload } = useRemote<OrdersResponse>(ready && search.trim() === debouncedSearch ? `/api/woo/orders?${params}` : null, "Could not load orders.");
  const orders = data?.orders || [];
  const pages = Math.max(data?.pages || 1, 1);

  // Remember this page of results so an order page can step to the previous or next order in it.
  useEffect(() => {
    if (!data?.orders) return;
    const state = { search: debouncedSearch, status, page };
    saveNavigation({ listHref: listHref(state), search: debouncedSearch, status, page, pages: Math.max(data.pages || 1, 1),
      perPage, total: data.total || 0, ids: data.orders.map(order => order.id) });
    // Only the loaded data decides what is remembered; the filters that produced it are captured with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  // Only orders visible on the current page can stay selected.
  const visibleSelected = selected.filter(id => orders.some(order => order.id === id));

  async function bulk() {
    if (!canWrite || !visibleSelected.length || saving) return;
    if (!window.confirm(`Change ${visibleSelected.length} order(s) to "${statusName(statuses, bulkStatus)}"? Store may email customers about status changes.`)) return;
    setSaving(true);
    setBulkResult(null);
    try {
      const result = await fetchJson<{ updated: number }>("/api/woo/orders/bulk", { method: "POST", json: { ids: visibleSelected, status: bulkStatus } });
      setBulkResult({ tone: "success", message: `${result.updated} order(s) updated to ${statusName(statuses, bulkStatus)}.` });
      setSelected([]);
    } catch (cause) {
      setBulkResult({ tone: "error", message: errorMessage(cause, "Bulk update failed.") });
    } finally {
      setSaving(false);
      refreshOrderStatuses();
      reload();
    }
  }

  function handleSelectView(viewId: string) {
    const view = allViews.find((v) => v.id === viewId);
    if (!view) return;
    setSearch(view.filters.search ?? "");
    setStatus(view.filters.status ?? "all");
    setPage(1);
  }

  function handleSaveView(name: string): string | undefined {
    const result = addView(prefs, name, currentFilters);
    if (!result.error) {
      updatePrefs(() => result.prefs);
    }
    return result.error;
  }

  function handleRemoveView(viewId: string) {
    const updated = removeView(prefs, viewId);
    updatePrefs(() => updated);
  }

  const allSelected = orders.length > 0 && orders.every(order => visibleSelected.includes(order.id));

  // Determine which columns are visible
  const visibleColumnKeys = prefs.columns.filter((col) => allColumns.includes(col));
  const visibleCols = columnDefs.filter((col) => visibleColumnKeys.includes(col.key));

  return <div className="space-y-4">
    {prefsReady && (
      <ViewTabs
        views={allViews}
        activeId={activeViewId}
        onSelect={handleSelectView}
        onSave={handleSaveView}
        onRemove={handleRemoveView}
        canSave={canSaveView}
      />
    )}
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" aria-label="Search orders" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search orders, customers or email..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <select aria-label="Filter by status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-10 rounded-lg border bg-background px-3 text-sm">
        <option value="all">All statuses</option>
        {filterStatuses.map(item => <option key={item.slug} value={item.slug}>{item.name}{item.count !== null ? ` (${item.count})` : ""}</option>)}
        {status !== "all" && !filterStatuses.some(item => item.slug === status) && <option value={status}>{statusName(statuses, status)}</option>}
      </select>
      {prefsReady && (
        <>
          <ColumnMenu
            columns={columnDefs}
            visible={visibleColumnKeys}
            onChange={(newVisible) => updatePrefs((current) => setColumns(current, newVisible, allColumns, defaultColumns))}
            onReset={() => updatePrefs((current) => setColumns(current, defaultColumns, allColumns, defaultColumns))}
          />
          <DensityToggle
            density={prefs.density}
            onChange={(newDensity) => updatePrefs((current) => setDensity(current, newDensity))}
          />
        </>
      )}
      <button type="button" onClick={() => { refreshOrderStatuses(); reload(); }} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm hover:bg-accent disabled:opacity-60"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />Refresh</button>
    </div>
    {canWrite && (
      <BulkBar count={visibleSelected.length} noun="order" onClear={() => setSelected([])}>
        <select aria-label="New status for selected orders" value={bulkStatus} onChange={event => setBulkStatus(event.target.value)} className="h-9 rounded-md border px-2 text-sm">{settableStatuses.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
        <button type="button" disabled={saving} onClick={bulk} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{saving ? "Updating..." : "Update status"}</button>
      </BulkBar>
    )}
    {statusError && <Notice tone="warning" action={<RetryButton onRetry={refreshOrderStatuses} />}>{statusError}</Notice>}
      {bulkResult && <Notice tone={bulkResult.tone}>{bulkResult.message}</Notice>}
    {error && data && <Notice tone="error" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded orders. {error}</Notice>}
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {!data ? (loading ? <LoadingState label="Loading orders…" /> : <ErrorState message={error || "Could not load orders."} onRetry={reload} busy={loading} />)
        : data.configured === false ? <EmptyState icon={ShoppingCart} title="Store is not configured">Add the store URL and API keys on the server, then check Settings.</EmptyState>
        : orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders found">{debouncedSearch || status !== "all" ? "Try a different search or status." : undefined}</EmptyState>
        : <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}><table className="w-full text-sm">
          <thead className="border-b font-medium text-left text-xs text-muted-foreground"><tr><th className="w-12 px-5 py-3"><input type="checkbox" disabled={!canWrite || saving} aria-label="Select all orders on this page" checked={allSelected} onChange={event => setSelected(event.target.checked ? orders.map(order => order.id) : [])} /></th>
            {visibleCols.map((col) => {
              const headerClass = col.key === "number" ? "px-3" : "px-5";
              return <th key={col.key} className={`${headerClass} py-3`}>{col.label}</th>;
            })}
          </tr></thead>
          <tbody className="divide-y">{orders.map(order => <tr key={order.id} className="group relative hover:bg-accent">
            <td className={`relative px-5 ${prefs.density === "compact" ? "py-2" : "py-4"}`}><input type="checkbox" disabled={!canWrite || saving} aria-label={`Select order ${order.number}`} checked={visibleSelected.includes(order.id)} onChange={event => setSelected(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id))} className="relative z-10" /></td>
            {visibleColumnKeys.map((colKey) => {
              const cellClass = colKey === "number" ? "px-3" : "px-5";
              const padding = prefs.density === "compact" ? "py-2" : "py-4";
              return (
                <td key={colKey} className={`${cellClass} ${padding}`}>
                  {colKey === "number" && <Link href={`/orders/${order.id}`} className="font-medium after:absolute after:inset-0 hover:underline focus-visible:underline group-hover:underline">#{order.number}</Link>}
                  {colKey === "customer" && <>
                    <div className="font-medium">{order.billing.first_name} {order.billing.last_name}{!order.customer_id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(guest)</span>}</div>
                    <div className="text-xs text-muted-foreground">{order.billing.email}</div>
                  </>}
                  {colKey === "status" && <OrderStatusBadge status={order.status} />}
                  {colKey === "payment" && <span className="text-muted-foreground">{order.payment_method_title || "—"}</span>}
                  {colKey === "total" && <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(order.total, order.currency)}</span>}
                  {colKey === "date" && <span className="whitespace-nowrap text-muted-foreground">{wooDate(order.date_created, order.date_created_gmt)?.toLocaleDateString(undefined, { timeZone }) || "—"}</span>}
                </td>
              );
            })}
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
