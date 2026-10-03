"use client";

import { ListPagination } from "@/components/list-pagination";
import { useState } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { useDebouncedValue, useRemote } from "@/lib/use-remote";
import type { WooProduct } from "@/types/woocommerce";

type ProductsResponse = { configured?: boolean; products: WooProduct[]; total: number; pages: number };

export function ProductsTable() {
  const { canWrite } = usePanelPreferences();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const { data, error, loading, reload } = useRemote<ProductsResponse>(
    `/api/woo/products?${new URLSearchParams({ page: String(page), per_page: "20", search: debouncedSearch })}`, "Unable to load products.");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const items = data?.products || [];

  async function saveStock(product: WooProduct, raw: string) {
    if (!canWrite) return;
    // Leaving the field without a change must not write to WooCommerce.
    if (raw === String(product.stock_quantity ?? "")) return;
    const value = Number(raw);
    if (raw === "" || !Number.isSafeInteger(value) || value < 0) {
      setResult({ tone: "error", message: `Enter a non-negative whole number for ${product.name}.` });
      return;
    }
    if (!product.manage_stock && !window.confirm(`Enable stock management for "${product.name}" and set its quantity to ${value}? This changes how the store tracks availability.`)) return;
    setSavingId(product.id);
    setResult(null);
    try {
      const updated = await fetchJson<WooProduct>(`/api/woo/products/${product.id}`, { method: "PATCH", json: { stock_quantity: value, ...(!product.manage_stock ? { enable_stock_management: true } : {}) } });
      setResult({ tone: "success", message: `${product.name}: stock saved as ${updated.stock_quantity ?? value}.` });
    } catch (cause) {
      setResult({ tone: "error", message: `${product.name}: ${errorMessage(cause, "Stock update failed.")}` });
    } finally {
      setSavingId(null);
      reload();
    }
  }

  return <div className="space-y-4">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" aria-label="Search products" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search products..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" />
    </div>
    {result && <Notice tone={result.tone}>{result.message}</Notice>}
    {error && data && <Notice tone="error" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded products. {error}</Notice>}
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {!data ? (loading ? <LoadingState label="Loading products…" /> : <ErrorState message={error || "Unable to load products."} onRetry={reload} busy={loading} />)
        : items.length === 0 ? <EmptyState icon={Package} title="No products found" />
        : <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}><table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Status</th></tr></thead>
          <tbody className="divide-y">{items.map(product => <tr key={product.id}>
            <td className="px-5 py-4"><div className="flex min-w-48 items-center gap-3"><ProductThumbnail key={product.images?.[0]?.src || product.id} src={product.images?.[0]?.src} alt={product.images?.[0]?.alt || product.name} /><span className="font-medium">{product.name}</span></div></td>
            <td className="px-5 py-4 text-muted-foreground">{product.sku || "—"}</td>
            <td className="px-5 py-4">{product.price || "—"}</td>
            <td className="px-5 py-4"><div className="flex items-center gap-2">
              <input type="number" key={`${product.id}-${product.stock_quantity}`} aria-label={`Stock quantity for ${product.name}`} min="0" step="1"
                defaultValue={product.stock_quantity ?? ""} placeholder={product.manage_stock ? "" : "Not managed"} disabled={!canWrite || savingId !== null}
                onBlur={event => saveStock(product, event.target.value.trim())}
                onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}
                className="h-9 w-28 rounded-md border px-2 disabled:opacity-60" />
              {savingId === product.id && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />}
            </div></td>
            <td className="px-5 py-4"><span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize">{product.stock_status.replace("-", " ")}</span></td>
          </tr>)}</tbody>
        </table></div>}
      {data && <ListPagination page={page} pages={data.pages} total={data.total} busy={loading} onPage={setPage} />}
    </div>
  </div>;
}
