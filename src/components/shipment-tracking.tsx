"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Loader2, Mail, Trash2, Truck } from "lucide-react";
import type { Shipment } from "@/lib/woocommerce/shipments";

type ShipmentResponse = {
  shipments?: Shipment[];
  error?: string;
  email_triggered?: boolean;
  email_error?: string;
};

export function ShipmentTracking({ orderId, customerEmail }: { orderId: string; customerEmail?: string }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [carrier, setCarrier] = useState("");
  const [number, setNumber] = useState("");
  const [link, setLink] = useState("");
  const [date, setDate] = useState("");
  const [notify, setNotify] = useState(Boolean(customerEmail));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endpoint = `/api/woo/orders/${orderId}/shipments`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/woo/orders/${orderId}/shipments`);
      const result = await response.json() as ShipmentResponse;
      if (!response.ok) throw new Error(result.error || "Could not load shipments.");
      setShipments(result.shipments || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load shipments.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  async function addShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier, tracking_number: number, tracking_url: link, shipped_at: date, notify_customer: notify }),
      });
      const result = await response.json() as ShipmentResponse;
      if (!response.ok) throw new Error(result.error || "Could not add shipment.");
      setShipments(result.shipments || []);
      setCarrier("");
      setNumber("");
      setLink("");
      setDate("");
      setNotice(result.email_error
        ? `Shipment saved, but WooCommerce could not trigger the customer note email: ${result.email_error}`
        : result.email_triggered
          ? "Shipment saved. WooCommerce accepted the customer note for email delivery."
          : "Shipment saved without customer notification.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add shipment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeShipment(shipment: Shipment) {
    if (!window.confirm(`Remove tracking number ${shipment.tracking_number}? This does not recall an email already sent.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipment.id }),
      });
      const result = await response.json() as ShipmentResponse;
      if (!response.ok) throw new Error(result.error || "Could not remove shipment.");
      setShipments(result.shipments || []);
      setNotice("Shipment removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove shipment.");
    } finally {
      setSaving(false);
    }
  }

  async function emailCustomer(shipment: Shipment) {
    if (!window.confirm(`Ask WooCommerce to email ${customerEmail} about tracking number ${shipment.tracking_number}?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipment.id }),
      });
      const result = await response.json() as ShipmentResponse;
      if (!response.ok) throw new Error(result.error || "Could not trigger customer email.");
      setNotice("WooCommerce accepted the customer note for email delivery.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not trigger customer email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-center gap-2"><Truck className="size-5" /><h2 className="font-semibold">Shipment tracking</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Tracking is stored on this WooCommerce order. Adding it does not change the order status.</p>

      {loading ? <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading shipments…</div>
        : shipments.length ? <div className="mt-5 divide-y rounded-lg border">
          {shipments.map(shipment => <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{shipment.carrier} · {shipment.tracking_number}</p>
              {shipment.shipped_at && <p className="text-xs text-muted-foreground">Shipped {shipment.shipped_at}</p>}
              {shipment.tracking_url && <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-2">Track package <ExternalLink className="size-3" /></a>}
            </div>
            <div className="flex gap-2">
              {customerEmail && <button type="button" disabled={saving} onClick={() => emailCustomer(shipment)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50"><Mail className="size-3" />Email customer</button>}
              <button type="button" disabled={saving} onClick={() => removeShipment(shipment)} aria-label={`Remove tracking number ${shipment.tracking_number}`} className="rounded-md border p-1.5 text-destructive disabled:opacity-50"><Trash2 className="size-4" /></button>
            </div>
          </div>)}
        </div> : <p className="mt-5 text-sm text-muted-foreground">No tracking information yet.</p>}

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
            <input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://..." className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
          <label className="text-sm font-medium">Date shipped <span className="text-muted-foreground">(optional)</span>
            <input type="date" value={date} onChange={event => setDate(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={notify} disabled={!customerEmail} onChange={event => setNotify(event.target.checked)} className="mt-1" />
          <span>Trigger WooCommerce customer note email{customerEmail ? ` to ${customerEmail}` : " (no billing email on this order)"}</span>
        </label>
        <p className="text-xs text-muted-foreground">Email delivery depends on the Customer note email being enabled and working in WooCommerce.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" />} Add shipment{notify && customerEmail ? " and email customer" : ""}
        </button>
      </form>
    </section>
  );
}
