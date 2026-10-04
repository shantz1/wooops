import { AppShell } from "@/components/app-shell";
import { ProductsTable } from "@/components/products-table";
export default function InventoryPage(){return <AppShell><div className="space-y-6"><div><p className="text-sm text-muted-foreground">Stock operations</p><h1 className="mt-1 text-2xl font-semibold">Inventory</h1><p className="mt-1 text-sm text-muted-foreground">Track quantities, spot availability issues and replenish stock. Edit catalogue content under Products.</p></div><ProductsTable inventory/></div></AppShell>}
