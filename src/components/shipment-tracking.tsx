"use client";

import { useRef, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Mail, Trash2, Truck } from "lucide-react";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson, RequestError } from "@/lib/fetch-json";
import { useRemote } from "@/lib/use-remote";
import type { Shipment } from "@/lib/woocommerce/shipments";

type ShipmentResponse = {
  shipments?: Shipment[];
  error?: string;
  saved?: boolean;
  email_requested?: boolean;
  email_error?: string;
  email_shipment_id?: string;
  email_outcome_unknown?: boolean;
};

type Feedback = { tone: "success" | "warning" | "error" | "info"; message: string; retryEmailFor?: Shipment };

const emailCaveat = "Store accepted the customer note; delivery depends on its Customer note email setting and the store's mail service.";

export function ShipmentTracking({ orderId, customerEmail, onNotesChanged }: { orderId: string; customerEmail?: string; onNotesChanged?: () => void }) {
  const endpoint = `/api/woo/orders/${orderId}/shipments`;
  const { data, setData, error: loadError, loading, reload } = useRemote<ShipmentResponse>(endpoint, "Could not load shipments.");
  const shipments = data?.shipments;
  const [carrier, setCarrier] = useState("");
  const [number, setNumber] = useState("");
  const [link, setLink] = useState("");
  const [date, setDate] = useState("");
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const inFlight = useRef(false);

  /** Runs one mutation at a time; failures that may have been applied reload the authoritative list. */
  async function mutate(action: () => Promise<Feedback | null>, fallback: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      setFeedback(await action());
    } catch (cause) {
      const body = cause instanceof RequestError ? cause.body as ShipmentResponse | undefined : undefined;
      const ambiguous = cause instanceof RequestError && (cause.status === 0 || cause.status === 504);
      if (body?.shipments) setData({ shipments: body.shipments });
      else reload();
      setFeedback(ambiguous
        ? { tone: "warning", message: `${errorMessage(cause, fallback)} The list has been reloaded — check it before retrying.` }
        : { tone: "error", message: errorMessage(cause, fallback) });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function addShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate(async () => {
      const result = await fetchJson<ShipmentResponse>(endpoint, {
        method: "POST",
        json: { carrier, tracking_number: number, tracking_url: link, shipped_at: date, notify_customer: notify && Boolean(customerEmail) },
      });
      setData({ shipments: result.shipments || [] });
      setCarrier(""); setNumber(""); setLink(""); setDate(""); setNotify(false);
      if (result.email_error) {
        const shipment = result.shipments?.find(item => item.id === result.email_shipment_id);
        if (result.email_outcome_unknown) {
          onNotesChanged?.();
          return { tone: "warning", message: `Shipment saved. The customer note outcome is unknown: ${result.email_error}` };
        }
        return { tone: "warning", message: `Shipment saved, but the customer note was not added: ${result.email_error}`, retryEmailFor: shipment };
      }
      if (result.email_requested) {
        onNotesChanged?.();
        return { tone: "success", message: `Shipment saved. ${emailCaveat}` };
      }
      return { tone: "success", message: "Shipment saved. The customer was not notified." };
    }, "Could not add shipment.");
  }

  function removeShipment(shipment: Shipment) {
    if (!window.confirm(`Remove tracking number ${shipment.tracking_number}? This does not recall a note or email already sent.`)) return;
    void mutate(async () => {
      const result = await fetchJson<ShipmentResponse>(endpoint, { method: "DELETE", json: { shipment_id: shipment.id } });
      setData({ shipments: result.shipments || [] });
      return { tone: "success", message: `Removed tracking number ${shipment.tracking_number}.` };
    }, "Could not remove shipment.");
  }

  function emailCustomer(shipment: Shipment) {
    if (!window.confirm(`Add a customer-facing note about tracking number ${shipment.tracking_number}? Store may email it to ${customerEmail}.`)) return;
    void mutate(async () => {
      await fetchJson<ShipmentResponse>(endpoint, { method: "PATCH", json: { shipment_id: shipment.id } });
      onNotesChanged?.();
      return { tone: "success", message: `Tracking note for ${shipment.tracking_number} added. ${emailCaveat}` };
    }, "Could not add the customer note.");
  }

  return (
    <section aria-labelledby="shipments-heading" className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Truck className="size-5" aria-hidden="true" /><h2 id="shipments-heading" className="font-semibold">Shipment tracking</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Stored on this order. Adding tracking does not change the order status, and a tracking link is not proof of delivery.</p>
        </div>
        <RetryButton onRetry={reload} busy={loading} label="Reload" />
      </div>

      {loadError && shipments && <Notice tone="error" className="mt-4">Showing the last loaded shipments. {loadError}</Notice>}
      {!shipments ? (loading ? <LoadingState label="Loading shipments…" className="py-8" /> : <ErrorState message={loadError || "Could not load shipments."} onRetry={reload} className="py-8" />)
        : shipments.length ? <ul className="mt-5 divide-y rounded-lg border">
          {shipments.map(shipment => <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="break-all font-medium">{shipment.carrier} · {shipment.tracking_number}</p>
              {shipment.shipped_at && <p className="text-xs text-muted-foreground">Shipped {shipment.shipped_at}</p>}
              {shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-2">Track package <ExternalLink className="size-3" aria-hidden="true" /></a>}
            </div>
            <div className="flex gap-2">
              {customerEmail && <button type="button" disabled={saving} onClick={() => emailCustomer(shipment)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"><Mail className="size-3" aria-hidden="true" />Email customer</button>}
              <button type="button" disabled={saving} onClick={() => removeShipment(shipment)} aria-label={`Remove tracking number ${shipment.tracking_number}`} className="rounded-md border p-1.5 text-destructive disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" /></button>
            </div>
          </li>)}
        </ul> : <p className="mt-5 text-sm text-muted-foreground">Tracking not recorded in WooOps.</p>}

      {feedback && <Notice tone={feedback.tone} className="mt-4" action={feedback.retryEmailFor && customerEmail
        ? <RetryButton onRetry={() => emailCustomer(feedback.retryEmailFor!)} busy={saving} label="Try the email again" /> : undefined}>
        {feedback.message}
      </Notice>}

      <form onSubmit={addShipment} className="mt-6 space-y-4 border-t pt-5">
        <h3 className="font-medium">Add shipment</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Courier
            <input required maxLength={80} value={carrier} onChange={event => setCarrier(event.target.value)} placeholder="e.g. DHL" className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <label className="text-sm font-medium">Tracking number
            <input required maxLength={120} value={number} onChange={event => setNumber(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <label className="text-sm font-medium">Tracking link <span className="text-muted-foreground">(optional, HTTPS)</span>
            <input type="url" pattern="https://.*" value={link} onChange={event => setLink(event.target.value)} placeholder="https://..." className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <label className="text-sm font-medium">Date shipped <span className="text-muted-foreground">(optional)</span>
            <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={notify && Boolean(customerEmail)} disabled={!customerEmail} onChange={event => setNotify(event.target.checked)} className="mt-1" />
          <span>Also add a customer-facing tracking note{customerEmail ? <>, which Store may email to <span className="break-all">{customerEmail}</span></> : " (no billing email on this order, so no email is possible)"}</span>
        </label>
        <p className="text-xs text-muted-foreground">Email depends on Store&apos;s Customer note email being enabled and the store being able to send mail. WooOps cannot confirm delivery.</p>
        <button disabled={saving || !shipments} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Add shipment{notify && customerEmail ? " and notify customer" : ""}
        </button>
      </form>
    </section>
  );
}
