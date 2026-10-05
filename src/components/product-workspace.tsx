"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRemote } from "@/lib/use-remote";
import { fetchJson, errorMessage } from "@/lib/fetch-json";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ProductThumbnail } from "@/components/product-thumbnail";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ProductNavigation } from "@/components/product-navigation";
import { CatalogCollection } from "@/components/catalog-collection";
import { ProductVariations } from "@/components/product-variations";
import { ErrorState, LoadingState, Notice } from "@/components/ui/feedback";
import type { ProductDetails } from "@/lib/product-details";
import type { CatalogResponse } from "@/lib/catalog";

const control = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2";
const tabs = ["Details", "Images", "Options", "Stock & shipping", "Connections", "Reviews"];
export function ProductWorkspace({ id }: { id: string }) {
  const [revision, setRevision] = useState(0);
  const { data, loading, error, reload } = useRemote<ProductDetails>("/api/woo/products/" + id, "Unable to load product.");
  return <div className="space-y-6"><ProductNavigation />{!data ? loading ? <LoadingState label="Loading product…" /> : <ErrorState message={error} onRetry={reload} /> : <>
    {error && <Notice tone="error">{error}</Notice>}<ProductEditor key={data.id + "-" + data.date_modified_gmt + "-" + revision} product={data} onReload={() => { setRevision(value => value + 1); reload(); }} />
  </>}</div>;
}

