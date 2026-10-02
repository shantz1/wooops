import { AppShell } from "@/components/app-shell";
import { OrdersTable } from "@/components/orders-table";
export default function OrdersPage(){return <AppShell><div className="space-y-6"><div><p className="text-sm font-medium text-primary">Workspace</p><h1 className="mt-1 text-2xl font-semibold">Orders</h1><p className="mt-1 text-sm text-muted-foreground">Search orders, manage fulfilment and keep customers informed.</p></div><OrdersTable/></div></AppShell>}
