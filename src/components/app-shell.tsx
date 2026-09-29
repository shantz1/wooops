"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Boxes, ChevronDown, LayoutDashboard, Package, Settings, ShoppingCart, Users } from "lucide-react";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Boxes },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-5">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="grid size-8 place-items-center rounded-lg bg-foreground text-background">W</div>
            <span>WooOps</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspace</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <p className="px-3 pb-2 pt-7 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">System</p>
          <Link href="/settings" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${pathname.startsWith("/settings") ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}>
            <Settings className="size-4" /> Settings
          </Link>
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">S</div>
              <div className="min-w-0"><p className="truncate text-sm font-medium">Store Admin</p><p className="truncate text-xs text-muted-foreground">WooCommerce</p></div>
            </div>
            <ChevronDown className="size-4 text-muted-foreground" />
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-5 backdrop-blur lg:px-8">
          <div><p className="text-sm font-medium">Operations</p><p className="text-xs text-muted-foreground">WooCommerce control center</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" /> Connected</div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
