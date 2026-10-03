import { createRoot } from "react-dom/client";
import Home from "@/app/page";
import OrdersPage from "@/app/orders/page";
import { AppShell } from "@/components/app-shell";
import { OrderDetail } from "@/components/order-detail";
import { PanelPreferencesProvider } from "@/components/panel-preferences";
import { EmptyState } from "@/components/ui/feedback";
import { HashRouter, useHashPath } from "./router";
import "./app.css";

/** Screens the plugin implements. Keep in sync with the `features` list printed by the PHP plugin. */
function Screen() {
  const path = useHashPath();
  if (path === "/") return <Home />;
  if (path === "/orders") return <OrdersPage />;
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

const root = document.getElementById("storeops-root");
if (root) {
  createRoot(root).render(
    <HashRouter>
      <PanelPreferencesProvider><Screen /></PanelPreferencesProvider>
    </HashRouter>,
  );
}
