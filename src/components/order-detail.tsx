"use client";

import { usePanelPreferences } from "@/components/panel-preferences";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Loader2, Mail, MapPin, Phone, Printer, Save, UserRound } from "lucide-react";
import { OrderItems } from "@/components/order-items";
import { OrderNotes } from "@/components/order-notes";
import { OrderPager } from "@/components/order-pager";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ShipmentTracking } from "@/components/shipment-tracking";
import { OrderAddressForm } from "@/components/order-address-form";
import { OrderRefunds } from "@/components/order-refunds";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { addressLines, formatDateTime, hasAddress, plainText, relativeAge, sameAddress, wooDate } from "@/lib/format";
import { useOrdersNavigation } from "@/lib/orders-navigation";
import { refreshOrderStatuses, statusName, useOrderStatusError, useOrderStatuses } from "@/lib/use-order-statuses";
import { useRemote } from "@/lib/use-remote";
import { editableStatuses } from "@/lib/woocommerce/validation";
import type { WooOrder, WooOrderStatus } from "@/types/woocommerce";

const card = "rounded-xl border bg-background p-5 shadow-sm";

function StatusCard({ order, onSaved }: { order: WooOrder; onSaved: (order: WooOrder) => void }) {
  const { can } = usePanelPreferences();
  const canWrite = can("orders.status");
  const [status, setStatus] = useState<WooOrderStatus>(order.status);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const statuses = useOrderStatuses();
  const statusError = useOrderStatusError();
  const options = statuses.filter(item => item.settable);
  const custom = !editableStatuses.includes(order.status as never);
  const currentListed = options.some(item => item.slug === order.status);

  async function save() {
    if (!canWrite || saving || status === order.status) return;
    setSaving(true);
    setResult(null);
    try {
      const updated = await fetchJson<WooOrder>(`/api/woo/orders/${order.id}`, { method: "PATCH", json: { status } });
      onSaved(updated);
      setStatus(updated.status);
      refreshOrderStatuses();
      setResult({ tone: "success", message: `Status is now ${statusName(statuses, updated.status)}.` });
    } catch (cause) {
      setResult({ tone: "error", message: `${errorMessage(cause, "Update failed.")} Refresh the order to see its current status.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="status-heading" className={card}>
      <h2 id="status-heading" className="font-semibold">Order status</h2>
      {statusError && <Notice tone="warning" className="mt-3" action={<RetryButton onRetry={refreshOrderStatuses} />}>{statusError}</Notice>}
      <label htmlFor="order-status" className="sr-only">New status</label>
      <select disabled={!canWrite} id="order-status" value={status} onChange={event => setStatus(event.target.value)} className="mt-4 h-10 w-full rounded-lg border bg-background px-3 text-sm">
        {!currentListed && <option value={order.status} disabled>{statusName(statuses, order.status)} (current)</option>}
        {options.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}
      </select>
      <button type="button" disabled={!canWrite || saving || status === order.status} onClick={save}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}Save status
      </button>
      <p className="mt-3 text-xs text-muted-foreground">Status changes are separate from shipments. Store may send its own status emails (for example, Completed order) depending on store settings.</p>
      {custom && <p className="mt-2 text-xs text-muted-foreground">This order uses a custom status registered by your store or an extension.</p>}
      <p className="mt-2 text-xs text-muted-foreground">The list includes custom statuses your store has registered. Extensions may run their own actions when an order enters one of their statuses.</p>
      {result && <Notice tone={result.tone} className="mt-3">{result.message}</Notice>}
    </section>
  );
}

type SectionTab = "Summary" | "Shipping" | "Billing" | "Payments" | "Fulfilment" | "Notes";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState("copied"); }
    catch { setState("failed"); }
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" onClick={copy} aria-label={label} title={label} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      {state === "copied" ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
    </button>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { timeZone, can } = usePanelPreferences();
  const { data: order, setData: setOrder, error, loading, reload } = useRemote<WooOrder>(`/api/woo/orders/${id}`, "Unable to load order.");
  const [notesVersion, setNotesVersion] = useState(0);
  const [activeTab, setActiveTabState] = useState<SectionTab>("Summary");
  // A section stays mounted once opened (hidden when inactive), so unsaved address edits survive switching tabs.
  const [visited, setVisited] = useState<SectionTab[]>(["Summary"]);
  const setActiveTab = (tab: SectionTab) => {
    setActiveTabState(tab);
    setVisited(current => (current.includes(tab) ? current : [...current, tab]));
  };
  const refreshNotes = () => setNotesVersion(current => current + 1);
  const tabsRef = useRef<{ [key in SectionTab]: HTMLButtonElement | null }>({
    Summary: null,
    Shipping: null,
    Billing: null,
    Payments: null,
    Fulfilment: null,
    Notes: null,
  });

  // Return to the filtered list page the user came from, when this tab has one.
  const [navigation] = useOrdersNavigation();
  const back = <Link href={navigation?.listHref ?? "/orders"} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to orders</Link>;

  if (!order) {
    return <div className="space-y-4">{back}{loading ? <LoadingState label="Loading order…" className="min-h-[50vh]" />
      : <div className={card}><ErrorState message={error || "Order not found."} onRetry={reload} /></div>}</div>;
  }

  const created = wooDate(order.date_created, order.date_created_gmt);
  const paid = wooDate(order.date_paid, order.date_paid_gmt);
  const guest = !order.customer_id;
  const shipsToBilling = hasAddress(order.shipping) && sameAddress(order.shipping, order.billing);
  const customerName = [order.billing.first_name, order.billing.last_name].filter(Boolean).join(" ") || "No billing name";
  const canEdit = can("orders.status");

  const tabs: SectionTab[] = ["Summary", "Shipping", "Billing", "Payments", "Fulfilment", "Notes"];

  const handleTabClick = (tab: SectionTab) => {
    setActiveTab(tab);
    tabsRef.current[tab]?.focus();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tab: SectionTab) => {
    const tabIndex = tabs.indexOf(tab);
    let nextTab: SectionTab | null = null;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nextTab = tabs[(tabIndex - 1 + tabs.length) % tabs.length];
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nextTab = tabs[(tabIndex + 1) % tabs.length];
    } else if (event.key === "Home") {
      event.preventDefault();
      nextTab = tabs[0];
    } else if (event.key === "End") {
      event.preventDefault();
      nextTab = tabs[tabs.length - 1];
    }

    if (nextTab) {
      setActiveTab(nextTab);
      setTimeout(() => tabsRef.current[nextTab]?.focus(), 0);
    }
  };

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
      <div className="flex flex-wrap items-center gap-2">
        <OrderPager id={id} />
        <Link href={`/orders/${id}/packing-slip`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm hover:bg-accent"><Printer className="size-4" aria-hidden="true" />Packing slip</Link>
        <RetryButton onRetry={reload} busy={loading} label="Refresh order" />
      </div>
    </div>
    {error && <Notice tone="error">Showing the last loaded version of this order. {error}</Notice>}

    {order.customer_note?.trim() && activeTab === "Summary" && <Notice tone="info"><span className="font-medium">Customer&apos;s note at checkout:</span> <span className="whitespace-pre-wrap break-words">{plainText(order.customer_note)}</span></Notice>}

    <div className="border-b">
      <div className="flex gap-1" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab}
            ref={el => { if (el) tabsRef.current[tab] = el; }}
            role="tab"
            id={`tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`${tab}-panel`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => handleTabClick(tab)}
            onKeyDown={e => handleTabKeyDown(e, tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>

    <div>
      {visited.includes("Summary") && (
        <div role="tabpanel" id="Summary-panel" aria-labelledby="tab-Summary" hidden={activeTab !== "Summary"}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <OrderItems order={order} />
          </div>
          <div className="min-w-0 space-y-4">
            <StatusCard key={order.status} order={order} onSaved={updated => { setOrder(updated); refreshNotes(); }} />

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
            </section>

            <section aria-labelledby="ship-summary-heading" className={card}>
              <div className="flex items-center justify-between gap-2">
                <h2 id="ship-summary-heading" className="flex items-center gap-2 font-semibold"><MapPin className="size-4" aria-hidden="true" />Shipping address</h2>
                {hasAddress(order.shipping) && <CopyButton text={addressLines(order.shipping).join("\n")} label="Copy shipping address" />}
              </div>
              {hasAddress(order.shipping)
                ? <address className="mt-3 text-sm not-italic leading-6">{addressLines(order.shipping).map((line, index) => <span key={index} className="block break-words">{line}</span>)}</address>
                : <p className="mt-3 text-sm text-muted-foreground">No shipping address on this order.</p>}
              {shipsToBilling && hasAddress(order.shipping) && <p className="mt-2 text-xs text-muted-foreground">Same as billing address.</p>}
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
          </div>
        </div>
        </div>
      )}

      {visited.includes("Shipping") && (
        <div role="tabpanel" id="Shipping-panel" aria-labelledby="tab-Shipping" hidden={activeTab !== "Shipping"}>
        <div className={card}>
          <h2 className="flex items-center gap-2 font-semibold mb-4"><MapPin className="size-4" aria-hidden="true" />Shipping address</h2>
          {!hasAddress(order.shipping) && !canEdit && (
            <p className="text-sm text-muted-foreground">No shipping address on this order. This is common for virtual items, local pickup or manually created orders.</p>
          )}
          {hasAddress(order.shipping) && !canEdit && (
            <>
              <address className="text-sm not-italic leading-6">
                {addressLines(order.shipping).map((line, index) => (
                  <span key={index} className="block break-words">{line}</span>
                ))}
              </address>
              {shipsToBilling && <p className="mt-2 text-xs text-muted-foreground">Same as billing address.</p>}
              {order.shipping.phone && <p className="mt-2 text-sm"><a href={`tel:${order.shipping.phone}`} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"><Phone className="size-3.5" aria-hidden="true" />{order.shipping.phone}</a> <span className="text-xs text-muted-foreground">(shipping phone)</span></p>}
            </>
          )}
          {canEdit && <OrderAddressForm kind="shipping" order={order} canEdit={true} onSaved={updated => { setOrder(updated); }} />}
        </div>
        </div>
      )}

      {visited.includes("Billing") && (
        <div role="tabpanel" id="Billing-panel" aria-labelledby="tab-Billing" hidden={activeTab !== "Billing"}>
        <div className={card}>
          <h2 className="flex items-center gap-2 font-semibold mb-4"><MapPin className="size-4" aria-hidden="true" />Billing address</h2>
          {!hasAddress(order.billing) && !canEdit && (
            <p className="text-sm text-muted-foreground">No billing address recorded.</p>
          )}
          {canEdit && <OrderAddressForm kind="billing" order={order} canEdit={true} onSaved={updated => { setOrder(updated); }} />}
          {!canEdit && hasAddress(order.billing) && (
            <address className="text-sm not-italic leading-6">
              {addressLines(order.billing).map((line, index) => (
                <span key={index} className="block break-words">{line}</span>
              ))}
            </address>
          )}
        </div>
        </div>
      )}

      {visited.includes("Payments") && (
        <div role="tabpanel" id="Payments-panel" aria-labelledby="tab-Payments" hidden={activeTab !== "Payments"}>
        <OrderRefunds order={order} onOrderChange={setOrder} />
        </div>
      )}

      {visited.includes("Fulfilment") && (
        <div role="tabpanel" id="Fulfilment-panel" aria-labelledby="tab-Fulfilment" hidden={activeTab !== "Fulfilment"}>
        <div className="space-y-4">
          <ShipmentTracking orderId={id} customerEmail={order.billing.email || undefined} onNotesChanged={refreshNotes} />
        </div>
        </div>
      )}

      {visited.includes("Notes") && (
        <div role="tabpanel" id="Notes-panel" aria-labelledby="tab-Notes" hidden={activeTab !== "Notes"}>
        <OrderNotes orderId={id} customerEmail={order.billing.email || undefined} refreshKey={notesVersion} />
        </div>
      )}
    </div>
  </div>;
}
