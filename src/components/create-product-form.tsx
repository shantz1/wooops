"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProductThumbnail } from "@/components/product-thumbnail";

export function CreateProductForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [status, setStatus] = useState<"draft" | "publish">("draft");
  const [manageStock, setManageStock] = useState(false);
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !/^\d+(?:\.\d{1,2})?$/.test(price) ||
        (manageStock && (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock))))) {
      setError("Enter a name, a non-negative price, and a whole stock quantity when stock is managed.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/woo/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim(),
          regular_price: price,
          description: description.trim(),
          image_url: imageUrl.trim(),
          status,
          manage_stock: manageStock,
          ...(manageStock ? { stock_quantity: Number(stock) } : {}),
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not create product.");
      }
      router.push("/products");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/products" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to products</Link>
        <h1 className="mt-4 text-2xl font-semibold">Add a simple product</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a draft first, then publish it when ready. Store remains the source of truth.</p>
      </div>
      <form onSubmit={submit} className="space-y-5 rounded-xl border bg-background p-6 shadow-sm">
        <label className="block text-sm font-medium">Product name
          <input required maxLength={200} value={name} onChange={event => setName(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium">Regular price
            <input required inputMode="decimal" placeholder="0.00" value={price} onChange={event => setPrice(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <label className="block text-sm font-medium">SKU <span className="text-muted-foreground">(optional)</span>
            <input maxLength={100} value={sku} onChange={event => setSku(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
        </div>
        <label className="block text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span>
          <textarea rows={4} value={description} onChange={event => setDescription(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3" />
        </label>
        <div className="flex items-end gap-4">
          <label className="block flex-1 text-sm font-medium">Product image URL <span className="text-muted-foreground">(optional)</span>
            <input type="url" placeholder="https://your-store.com/wp-content/uploads/..." value={imageUrl} onChange={event => setImageUrl(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <ProductThumbnail key={imageUrl} src={imageUrl.trim()} alt="Product image preview" size={56} />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">Use an existing Media Library image URL from this store. Direct file upload is not available yet.</p>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={manageStock} onChange={event => setManageStock(event.target.checked)} /> Manage stock
        </label>
        {manageStock && <label className="block text-sm font-medium">Stock quantity
          <input required type="number" min="0" step="1" value={stock} onChange={event => setStock(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
        </label>}
        <label className="block text-sm font-medium">Visibility
          <select value={status} onChange={event => setStatus(event.target.value as "draft" | "publish")} className="mt-2 h-10 w-full rounded-lg border bg-background px-3">
            <option value="draft">Draft</option>
            <option value="publish">Published</option>
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-3 border-t pt-5">
          <Link href="/products" className="inline-flex h-10 items-center rounded-lg border px-4 text-sm">Cancel</Link>
          <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" />} Create product
          </button>
        </div>
      </form>
    </div>
  );
}
