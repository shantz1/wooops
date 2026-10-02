"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Boxes, LayoutDashboard, Loader2, LogOut, Menu, Package, Settings, ShoppingCart, Users, X } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const link = (href: string, label: string, Icon: typeof Settings) => {
    const active = isActive(pathname, href);
    return (
      <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${focusRing} ${active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </Link>
    );
  };
  return (
    <>
      <p className="px-3 pb-2 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspace</p>
      {navigation.map(item => link(item.href, item.label, item.icon))}
      <p className="px-3 pb-2 pt-7 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">System</p>
      {link("/settings", "Settings", Settings)}
    </>
  );
}

function Brand() {
  const { preferences } = usePanelPreferences();
  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight">
      <Image src="/wo.svg" width={36} height={36} alt="" className="size-9 shrink-0 rounded-lg shadow-sm" />
      <span className="max-w-40 truncate">{preferences.name}</span>
    </div>
  );
}

function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.push("/login");
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }
  return (
    <div className="border-t p-3">
      <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold" aria-hidden="true">S</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">Store Admin</p>
            <p className="truncate text-xs text-muted-foreground">{failed ? "Sign out failed — retry" : "Operations workspace"}</p>
          </div>
        </div>
        <button type="button" onClick={signOut} disabled={busy} aria-label="Sign out" title="Sign out"
          className={`rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${focusRing}`}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = () => { menu.current?.showModal(); setMenuOpen(true); };
  const closeMenu = () => menu.current?.close();

  // The drawer is hidden at desktop width; close it there so a hidden modal never leaves the page inert.
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const close = () => { if (desktop.matches) menu.current?.close(); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <a href="#main" className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-5"><Brand /></div>
        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3"><NavLinks pathname={pathname} /></nav>
        <SignOut />
      </aside>

      {/* Mobile and tablet navigation. A modal <dialog> traps focus, closes on Escape and makes the page inert. */}
      <dialog ref={menu} id="mobile-navigation" aria-label="Navigation" onClose={() => setMenuOpen(false)}
        onClick={event => { if (event.target === menu.current) closeMenu(); }}
        className="m-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-r bg-background p-0 text-foreground backdrop:bg-black/40 lg:hidden">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b px-5">
            <Brand />
            <button type="button" onClick={closeMenu} aria-label="Close navigation" className={`rounded-md p-2 hover:bg-muted ${focusRing}`}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3"><NavLinks pathname={pathname} onNavigate={closeMenu} /></nav>
          <SignOut />
        </div>
      </dialog>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={openMenu} aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="mobile-navigation"
              className={`-ml-1 rounded-md p-2 hover:bg-muted lg:hidden ${focusRing}`}>
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0"><p className="truncate text-sm font-medium">Operations</p><p className="truncate text-xs text-muted-foreground">Your store, in focus</p></div>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">Store workspace</div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1500px] p-4 outline-none sm:p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
