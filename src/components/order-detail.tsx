"use client";

import { usePanelPreferences } from "@/components/panel-preferences";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, Mail, MapPin, Phone, Save, UserRound } from "lucide-react";
import { OrderItems } from "@/components/order-items";
import { OrderNotes } from "@/components/order-notes";
import { OrderStatusBadge, statusLabel } from "@/components/order-status-badge";
import { ShipmentTracking } from "@/components/shipment-tracking";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { addressLines, formatDateTime, hasAddress, plainText, relativeAge, sameAddress, wooDate } from "@/lib/format";
import { useRemote } from "@/lib/use-remote";
import { editableStatuses } from "@/lib/woocommerce/validation";
import type { WooAddress, WooOrder, WooOrderStatus } from "@/types/woocommerce";

const card = "rounded-xl border bg-background p-5 shadow-sm";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); }
    catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" onClick={copy} aria-label={label} title={label} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
      {state === "copied" ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
    </button>
  );
}

function AddressCard({ title, address, empty, extra }: { title: string; address: WooAddress; empty: string; extra?: React.ReactNode }) {
  const lines = addressLines(address);
  return (
    <section aria-label={title} className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4" aria-hidden="true" />{title}</h2>
        {hasAddress(address) && <CopyButton text={lines.join("\n")} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {hasAddress(address)
        ? <address className="mt-3 text-sm not-italic leading-6">{lines.map((line, index) => <span key={index} className="block break-words">{line}</span>)}</address>
        : <p className="mt-3 text-sm text-muted-foreground">{empty}</p>}
      {extra}
    </section>
  );
}

function StatusCard({ order, onSaved }: { order: WooOrder; onSaved: (order: WooOrder) => void }) {
  const { canWrite } = usePanelPreferences();
  const [status, setStatus] = useState<WooOrderStatus>(order.status);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const custom = !editableStatuses.includes(order.status as never);

  async function save() {
    if (!canWrite || saving || status === order.status) return;
    setSaving(true);
    setResult(null);
    try {
      const updated = await fetchJson<WooOrder>(`/api/woo/orders/${order.id}`, { method: "PATCH", json: { status } });
      onSaved(updated);
      setStatus(updated.status);
      setResult({ tone: "success", message: `Status is now ${statusLabel(updated.status)}.` });
    } catch (cause) {
      setResult({ tone: "error", message: `${errorMessage(cause, "Update failed.")} Refresh the order to see its current status.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="status-heading" className={card}>
      <h2 id="status-heading" className="font-semibold">Order status</h2>
      <label htmlFor="order-status" className="sr-only">New status</label>
      <select disabled={!canWrite} id="order-status" value={status} onChange={event => setStatus(event.target.value)} className="mt-4 h-10 w-full rounded-lg border bg-background px-3 text-sm capitalize">
        {custom && <option value={order.status} disabled>{statusLabel(order.status)} (custom — current)</option>}
        {editableStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
      </select>
      <button type="button" disabled={!canWrite || saving || status === order.status} onClick={save}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}Save status
      </button>
      <p className="mt-3 text-xs text-muted-foreground">Status changes are separate from shipments. Store may send its own status emails (for example, Completed order) depending on store settings.</p>
      {custom && <p className="mt-2 text-xs text-muted-foreground">This order uses a custom status from your store or an extension. This panel can move it to a standard status but cannot set custom ones.</p>}
      {result && <Notice tone={result.tone} className="mt-3">{result.message}</Notice>}
    </section>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { timeZone } = usePanelPreferences();
  const { data: order, setData: setOrder, error, loading, reload } = useRemote<WooOrder>(`/api/woo/orders/${id}`, "Unable to load order.");
  const [notesVersion, setNotesVersion] = useState(0);
  const refreshNotes = () => setNotesVersion(current => current + 1);
  const back = <Link href="/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to orders</Link>;

  if (!order) {
    return <div className="space-y-4">{back}{loading ? <LoadingState label="Loading order…" className="min-h-[50vh]" />
      : <div className={card}><ErrorState message={error || "Order not found."} onRetry={reload} /></div>}</div>;
  }

  const created = wooDate(order.date_created, order.date_created_gmt);
  const paid = wooDate(order.date_paid, order.date_paid_gmt);
  const guest = !order.customer_id;
  const shipsToBilling = hasAddress(order.shipping) && sameAddress(order.shipping, order.billing);
  const customerName = [order.billing.first_name, order.billing.last_name].filter(Boolean).join(" ") || "No billing name";

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="mb-3">{back}</div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Order #{order.number}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Placed <time dateTime={created?.toISOString()}>{formatDateTime(created, timeZone)}</time>{created && <> ({relativeAge(created)})</>} · {order.payment_method_title || "Payment method not recorded"}
        </p>
      </div>
      <RetryButton onRetry={reload} busy={loading} label="Refresh order" />
    </div>
    {error && <Notice tone="error">Showing the last loaded version of this order. {error}</Notice>}

    {order.customer_note?.trim() && <Notice tone="info"><span className="font-medium">Customer&apos;s note at checkout:</span> <span className="whitespace-pre-wrap break-words">{plainText(order.customer_note)}</span></Notice>}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <OrderItems order={order} />
        <ShipmentTracking orderId={id} customerEmail={order.billing.email || undefined} onNotesChanged={refreshNotes} />
      </div>
      <div className="min-w-0 space-y-4">
        <StatusCard key={order.status} order={order} onSaved={updated => { setOrder(updated); refreshNotes(); }} />

        <AddressCard title="Shipping address" address={order.shipping}
          empty="No shipping address on this order. This is common for virtual items, local pickup or manually created orders."
          extra={<>
            {shipsToBilling && <p className="mt-2 text-xs text-muted-foreground">Same as billing address.</p>}
            {order.shipping.phone && <p className="mt-2 text-sm"><a href={`tel:${order.shipping.phone}`} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"><Phone className="size-3.5" aria-hidden="true" />{order.shipping.phone}</a> <span className="text-xs text-muted-foreground">(shipping phone)</span></p>}
          </>} />

        <section aria-labelledby="customer-heading" className={card}>
          <h2 id="customer-heading" className="flex items-center gap-2 font-semibold"><UserRound className="size-4" aria-hidden="true" />Customer and billing</h2>
          <p className="mt-3 font-medium">{customerName}</p>
          {order.billing.company && <p className="text-sm text-muted-foreground">{order.billing.company}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{guest
            ? "Guest checkout — no registered account. Other orders with the same email are not linked automatically."
            : `Registered customer account #${order.customer_id}`}</p>
          <div className="mt-3 space-y-1.5 text-sm">
            {order.billing.email
              ? <a href={`mailto:${order.billing.email}`} className="flex items-center gap-1.5 break-all underline-offset-2 hover:underline"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{order.billing.email}</a>
              : <p className="text-muted-foreground">No billing email</p>}
            {order.billing.phone
              ? <a href={`tel:${order.billing.phone}`} className="flex items-center gap-1.5 underline-offset-2 hover:underline"><Phone className="size-3.5 shrink-0" aria-hidden="true" />{order.billing.phone}</a>
              : <p className="text-muted-foreground">No billing phone</p>}
          </div>
          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Billing address</h3>{hasAddress(order.billing) && <CopyButton text={addressLines(order.billing).join("\n")} label="Copy billing address" />}</div>
            {hasAddress(order.billing)
              ? <address className="mt-2 text-sm not-italic leading-6">{addressLines(order.billing).map((line, index) => <span key={index} className="block break-words">{line}</span>)}</address>
              : <p className="mt-2 text-sm text-muted-foreground">No billing address recorded.</p>}
          </div>
        </section>

        <section aria-labelledby="payment-heading" className={card}>
          <h2 id="payment-heading" className="font-semibold">Payment</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Method</dt><dd className="text-right">{order.payment_method_title || order.payment_method || "Not recorded"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Paid</dt><dd className="text-right">{paid ? formatDateTime(paid, timeZone) : "No paid date recorded"}</dd></div>
            {order.transaction_id && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Transaction</dt><dd className="break-all text-right font-mono text-xs">{order.transaction_id}</dd></div>}
          </dl>
          {!paid && <p className="mt-3 text-xs text-muted-foreground">Store has not recorded a payment date. For cash on delivery, bank transfer or cheque, payment is confirmed manually by the store.</p>}
        </section>

        <OrderNotes orderId={id} customerEmail={order.billing.email || undefined} refreshKey={notesVersion} />
      </div>
    </div>
  </div>;
}
