import { AppShell } from "@/components/app-shell";
import { ProductWorkspace } from "@/components/product-workspace";
import { ProductNavigation } from "@/components/product-navigation";
import { CatalogCollection } from "@/components/catalog-collection";
import { ProductsTable } from "@/components/products-table";
import { notFound } from "next/navigation";
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (["categories", "attributes", "reviews", "variations"].includes(id)) return <AppShell><div className="space-y-6"><ProductNavigation /><div><h1 className="text-2xl font-semibold capitalize">{id}</h1><p className="mt-1 text-sm text-muted-foreground">{id === "variations" ? "Choose a variable product to manage its options and variants." : "Manage your store catalogue."}</p></div>{id === "variations" ? <ProductsTable productType="variable" /> : <CatalogCollection resource={id as "categories" | "attributes" | "reviews"} />}</div></AppShell>;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <AppShell><ProductWorkspace key={id} id={id} /></AppShell>;
}
