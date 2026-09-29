import { AppShell } from "@/components/app-shell";
import { ConnectionStatus } from "@/components/connection-status";
import { KeyRound, Server } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="max-w-3xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">System</p>
          <h1 className="mt-1 text-2xl font-semibold">Store connection</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            WooOps keeps WooCommerce credentials on the server and never sends them to the browser.
          </p>
        </div>
        <ConnectionStatus />
        <div className="rounded-xl border bg-background shadow-sm">
          <div className="flex items-start gap-4 border-b p-6">
            <div className="grid size-10 place-items-center rounded-lg bg-muted"><Server className="size-5" /></div>
            <div>
              <h2 className="font-semibold">WooCommerce REST API</h2>
              <p className="mt-1 text-sm text-muted-foreground">Configure the store using environment variables on your WooOps deployment.</p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <div className="rounded-lg bg-muted p-4 font-mono text-xs leading-6">
              <div>WOOCOMMERCE_URL=https://your-store.com</div>
              <div>WOOCOMMERCE_CONSUMER_KEY=ck_...</div>
              <div>WOOCOMMERCE_CONSUMER_SECRET=cs_...</div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="size-4" /> Create API keys in WooCommerce → Settings → Advanced → REST API.
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
