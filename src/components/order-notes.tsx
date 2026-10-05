"use client";

import { usePanelPreferences } from "@/components/panel-preferences";

import { useRef, useState, type FormEvent } from "react";
import { Loader2, Lock, Mail, MessageSquareText } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson, RequestError } from "@/lib/fetch-json";
import { formatDateTime, plainText, wooDate } from "@/lib/format";
import { useRemote } from "@/lib/use-remote";
import type { WooOrderNote } from "@/types/woocommerce";

type Audience = "private" | "customer";

/**
 * Order notes from WooCommerce. Private notes are staff-only; customer notes are shown to the customer and
 * WooCommerce emails them when its "Customer note" email is enabled. Acceptance is not proof of delivery.
 */
export function OrderNotes({ orderId, customerEmail, refreshKey }: { orderId: string; customerEmail?: string; refreshKey: number }) {
  const { timeZone, can } = usePanelPreferences();
  const canPrivate = can("orders.notes");
  const canCustomer = canPrivate && can("orders.notify");
  const canWrite = canPrivate || canCustomer;
  const endpoint = `/api/woo/orders/${orderId}/notes`;
  const { data: notes, error, loading, reload } = useRemote<WooOrderNote[]>(endpoint, "Could not load notes.", refreshKey);
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<Audience>("private");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error" | "warning"; message: string } | null>(null);
  const inFlight = useRef(false);

  // Customer-facing notes require both note creation and customer notification permission.
  const toCustomer = canPrivate ? audience === "customer" && canCustomer : canCustomer;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = text.trim();
    if (!canWrite || !note || inFlight.current) return;
    if (toCustomer && !window.confirm(customerEmail
      ? `Add a customer-facing note? Store will show it to the customer and may email it to ${customerEmail}. This cannot be recalled.`
      : "Add a customer-facing note? This order has no billing email, so Store cannot email it.")) return;
    inFlight.current = true;
    setSaving(true);
    setResult(null);
    try {
      await fetchJson(endpoint, { method: "POST", json: { note, customer_note: toCustomer } });
      setText("");
      setAudience("private");
      setResult(toCustomer
        ? { tone: "success", message: customerEmail
          ? "Customer note added. Store accepted it; whether an email arrives depends on the store's Customer note email setting and mail delivery."
          : "Customer note added. No email was possible because the order has no billing email." }
        : { tone: "success", message: "Private note added." });
      reload();
    } catch (cause) {
      const ambiguous = cause instanceof RequestError && (cause.status === 0 || cause.status === 502 || cause.status === 504);
      setResult(ambiguous
        ? { tone: "warning", message: `${errorMessage(cause, "The note request did not complete.")} The note may have been saved — check the list below before adding it again.` }
        : { tone: "error", message: errorMessage(cause, "Could not add the note.") });
      if (ambiguous) reload();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="notes-heading" className="rounded-xl border bg-background shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b p-5">
        <div className="flex items-center gap-2"><MessageSquareText className="size-5" aria-hidden="true" /><h2 id="notes-heading" className="font-semibold">Notes</h2>
          {notes && <span className="text-sm text-muted-foreground">({notes.length})</span>}</div>
        <RetryButton onRetry={reload} busy={loading} label="Refresh" />
      </div>

      {canWrite && <form onSubmit={submit} className="space-y-3 border-b p-5">
        <label htmlFor="note-text" className="text-sm font-medium">Add a note</label>
        <textarea id="note-text" rows={3} maxLength={5000} value={text} onChange={event => setText(event.target.value)}
          className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Who can see this note</legend>
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${!toCustomer ? "border-foreground/40 bg-muted/40" : ""}`}>
            <input type="radio" name="note-audience" value="private" checked={!toCustomer} disabled={!canPrivate} onChange={() => setAudience("private")} className="mt-1" />
            <span><span className="flex items-center gap-1 font-medium"><Lock className="size-3.5" aria-hidden="true" />Private</span><span className="text-xs text-muted-foreground">Staff only. Not emailed.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${toCustomer ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : ""}`}>
            <input type="radio" name="note-audience" value="customer" checked={toCustomer} disabled={!canCustomer} onChange={() => setAudience("customer")} className="mt-1" />
            <span><span className="flex items-center gap-1 font-medium"><Mail className="size-3.5" aria-hidden="true" />To customer</span><span className="text-xs text-muted-foreground">Visible to the customer and may be emailed.</span></span>
          </label>
        </fieldset>
        {toCustomer && <Notice tone="warning">
          {customerEmail
            ? <>Store will show this note to the customer and send its <strong>Customer note</strong> email to <strong className="break-all">{customerEmail}</strong> if that email is enabled. It cannot be recalled.</>
            : <>This order has no billing email, so Store cannot email this note.</>}
        </Notice>}
        {result && <Notice tone={result.tone}>{result.message}</Notice>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length}/5000</span>
          <button disabled={saving || !text.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}{toCustomer ? "Add note for customer" : "Add private note"}
          </button>
        </div>
      </form>}

      {error && notes && <Notice tone="error" className="m-5 mb-0" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded notes. {error}</Notice>}
      {!notes ? (loading ? <LoadingState label="Loading notes…" className="py-10" /> : <ErrorState message={error || "Could not load notes."} onRetry={reload} className="py-10" />)
        : notes.length === 0 ? <EmptyState title="No notes yet" className="py-10">Status changes and notes added in your store appear here.</EmptyState>
        : <ol className="divide-y">
          {notes.map(note => {
            const created = wooDate(note.date_created, note.date_created_gmt);
            return (
              <li key={note.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {note.customer_note
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Mail className="size-3" aria-hidden="true" />Customer-facing</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground"><Lock className="size-3" aria-hidden="true" />Private</span>}
                  <span>{!note.author || note.author === "WooCommerce" ? "Store system" : note.author}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={created?.toISOString()}>{formatDateTime(created, timeZone)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{plainText(note.note)}</p>
              </li>
            );
          })}
        </ol>}
    </section>
  );
}
