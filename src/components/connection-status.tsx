"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

type Connection = { configured: boolean; woocommerce_version?: string | null; error?: string };

export function ConnectionStatus() {
  const [data, setData] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/woo/connection");
      const result = (await response.json()) as Connection;
      setData(response.ok ? result : { ...result, error: result.error || "Connection check failed." });
    } catch {
      setData({ configured: true, error: "Unable to reach the connection check." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking connection…</div>;
  }

  const connected = data?.configured && !data.error;
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm">
        {connected ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-destructive" />}
        {connected ? "Connected" : data?.error || "Environment variables are not configured."}
        {connected && data?.woocommerce_version && <span className="text-muted-foreground">· WooCommerce {data.woocommerce_version}</span>}
      </div>
      <button onClick={load} aria-label="Check connection again" className="rounded-md border p-2 hover:bg-muted"><RefreshCw className="size-4" /></button>
    </div>
  );
}
