import { AddProductAction } from "@/components/add-product-action";
import { AppShell } from "@/components/app-shell";
import { ProductsTable } from "@/components/products-table";
import { ProductNavigation } from "@/components/product-navigation";

export default function ProductsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <ProductNavigation />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Workspace</p>
            <h1 className="mt-1 text-2xl font-semibold">Products</h1>
            <p className="mt-1 text-sm text-muted-foreground">Search your catalogue. Open a product to edit its content, images, options and pricing.</p>
          </div>
          <AddProductAction />
        </div>
        <ProductsTable />
      </div>
    </AppShell>
  );
}
