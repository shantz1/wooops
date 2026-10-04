import { createRoot } from "react-dom/client";
import { Component, lazy, Suspense, type ReactNode } from "react";
import { LoadingState, ErrorState } from "@/components/ui/feedback";
const Home = lazy(() => import("@/app/page"));
const OrdersPage = lazy(() => import("@/app/orders/page"));
const ProductsPage = lazy(() => import("@/app/products/page"));
const NewProductPage = lazy(() => import("@/app/products/new/page"));
const CustomersPage = lazy(() => import("@/app/customers/page"));
const InventoryPage = lazy(() => import("@/app/inventory/page"));
const ReportsPage = lazy(() => import("@/app/reports/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));
import { AppShell } from "@/components/app-shell";
const OrderDetail = lazy(() => import("@/components/order-detail").then(module => ({ default: module.OrderDetail })));
const PackingSlip = lazy(() => import("@/components/packing-slip").then(module => ({ default: module.PackingSlip })));
import { PanelPreferencesProvider } from "@/components/panel-preferences";
import { EmptyState } from "@/components/ui/feedback";
import { HashRouter, useHashPath } from "./router";
import "./app.css";

/** Screens the plugin implements. Keep in sync with the `features` list printed by the PHP plugin. */
function Screen() {
  const path = useHashPath();
  if (path === "/") return <Home />;
  if (path === "/orders") return <OrdersPage />;
  if (path === "/products") return <ProductsPage />;
  if (path === "/products/new") return <NewProductPage />;
  if (path === "/customers") return <CustomersPage />;
  if (path === "/inventory") return <InventoryPage />;
  if (path === "/reports") return <ReportsPage />;
  if (path === "/settings") return <SettingsPage />;
  const slip = /^\/orders\/([1-9]\d*)\/packing-slip$/.exec(path);
  if (slip) return <PackingSlip key={slip[1]} id={slip[1]} />;
  const order = /^\/orders\/([1-9]\d*)$/.exec(path);
  if (order) return <AppShell><OrderDetail key={order[1]} id={order[1]} /></AppShell>;
  return (
    <AppShell>
      <EmptyState title="This screen is not available in the plugin yet">
        <a href="#/" className="underline underline-offset-2">Go to the overview</a>
      </EmptyState>
    </AppShell>
  );
}

class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <AppShell><ErrorState message="This screen could not load. Reload the panel to try again." onRetry={() => window.location.reload()} /></AppShell>
      : this.props.children;
  }
}

const root = document.getElementById("kartodesk-root");
if (root) {
  createRoot(root).render(
    <HashRouter>
      <PanelPreferencesProvider><ScreenErrorBoundary><Suspense fallback={<AppShell><LoadingState label="Loading workspace…" /></AppShell>}><Screen /></Suspense></ScreenErrorBoundary></PanelPreferencesProvider>
    </HashRouter>,
  );
}
