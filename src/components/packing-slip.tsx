"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { itemMeta } from "@/components/order-items";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ErrorState, LoadingState } from "@/components/ui/feedback";
import { addressLines, formatDateTime, hasAddress, plainText, wooDate } from "@/lib/format";
import { useRemote } from "@/lib/use-remote";
import type { Shipment } from "@/lib/woocommerce/shipments";
import type { WooAddress, WooOrder } from "@/types/woocommerce";

type StoreSettings = { timezone?: string; timezone_warning?: string | null; store?: { name?: string | null; address?: Partial<WooAddress> | null } | null };

/**
 * A printable packing slip: what to pack and where it goes. It deliberately has no prices and is labelled
 * as not a tax invoice. Store details come from WordPress (site title) and WooCommerce (store address).
 */
export function PackingSlip({ id }: { id: string }) {
  const { timeZone } = usePanelPreferences();
  const { data: order, error, loading, reload } = useRemote<WooOrder>(`/api/woo/orders/${id}`, "Unable to load order.");
  const { data: shipments, error: shipmentError, loading: shipmentsLoading, reload: reloadShipments } = useRemote<{ shipments: Shipment[] }>(`/api/woo/orders/${id}/shipments`, "Tracking could not be loaded.");
  const { data: settings, error: settingsError, loading: settingsLoading, reload: reloadSettings } = useRemote<StoreSettings>("/api/settings", "Store details could not be loaded.");
  const storeError = settingsError || (settings && !settings.store ? "Store details could not be loaded." : "");
  const printReady = Boolean(order && !loading && !shipmentsLoading && !settingsLoading && !shipmentError && !storeError);

  const toolbar = (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/orders/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to order</Link>
      <button type="button" onClick={() => window.print()} disabled={!printReady}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        <Printer className="size-4" aria-hidden="true" />Print packing slip
      </button>
    </div>
  );

  if (!order) {
    return <div className="min-h-screen bg-muted/30 p-4 sm:p-8">{toolbar}
      <div className="mx-auto mt-6 max-w-3xl rounded-xl border bg-background">{loading ? <LoadingState label="Loading order…" /> : <ErrorState message={error || "Order not found."} onRetry={reload} />}</div>
    </div>;
  }

  const store = settings?.store;
  const storeAddress = store?.address ? addressLines({ first_name: "", last_name: "", ...store.address } as WooAddress) : [];
  const shipToShipping = hasAddress(order.shipping);
  const destination = shipToShipping ? order.shipping : order.billing;
  const phone = order.shipping.phone || order.billing.phone;
  const created = wooDate(order.date_created, order.date_created_gmt);
  const units = order.line_items.reduce((count, item) => count + item.quantity, 0);
  const methods = (order.shipping_lines || []).map(line => plainText(line.method_title)).filter(Boolean);
  const tracking = shipments?.shipments || [];

  return <div className="min-h-screen bg-muted/30 p-4 sm:p-8 print:min-h-0 print:bg-white print:p-0">
    {toolbar}
    {storeError && <div className="mx-auto mt-4 max-w-3xl print:hidden"><ErrorState message={storeError} onRetry={reloadSettings} /></div>}
    {shipmentError && <div className="mx-auto mt-4 max-w-3xl print:hidden"><ErrorState message={shipmentError} onRetry={reloadShipments} /></div>}
    {(settingsLoading || shipmentsLoading) && <p role="status" className="mx-auto mt-4 max-w-3xl text-sm print:hidden">Loading store details and tracking before printing…</p>}
    {/* The sheet is always light so it prints and previews the same in dark mode. */}
    <article className="mx-auto mt-6 max-w-3xl rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:mt-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <p className="text-lg font-semibold">{plainText(store?.name || "Packing slip")}</p>
          {storeAddress.length > 0 && <address className="mt-1 text-sm not-italic leading-5 text-neutral-600">{storeAddress.map((line, index) => <span key={index} className="block">{line}</span>)}</address>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-semibold tracking-tight">Packing slip</h1>
          <p className="mt-1 text-sm">Order <strong>#{order.number}</strong></p>
          <p className="text-sm text-neutral-600">{formatDateTime(created, settings?.timezone || timeZone)}</p>
        </div>
      </header>

      <section className="grid gap-6 border-b border-neutral-300 py-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Ship to</h2>
          {hasAddress(destination)
            ? <address className="mt-2 text-sm not-italic leading-6">{addressLines(destination).map((line, index) => <span key={index} className="block">{line}</span>)}</address>
            : <p className="mt-2 text-sm text-neutral-600">No address on this order.</p>}
          {!shipToShipping && hasAddress(order.billing) && <p className="mt-1 text-xs text-neutral-500">No shipping address; billing address shown.</p>}
          {phone && <p className="mt-2 text-sm">Phone: {phone}</p>}
        </div>
        <div className="space-y-3 text-sm">
          {methods.length > 0 && <div><h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Shipping method</h2><p className="mt-1">{methods.join(", ")}</p></div>}
          {tracking.length > 0 && <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Tracking</h2>
            <ul className="mt-1 space-y-0.5">{tracking.map(item => <li key={item.id} className="break-all">{item.carrier}: {item.tracking_number}</li>)}</ul>
          </div>}
          {shipmentError && <p className="text-xs text-neutral-500 print:hidden">Tracking could not be loaded, so it is not shown.</p>}
        </div>
      </section>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="w-10 pb-2"><span className="sr-only">Packed</span></th>
            <th className="pb-2">Item</th>
            <th className="pb-2">SKU</th>
            <th className="pb-2 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {order.line_items.map(item => {
            const meta = itemMeta(item);
            return <tr key={item.id} className="border-b border-neutral-200 align-top break-inside-avoid">
              <td className="py-3"><span className="inline-block size-4 rounded-sm border border-neutral-500" aria-hidden="true" /></td>
              <td className="py-3 pr-4">
                <p className="font-medium">{plainText(item.name)}</p>
                {meta.length > 0 && <p className="mt-0.5 text-xs text-neutral-600">{meta.map(entry => `${entry.label}: ${entry.value}`).join(" · ")}</p>}
              </td>
              <td className="py-3 pr-4 font-mono text-xs">{item.sku || "—"}</td>
              <td className="py-3 text-right text-base font-semibold tabular-nums">{item.quantity}</td>
            </tr>;
          })}
        </tbody>
        <tfoot>
          <tr><td /><td className="pt-3 text-sm text-neutral-600" colSpan={2}>{order.line_items.length} line{order.line_items.length === 1 ? "" : "s"}</td><td className="pt-3 text-right font-semibold tabular-nums">{units} unit{units === 1 ? "" : "s"}</td></tr>
        </tfoot>
      </table>

      {order.customer_note?.trim() && <section className="mt-6 rounded-lg border border-neutral-300 p-4 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Customer note</h2>
        <p className="mt-1 whitespace-pre-wrap break-words">{plainText(order.customer_note)}</p>
      </section>}

      <footer className="mt-8 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        {settings?.timezone_warning && <p className="mb-2">{settings.timezone_warning}</p>}
        Packing slip for fulfilment only. This is not a tax invoice and shows no prices.
      </footer>
    </article>
  </div>;
}
