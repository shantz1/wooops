"use client";

import { useState } from "react";
import { Palette, Store } from "lucide-react";
import { AccessSettings, type AccessSummary } from "@/components/access-settings";
import { ConnectionStatus } from "@/components/connection-status";
import { usePanelPreferences, type PanelPreferences } from "@/components/panel-preferences";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { wordpressRuntime } from "@/lib/runtime";
import { useRemote } from "@/lib/use-remote";

type Settings = { timezone: string; timezone_warning: string | null; configured: boolean; store_url: string | null; access: AccessSummary;
  store: { currency: string | null; decimal_places: string | null; country: string | null; prices_include_tax: string | null } | null; store_error?: string };

function Appearance() {
  const { preferences, save } = usePanelPreferences();
  const [draft, setDraft] = useState<PanelPreferences | null>(null);
  const [message, setMessage] = useState("");
  const value = draft || preferences;
  return <section className="rounded-xl border bg-background p-5 shadow-sm">
    <h2 className="flex items-center gap-2 font-semibold"><Palette className="size-5 text-primary" />Panel appearance</h2>
    <p className="mt-1 text-sm text-muted-foreground">Personalize this workspace on this browser. Preferences do not change storefront settings.</p>
    <form className="mt-5 space-y-4" onSubmit={event => {
      event.preventDefault();
      try { save(value); setDraft(null); setMessage("Preferences saved for this browser."); }
      catch { setMessage("This browser could not save preferences. Enable local storage and retry."); }
    }}>
      <label className="block text-sm font-medium">Panel name<input maxLength={60} required value={value.name} onChange={event => { setDraft({ ...value, name: event.target.value }); setMessage(""); }} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" /></label>
      <label className="block text-sm font-medium">Theme<select value={value.theme} onChange={event => { setDraft({ ...value, theme: event.target.value as PanelPreferences["theme"] }); setMessage(""); }} className="mt-2 h-10 w-full rounded-lg border bg-background px-3"><option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save preferences</button>
    </form>
  </section>;
}

export function SettingsPanel() {
  const inWordPress = Boolean(wordpressRuntime());
  const { data, loading, error, reload } = useRemote<Settings>("/api/settings", "Could not load settings.");
  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Workspace</p><h1 className="mt-1 text-2xl font-semibold">Settings</h1><p className="mt-1 text-muted-foreground">Panel appearance, store connection and access.</p></div>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Appearance />
      <section className="space-y-4 rounded-xl border bg-background p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Store className="size-5 text-primary" />Connected store</h2><RetryButton onRetry={reload} busy={loading} /></div>
        <ConnectionStatus />
        {error && <Notice tone="error">{error}</Notice>}
        {!data ? loading ? <LoadingState className="py-6" label="Loading store details..." /> : <ErrorState message={error || "Details unavailable."} onRetry={reload} className="py-6" />
          : <><dl className="space-y-3 text-sm">
            {[["Timezone", data.timezone], ["Store URL", data.store_url], ["Currency", data.store?.currency], ["Decimal places", data.store?.decimal_places], ["Store location", data.store?.country], ["Prices include tax", data.store?.prices_include_tax === "yes" ? "Yes" : data.store?.prices_include_tax === "no" ? "No" : null]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="break-all text-right font-medium">{value ?? "Unavailable"}</dd></div>)}
          </dl><p className="text-xs text-muted-foreground">Dates follow the store timezone. Change it in the store&apos;s General settings, then refresh this panel.</p>{data.timezone_warning && <Notice tone="warning">{data.timezone_warning}</Notice>}{data.store_error && <Notice tone="warning">Store details could not be read. {data.store_error}</Notice>}
          <p className="text-xs text-muted-foreground">{inWordPress ? "Store details are read-only here. This plugin uses your WordPress account and needs no API keys." : "Store details are read-only here. Connection credentials are managed by the deployment administrator and never displayed."}</p></>}
      </section>
      {data && <AccessSettings access={data.access} inWordPress={inWordPress} />}
      <section className="rounded-xl border bg-background p-5 shadow-sm"><h2 className="font-semibold">Customer notifications</h2><p className="mt-3 text-sm text-muted-foreground">Customer-facing notes and shipment messages use the store&apos;s Customer note email. Enable that email and verify the store&apos;s mail delivery. Status changes may send separate store emails.</p><p className="mt-3 text-xs text-muted-foreground">A saved note confirms acceptance by the store, not delivery to the customer. New shipment notifications are off by default.</p></section>
    </div>
  </div>;
}
