import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ProductsTable } from "@/components/products-table";

export default function ProductsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">Browse your catalogue and keep stock up to date.</p>
          </div>
          <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Plus className="size-4" /> Add product
          </Link>
        </div>
        <ProductsTable />
      </div>
    </AppShell>
  );
}
