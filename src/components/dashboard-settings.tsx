"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { dashboardCards, type DashboardPreferences } from "@/lib/dashboard";
import { useDashboardPreferences } from "@/lib/use-dashboard-preferences";
import { useOrderStatuses, useOrderStatusError, refreshOrderStatuses } from "@/lib/use-order-statuses";
import { wordpressRuntime } from "@/lib/runtime";
import { errorMessage } from "@/lib/fetch-json";
import { Notice, RetryButton } from "@/components/ui/feedback";

export function DashboardSettings() {
  const { preferences, loaded, error, save, reload } = useDashboardPreferences();
  const statuses = useOrderStatuses();
  const statusError = useOrderStatusError();
  const [draft, setDraft] = useState<DashboardPreferences | null>(null);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const value = draft || preferences;
  const options: { id: string; label: string; hint: string }[] = [...dashboardCards, ...statuses.filter(status => status.settable).map(status => ({ id: `status:${status.slug}`, label: status.name, hint: "All orders currently in this status" }))];
  const label = (id: string) => options.find(option => option.id === id)?.label || id.replace(/^status:/, "");
  function change(next: DashboardPreferences) { setDraft(next); setMessage(""); setFailure(""); }
  function move(index: number, step: number) {
    const cards = [...value.cards];
    [cards[index], cards[index + step]] = [cards[index + step], cards[index]];
    change({ ...value, cards });
  }
  return <section className="max-w-3xl space-y-5 rounded-xl border bg-background p-5 shadow-sm">
    <div><h2 className="font-semibold">Your overview cards</h2><p className="mt-1 text-sm text-muted-foreground">Choose up to four cards and set their order. Today and this week use the store timezone; weeks start on Monday. Status cards count all orders in that status.</p><p className="mt-2 text-xs text-muted-foreground">{wordpressRuntime() ? "Saved for your WordPress account. The same cards appear in your optional WordPress dashboard widget." : "Saved for your login in this browser."}</p></div>
    {error && <Notice tone="error">{error} <RetryButton onRetry={reload} /></Notice>}
    {statusError && <Notice tone="warning">{statusError} <RetryButton onRetry={refreshOrderStatuses} /></Notice>}
    <fieldset disabled={!loaded || busy} className="space-y-5">
      <legend className="sr-only">Dashboard customization</legend>
      <div className="grid gap-2 sm:grid-cols-2">{options.map(option => <label key={option.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={value.cards.includes(option.id)} disabled={!value.cards.includes(option.id) && value.cards.length >= 4} onChange={event => change({ ...value, cards: event.target.checked ? [...value.cards, option.id] : value.cards.filter(id => id !== option.id) })} /><span><span className="font-medium">{option.label}</span><span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span></span></label>)}</div>
      <div><h3 className="text-sm font-medium">Display order ({value.cards.length}/4)</h3><ol className="mt-2 space-y-2">{value.cards.map((id, index) => <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{index + 1}. {label(id)}</span><span className="flex gap-2"><button type="button" aria-label={`Move ${label(id)} up`} disabled={index === 0} onClick={() => move(index, -1)} className="rounded border p-2 disabled:opacity-40"><ArrowUp className="size-4" /></button><button type="button" aria-label={`Move ${label(id)} down`} disabled={index === value.cards.length - 1} onClick={() => move(index, 1)} className="rounded border p-2 disabled:opacity-40"><ArrowDown className="size-4" /></button><button type="button" aria-label={`Remove ${label(id)}`} onClick={() => change({ ...value, cards: value.cards.filter(card => card !== id) })} className="rounded border px-3">Remove</button></span></li>)}</ol></div>
      {wordpressRuntime() && <label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={value.widget_enabled} onChange={event => change({ ...value, widget_enabled: event.target.checked })} /><span><span className="font-medium">Show a KartoDesk widget on my WordPress dashboard</span><span className="mt-1 block text-xs text-muted-foreground">Enabled by default in a full-width row. Turn it off here or hide it using WordPress Screen Options. Existing dashboard widgets stay in place.</span></span></label>}
      <div className="flex flex-wrap gap-3"><button type="button" disabled={value.cards.length === 0} onClick={async () => { setBusy(true); setFailure(""); try { await save(value); setDraft(null); setMessage("Dashboard preferences saved."); } catch (cause) { setFailure(errorMessage(cause, "Could not save preferences.")); } finally { setBusy(false); } }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save dashboard"}</button></div>
    </fieldset>
    {!loaded && !error && <p role="status" className="text-sm text-muted-foreground">Loading preferences…</p>}
    {value.cards.length === 0 && <p className="text-sm text-muted-foreground">Choose at least one card.</p>}
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}{failure && <Notice tone="error">{failure}</Notice>}
  </section>;
}
