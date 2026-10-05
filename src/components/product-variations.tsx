"use client";
import { useState, type FormEvent } from "react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { useRemote } from "@/lib/use-remote";
import { fetchJson, errorMessage } from "@/lib/fetch-json";
import type { CatalogItem, CatalogResponse } from "@/lib/catalog";
import type { ProductDetails } from "@/lib/product-details";
import { ListPagination } from "@/components/list-pagination";
import { ErrorState, LoadingState, EmptyState, Notice } from "@/components/ui/feedback";

export function ProductVariations({ product }: { product: ProductDetails }) {
  const { can } = usePanelPreferences();
  const canWrite = can("products.edit");
  const canStock = can("inventory.edit");
  const [page, setPage] = useState(1), [edit, setEdit] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { data, loading, error: loadError, reload } = useRemote<CatalogResponse>("/api/woo/catalog?resource=variations&parent=" + product.id + "&page=" + page, "Unable to load variations.");
  const options = product.attributes.filter(attribute => attribute.variation);
  const control = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit || !canWrite) return;
    const form = new FormData(event.currentTarget);
    const managed = canStock ? form.get("manage_stock") === "on" : Boolean(edit.manage_stock);
    if (canStock && edit.id && managed !== Boolean(edit.manage_stock) && !window.confirm((managed ? "Enable" : "Disable") + " stock management for this variation?")) return;
    const body = { sku: String(form.get("sku")), regular_price: String(form.get("regular_price")), sale_price: String(form.get("sale_price")), status: String(form.get("status")), ...(canStock ? { manage_stock: managed, ...(managed ? { stock_quantity: Number(form.get("stock_quantity")) } : {}) } : {}),
      ...(!edit.id ? { attributes: options.map(attribute => ({ id: attribute.id, name: attribute.name, option: String(form.get("attribute-" + attribute.id + "-" + attribute.name)) })) } : {}) };
    setBusy(true); setError("");
    try { await fetchJson("/api/woo/catalog?resource=variations&parent=" + product.id + (edit.id ? "&id=" + edit.id : ""), { method: edit.id ? "PATCH" : "POST", json: body }); setEdit(null); reload(); }
    catch (cause) { setError(errorMessage(cause, "Unable to save variation.")); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-background p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Variations</h2><p className="mt-1 text-sm text-muted-foreground">Edit each variant independently. Save product options above before adding a variant.</p></div>{canWrite && <button disabled={!options.length} type="button" onClick={() => { setEdit({ id: 0, name: "" }); setError(""); }} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Add variation</button>}</div>
    {error && <Notice tone="error">{error}</Notice>}
    {edit && <form key={edit.id} onSubmit={save} className="space-y-4 rounded-lg border p-4"><h3 className="font-medium">{edit.id ? "Variation #" + edit.id : "New variation"}</h3>
      <fieldset disabled={busy} className="space-y-4">
        {!edit.id && options.map(attribute => <label key={attribute.id + "-" + attribute.name} className="block text-sm">{attribute.name}<select name={"attribute-" + attribute.id + "-" + attribute.name} required className={control}><option value="">Choose an option</option>{attribute.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}
        <div className="grid gap-4 sm:grid-cols-3">{["sku", "regular_price", "sale_price"].map(key => <label key={key} className="block text-sm">{key === "sku" ? "SKU" : key === "regular_price" ? "Regular price" : "Sale price"}<input name={key} maxLength={key === "sku" ? 100 : 30} defaultValue={String(edit[key as "sku" | "regular_price" | "sale_price"] || "")} className={control} /></label>)}</div>
        <label className="flex gap-2 text-sm"><input name="manage_stock" type="checkbox" disabled={!canStock} defaultChecked={edit.manage_stock} />Track stock quantity{!canStock && <span className="text-xs text-muted-foreground">(your role cannot change stock)</span>}</label>
        <label className="block text-sm">Quantity (used when tracking stock)<input name="stock_quantity" type="number" min={0} step={1} disabled={!canStock} defaultValue={edit.stock_quantity ?? 0} className={control} /></label>
        <label className="block text-sm">Visibility<select name="status" defaultValue={edit.status || "private"} className={control}><option value="private">Disabled</option><option value="publish">Enabled</option></select></label>
      </fieldset><div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{busy ? "Saving…" : "Save variation"}</button><button disabled={busy} type="button" onClick={() => setEdit(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button></div>
    </form>}
    {loadError && data && <Notice tone="error">{loadError}<button onClick={reload} className="ml-2 underline">Retry</button></Notice>}
    {!data ? loading ? <LoadingState /> : <ErrorState message={loadError} onRetry={reload} /> : <>
      {!data.items.length ? <EmptyState title="No variations yet" /> : <ul className="divide-y">{data.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-medium">{item.attributes?.map(attribute => attribute.name + ": " + (attribute.option || "Any")).join(" · ") || "Variation #" + item.id}</p><p className="mt-1 text-xs text-muted-foreground">#{item.id} · {item.sku || "No SKU"} · Price {item.regular_price || "Not set"} · {item.manage_stock ? item.stock_quantity + " in stock" : "Quantity not tracked"} · {item.status}</p></div>{canWrite && <button type="button" onClick={() => setEdit(item)} className="rounded-lg border px-3 py-2 text-sm">Edit variation</button>}</li>)}</ul>}
      <ListPagination page={page} pages={data.pages} total={data.total} busy={loading} onPage={setPage} />
    </>}
  </section>;
}
