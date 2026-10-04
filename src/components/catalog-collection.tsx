"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePanelPreferences } from "@/components/panel-preferences";
import { useRemote, useDebouncedValue } from "@/lib/use-remote";
import { fetchJson, errorMessage } from "@/lib/fetch-json";
import { plainText } from "@/lib/format";
import { ListPagination } from "@/components/list-pagination";
import { LoadingState, ErrorState, EmptyState, Notice } from "@/components/ui/feedback";
import type { CatalogItem, CatalogResponse, CatalogResource } from "@/lib/catalog";

export function CatalogCollection({ resource, parent, product }: { resource: CatalogResource; parent?: number; product?: number }) {
  const { canWrite } = usePanelPreferences();
  const [page, setPage] = useState(1), [search, setSearch] = useState("");
  const query = new URLSearchParams({ resource, page: String(page), search: useDebouncedValue(search) });
  if (parent) query.set("parent", String(parent)); if (product) query.set("product", String(product));
  const { data, loading, error, reload } = useRemote<CatalogResponse>(`/api/woo/catalog?${query}`, "Unable to load this catalogue section.");
  const [edit, setEdit] = useState<CatalogItem | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [terms, setTerms] = useState<CatalogItem | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!edit || !canWrite) return;
    const form = new FormData(event.currentTarget);
    const body = resource === "attributes" ? { name: String(form.get("name")), slug: String(form.get("slug")), type: "select", order_by: String(form.get("order_by")), has_archives: form.get("has_archives") === "on" } :
      { name: String(form.get("name")), slug: String(form.get("slug")), description: String(form.get("description")), ...(resource === "categories" ? { parent: Number(form.get("parent")) } : {}) };
    setBusy(true); setMessage("");
    try { await fetchJson(`/api/woo/catalog?${new URLSearchParams({ resource, ...(parent ? { parent: String(parent) } : {}), ...(edit.id ? { id: String(edit.id) } : {}) })}`, { method: edit.id ? "PATCH" : "POST", json: body }); setEdit(null); reload(); }
    catch (cause) { setMessage(errorMessage(cause, "Save failed.")); } finally { setBusy(false); }
  }
  async function moderate(item: CatalogItem, status: string) {
    setBusy(true); setMessage("");
    try { await fetchJson(`/api/woo/catalog?resource=reviews&id=${item.id}`, { method: "PATCH", json: { status } }); reload(); }
    catch (cause) { setMessage(errorMessage(cause, "Review update failed.")); } finally { setBusy(false); }
  }
  const editable = ["categories", "attributes", "terms"].includes(resource);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3"><input aria-label={`Search ${resource}`} type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={`Search ${resource}…`} className="h-10 min-w-48 flex-1 rounded-lg border bg-background px-3 text-sm" />
      {editable && canWrite && <button className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" onClick={() => { setEdit({ id: 0, name: "" }); setMessage(""); }}>Add {resource === "categories" ? "category" : resource === "attributes" ? "attribute" : "term"}</button>}
    </div>
    {message && <Notice tone="error">{message}</Notice>}
    {edit && <form key={edit.id} onSubmit={save} className="space-y-4 rounded-xl border bg-background p-5">
      <h2 className="font-semibold">{edit.id ? "Edit" : "New"} {resource === "categories" ? "category" : resource === "attributes" ? "attribute" : "term"}</h2>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input name="name" required maxLength={200} defaultValue={edit.name} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label><label className="text-sm">Slug<input name="slug" maxLength={200} defaultValue={edit.slug || ""} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label></div>
      {resource === "attributes" ? <><label className="block text-sm">Sort terms<select name="order_by" defaultValue={edit.order_by || "menu_order"} className="ml-3 rounded-lg border bg-background p-2"><option value="menu_order">Custom order</option><option value="name">Name</option><option value="name_num">Numeric name</option><option value="id">ID</option></select></label><label className="flex gap-2 text-sm"><input type="checkbox" name="has_archives" defaultChecked={edit.has_archives} />Enable attribute archives</label></> : <><label className="block text-sm">Description<textarea name="description" maxLength={5000} rows={3} defaultValue={edit.description || ""} className="mt-1 w-full rounded-lg border bg-background p-3" /></label>{resource === "categories" && <label className="block text-sm">Parent category ID (0 for none)<input name="parent" type="number" min={0} step={1} defaultValue={edit.parent || 0} className="ml-3 w-28 rounded-lg border bg-background p-2" /></label>}</>}
      <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save"}</button><button type="button" disabled={busy} onClick={() => setEdit(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button></div>
    </form>}
    {error && data && <Notice tone="error">{error}<button onClick={reload} className="ml-3 underline">Retry</button></Notice>}
    {!data ? loading ? <LoadingState /> : <ErrorState message={error} onRetry={reload} /> : <div className="overflow-hidden rounded-xl border bg-background">
      {!data.items.length ? <EmptyState title={`No ${resource} found`} /> : <ul className="divide-y">{data.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1"><p className="font-medium">{resource === "reviews" ? item.product_name || `Product #${item.product_id}` : item.name}</p>
          {resource === "reviews" ? <><p className="mt-1 text-sm">{plainText(item.review || "")}</p><p className="mt-2 text-xs text-muted-foreground">{item.reviewer} · {item.rating}/5 · {item.status}</p></> : <p className="mt-1 text-sm text-muted-foreground">#{item.id} · {item.slug}{item.count !== undefined && ` · ${item.count} products`}</p>}
        </div>
        <div className="flex gap-3 text-sm">{editable && canWrite && <button onClick={() => { setEdit(item); setMessage(""); }} className="rounded-lg border px-3 py-2">Edit</button>}
          {resource === "attributes" && <button onClick={() => setTerms(terms?.id === item.id ? null : item)} className="rounded-lg border px-3 py-2">Terms</button>}
          {resource === "reviews" && <>{item.product_id && <Link href={`/products/${item.product_id}`} className="rounded-lg border px-3 py-2">Product</Link>}{canWrite && <select aria-label={`Moderate review ${item.id}`} value={item.status} disabled={busy} onChange={e => moderate(item, e.target.value)} className="rounded-lg border bg-background p-2"><option value="approved">Approved</option><option value="hold">Pending</option><option value="spam">Spam</option></select>}</>}
        </div>
      </li>)}</ul>}
      <ListPagination page={page} pages={data.pages} total={data.total} busy={loading} onPage={setPage} />
    </div>}
    {terms && <section className="space-y-3 rounded-xl border bg-muted/30 p-5"><h2 className="font-semibold">{terms.name} terms</h2><CatalogCollection key={terms.id} resource="terms" parent={terms.id} /></section>}
  </div>;
}