function ProductEditor({ product, onReload }: { product: ProductDetails; onReload: () => void }) {
  const { can } = usePanelPreferences();
  const canWrite = can("products.edit");
  const canStock = can("inventory.edit");
  const [draft, setDraft] = useState(product), [tab, setTab] = useState(tabs[0]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const [imageUrl, setImageUrl] = useState(""), [baseline, setBaseline] = useState(product);
  const categories = useRemote<CatalogResponse>(tab === "Details" ? "/api/woo/catalog?resource=categories&per_page=100" : null, "Unable to load categories.");
  const shipping = useRemote<CatalogResponse>(tab === "Stock & shipping" ? "/api/woo/catalog?resource=shipping&per_page=100" : null, "Unable to load shipping classes.");
  const update = <K extends keyof ProductDetails>(key: K, value: ProductDetails[K]) => { setDraft(current => ({ ...current, [key]: value })); setSaved(false); };
  const keys = ["name", "status", "sku", "regular_price", "sale_price", "description", "short_description", "catalog_visibility", "featured", "manage_stock", "stock_quantity", "stock_status", "backorders", "sold_individually", "weight", "dimensions", "shipping_class", "images", "categories", "attributes", "upsell_ids", "cross_sell_ids", "grouped_products", "purchase_note", "reviews_allowed", "menu_order", "virtual"] as const;
  const changed = keys.filter(key => JSON.stringify(draft[key]) !== JSON.stringify(baseline[key]));
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.href === window.location.href || anchor.getAttribute("href") === "#main") return;
      if (!window.confirm("Discard unsaved product changes and leave this page?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!canWrite || !changed.length) return;
    if (imageUrl.trim()) { setError("Add the image URL to the gallery before saving."); return; }
    if (changed.includes("attributes") && product.type === "variable" && !window.confirm("Changing variation options can affect existing variants. Save these product options?")) return;
    if (changed.includes("manage_stock") && !window.confirm((draft.manage_stock ? "Enable" : "Disable") + " stock management for this product?")) return;
    const details = Object.fromEntries(changed.map(key => [key, key === "images" ? draft.images.map(image => image.id > 0 ? { id: image.id, alt: image.alt } : { src: image.src, alt: image.alt }) : key === "categories" ? draft.categories.map(category => ({ id: category.id })) : draft[key]]));
    setBusy(true); setError("");
    try { const result = await fetchJson<ProductDetails>("/api/woo/products/" + product.id, { method: "PATCH", json: { details, modified: baseline.date_modified_gmt } }); setDraft(result); setBaseline(result); setSaved(true); }
    catch (cause) { setError(errorMessage(cause, "Unable to save product.")); } finally { setBusy(false); }
  }
  const text = (key: keyof ProductDetails, label: string, multiline = false, maxLength = 200) => <label className="block text-sm font-medium">{label}{multiline ? <textarea rows={5} maxLength={maxLength} value={String(draft[key] ?? "")} onChange={e => update(key, e.target.value as never)} className={control} /> : <input maxLength={maxLength} value={String(draft[key] ?? "")} onChange={e => update(key, e.target.value as never)} className={control} />}</label>;
  const select = (key: keyof ProductDetails, label: string, choices: string[][]) => <label className="block text-sm font-medium">{label}<select value={String(draft[key] ?? "")} onChange={e => update(key, e.target.value as never)} className={control}>{choices.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>;
  const check = (key: keyof ProductDetails, label: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft[key])} onChange={e => update(key, e.target.checked as never)} />{label}</label>;
  const section = (title: string, content: ReactNode) => <section className="space-y-4 rounded-xl border bg-background p-5 sm:p-6"><h2 className="font-semibold">{title}</h2>{content}</section>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><ProductThumbnail key={draft.images?.[0]?.src} src={draft.images?.[0]?.src} alt={draft.name} size={56} /><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{product.type} · #{product.id}</p><h1 className="mt-1 text-2xl font-semibold">{baseline.name}</h1><p className="mt-1 text-sm text-muted-foreground">{baseline.total_sales || 0} sold · Rating {baseline.average_rating || "—"} · {baseline.status}</p></div></div><button type="button" disabled={busy} onClick={() => { if (!changed.length || window.confirm("Discard unsaved product changes and reload?")) onReload(); }} className="rounded-lg border px-3 py-2 text-sm">Reload</button></div>
    <nav aria-label="Product sections" className="flex flex-wrap gap-2">{tabs.map(name => <button key={name} type="button" onClick={() => setTab(name)} aria-current={tab === name ? "page" : undefined} className={"rounded-lg px-3 py-2 text-sm " + (tab === name ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground")}>{name}</button>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}{saved && <Notice tone="success">Product saved.</Notice>}
    {tab === "Reviews" ? <CatalogCollection resource="reviews" product={product.id} /> : <form onSubmit={save} className="space-y-5">
      <fieldset disabled={!canWrite || busy} className="space-y-5">
        {tab === "Details" && <>
          {section("Catalogue details", <>{text("name", "Product name")}<div className="grid gap-4 sm:grid-cols-2">{select("status", "Publishing", [["draft", "Draft"], ["pending", "Pending review"], ["private", "Private"], ["publish", "Published"]])}{select("catalog_visibility", "Catalogue visibility", [["visible", "Shop and search"], ["catalog", "Shop only"], ["search", "Search only"], ["hidden", "Hidden"]])}</div>{check("featured", "Featured product")}</>)}
          {section("Description", <RichTextEditor label="Description" value={draft.description} onChange={value => update("description", value)} disabled={!canWrite || busy} help="Up to 10,000 characters including formatting." />)}
          {section("Short description", <RichTextEditor label="Short description" value={draft.short_description} onChange={value => update("short_description", value)} disabled={!canWrite || busy} minHeight="8rem" help="Up to 5,000 characters including formatting." />)}
          {section("Pricing", product.type === "variable" ? <p className="text-sm text-muted-foreground">Prices belong to each variation. Open Options to edit them.</p> : <div className="grid gap-4 sm:grid-cols-2">{text("regular_price", "Regular price", false, 30)}{text("sale_price", "Sale price (empty for none)", false, 30)}</div>)}
          {section("Categories", <>{categories.error && <Notice tone="error">{categories.error}<button type="button" onClick={categories.reload} className="ml-2 underline">Retry</button></Notice>}{categories.loading && !categories.data && <LoadingState />}{categories.data && <div className="grid gap-2 sm:grid-cols-2">{categories.data.items.map(category => <label key={category.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.categories.some(c => c.id === category.id)} onChange={e => update("categories", e.target.checked ? [...draft.categories, { id: category.id, name: category.name }] : draft.categories.filter(c => c.id !== category.id))} />{category.name}</label>)}</div>}{categories.data && categories.data.pages > 1 && <p className="text-xs text-muted-foreground">Showing the first 100 categories. Other existing selections are preserved.</p>}</>)}
          {section("Purchase preferences", <><RichTextEditor label="Note shown to buyers after purchase" value={draft.purchase_note} onChange={value => update("purchase_note", value)} disabled={!canWrite || busy} minHeight="8rem" help="Up to 5,000 characters including formatting." />{check("reviews_allowed", "Allow product reviews")}<label className="block text-sm">Display order<input type="number" min={0} max={100000} value={draft.menu_order || 0} onChange={e => update("menu_order", Number(e.target.value))} className={control} /></label></>)}
        </>}
        {tab === "Images" && section("Product images", <><p className="text-sm text-muted-foreground">The first image is the main image. Paste existing Media Library URLs from this store.</p><div className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Image URL<input type="url" maxLength={2048} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://your-store.com/wp-content/uploads/…" className={control} /></label><ProductThumbnail key={imageUrl} src={imageUrl} alt="New image preview" size={56} /><button type="button" disabled={!imageUrl.trim() || draft.images.length >= 20} onClick={() => { const src = imageUrl.trim(); if (!/^https?:\/\//i.test(src)) { setError("Enter a full image URL."); return; } if (!draft.images.some(i => i.src === src)) update("images", [...draft.images, { id: 0, src, alt: "" }]); setImageUrl(""); }} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Add image</button></div><ul className="space-y-3">{draft.images.map((image, index) => <li key={image.id + "-" + image.src + "-" + index} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"><ProductThumbnail src={image.src} alt={image.alt || draft.name} size={64} /><div className="min-w-40 flex-1"><p className="text-xs font-medium text-primary">{index === 0 ? "Main image" : "Gallery image " + index}</p><label className="text-xs">Alternative text<input maxLength={200} value={image.alt} onChange={e => update("images", draft.images.map((i, n) => n === index ? { ...i, alt: e.target.value } : i))} className={control} /></label></div><div className="flex gap-3 text-sm">{index > 0 && <button type="button" onClick={() => update("images", [image, ...draft.images.filter((_, n) => n !== index)])} className="rounded-lg border px-3 py-2">Make main</button>}<button type="button" onClick={() => update("images", draft.images.filter((_, n) => n !== index))} className="rounded-lg border px-3 py-2 text-destructive">Remove</button></div></li>)}</ul><p className="text-xs text-muted-foreground">Changes apply only when you save. Removing every image leaves the product without an image.</p></>)}
        {tab === "Options" && section("Product options", <><p className="text-sm text-muted-foreground">Use one option per line. Existing global attributes keep their store IDs.</p>{draft.attributes.map((attribute, index) => <div key={index} className="space-y-3 rounded-lg border p-4"><label className="block text-sm">Attribute name<input value={attribute.name} readOnly={attribute.id > 0} maxLength={200} onChange={e => update("attributes", draft.attributes.map((a, n) => n === index ? { ...a, name: e.target.value } : a))} className={control} /></label><label className="block text-sm">Options<textarea rows={3} value={attribute.options.join("\n")} onChange={e => update("attributes", draft.attributes.map((a, n) => n === index ? { ...a, options: e.target.value.split("\n") } : a))} className={control} /></label><div className="flex flex-wrap gap-4">{(["visible", "variation"] as const).map(key => <label key={key} className="flex gap-2 text-sm"><input type="checkbox" checked={attribute[key]} onChange={e => update("attributes", draft.attributes.map((a, n) => n === index ? { ...a, [key]: e.target.checked } : a))} />{key === "visible" ? "Show on product page" : "Use for variations"}</label>)}<button type="button" onClick={() => update("attributes", draft.attributes.filter((_, n) => n !== index))} className="text-sm text-destructive">Remove attribute</button></div></div>)}<button type="button" onClick={() => update("attributes", [...draft.attributes, { id: 0, name: "", position: draft.attributes.length, visible: true, variation: false, options: [] }])} className="rounded-lg border px-4 py-2 text-sm">Add product attribute</button></>)}
        {tab === "Stock & shipping" && <>
          {section("Stock controls", <>{text("sku", "SKU")}<fieldset disabled={!canStock} className="space-y-5">{!canStock && <p className="text-xs text-muted-foreground">Your role cannot change stock settings.</p>}{check("manage_stock", "Track stock quantity")}{draft.manage_stock && <label className="block text-sm">Quantity<input required type="number" min={0} step={1} value={draft.stock_quantity ?? ""} onChange={e => update("stock_quantity", e.target.value === "" ? null : Number(e.target.value))} className={control} /></label>}<div className="grid gap-4 sm:grid-cols-2">{select("stock_status", "Availability", [["instock", "In stock"], ["outofstock", "Out of stock"], ["onbackorder", "On backorder"]])}{select("backorders", "Backorders", [["no", "Do not allow"], ["notify", "Allow and notify customer"], ["yes", "Allow"]])}</div></fieldset>{check("sold_individually", "Limit to one per order")}</>)}
          {section("Shipping", <>{check("virtual", "Virtual product (no shipping)")}{text("weight", "Weight (store unit)", false, 30)}<div className="grid gap-4 sm:grid-cols-3">{(["length", "width", "height"] as const).map(key => <label key={key} className="text-sm capitalize">{key}<input maxLength={30} value={draft.dimensions?.[key] || ""} onChange={e => update("dimensions", { ...draft.dimensions, [key]: e.target.value })} className={control} /></label>)}</div><label className="block text-sm">Shipping class<select value={draft.shipping_class || ""} onChange={e => update("shipping_class", e.target.value)} className={control}><option value="">No shipping class</option>{shipping.data?.items.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}{draft.shipping_class && !shipping.data?.items.some(i => i.slug === draft.shipping_class) && <option value={draft.shipping_class}>{draft.shipping_class}</option>}</select></label>{shipping.error && <Notice tone="error">{shipping.error}<button type="button" onClick={shipping.reload} className="ml-2 underline">Retry</button></Notice>}</>)}
        </>}
        {tab === "Connections" && section("Related catalogue items", <><p className="text-sm text-muted-foreground">Enter product IDs separated by commas. IDs are shown in the catalogue.</p>{(["upsell_ids", "cross_sell_ids", ...(product.type === "grouped" ? ["grouped_products"] : [])] as Array<"upsell_ids" | "cross_sell_ids" | "grouped_products">).map(key => <IdList key={key} title={key === "upsell_ids" ? "Suggested upgrades" : key === "cross_sell_ids" ? "Frequently bought together" : "Grouped products"} values={draft[key] || []} onChange={value => update(key, value)} />)}</>)}
      </fieldset>
      {changed.length > 0 && <details className="rounded-xl border bg-background p-4"><summary className="cursor-pointer text-sm font-medium">Review changes before saving</summary><dl className="mt-4 space-y-4">{changed.map(key => <div key={key}><dt className="text-sm font-medium capitalize">{key.replaceAll("_", " ")}</dt><dd className="mt-1 grid gap-2 text-xs sm:grid-cols-2"><div className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border p-3"><span className="mb-1 block text-muted-foreground">Current</span>{displayChange(key, baseline[key])}</div><div className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border p-3"><span className="mb-1 block text-primary">New</span>{displayChange(key, draft[key])}</div></dd></div>)}</dl></details>}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-sm"><p className="text-sm text-muted-foreground">{canWrite ? changed.length ? changed.length + " fields changed" : "No unsaved changes" : "Read-only access"}</p><div className="flex gap-3"><Link href="/products" className="rounded-lg border px-4 py-2 text-sm">Catalogue</Link><button disabled={!canWrite || busy || !changed.length} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save product"}</button></div></div>
    </form>}
    {tab === "Options" && product.type === "variable" && <ProductVariations product={baseline} />}
  </div>;
}

function displayChange(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (!value.length) return "None";
    if (key === "images") return value.map(image => image.src + (image.alt ? " — " + image.alt : "")).join("\n");
    if (key === "categories") return value.map(category => category.name || "#" + category.id).join(", ");
    if (key === "attributes") return value.map(attribute => attribute.name + ": " + attribute.options.join(", ")).join("\n");
    return value.join(", ");
  }
  if (typeof value === "object") return Object.entries(value).map(([name, item]) => name + ": " + item).join("\n");
  return String(value);
}

function IdList({ title, values, onChange }: { title: string; values: number[]; onChange: (value: number[]) => void }) {
  const [raw, setRaw] = useState(values.join(", "));
  return <label className="block text-sm">{title}<input value={raw} onChange={e => { setRaw(e.target.value); onChange(e.target.value.trim() ? e.target.value.split(",").map(v => Number(v.trim())) : []); }} className={control} /></label>;
}
