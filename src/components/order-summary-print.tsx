"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { formatDateTime, wooDate } from "@/lib/format";
import { summaryContent } from "@/lib/print-documents";
import { storeLocalInstant } from "@/lib/timezone";
import { statusName, useOrderStatuses } from "@/lib/use-order-statuses";
import { useRemote } from "@/lib/use-remote";
import type { WooOrder } from "@/types/woocommerce";

/**
 * A printable order summary: items, totals and where it ships. It has no contact details, notes or meta data,
 * and it is labelled as not a tax invoice. Field selection lives in `summaryContent` in src/lib/print-documents.ts.
 */
export function OrderSummaryPrint({ id }: { id: string }) {
  const { timeZone } = usePanelPreferences();
  const { data: order, error, loading, reload } = useRemote<WooOrder>(`/api/woo/orders/${id}`, "Unable to load order.");
  const statuses = useOrderStatuses();
  const printReady = Boolean(order && !loading && !error);

  const toolbar = (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href={`/orders/${id}`} className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><ArrowLeft className="size-4" aria-hidden="true" />Back to order</Link>
      <button type="button" onClick={() => window.print()} disabled={!printReady}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Printer className="size-4" aria-hidden="true" />Print
      </button>
    </div>
  );

  if (!order) {
    return <div className="min-h-screen p-4 sm:p-8">{toolbar}
      <div className="mx-auto mt-6 max-w-3xl rounded-xl border bg-background">{loading ? <LoadingState label="Loading order…" /> : <ErrorState message={error || "Order not found."} onRetry={reload} />}</div>
    </div>;
  }

  const summary = summaryContent(order);
  const created = summary.created.gmt ? wooDate(summary.created.local, summary.created.gmt) : storeLocalInstant(summary.created.local, timeZone);

  return <div className="min-h-screen p-4 sm:p-8 print:min-h-0 print:bg-white print:p-0">
    {toolbar}
    {error && <div className="mx-auto mt-4 max-w-3xl print:hidden"><Notice tone="warning" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded order. {error}</Notice></div>}
    {/* The sheet is always light so it prints and previews the same in dark mode. */}
    <article className="mx-auto mt-6 max-w-3xl rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:mt-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-neutral-300 pb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order summary</h1>
          <p className="mt-1 text-sm">Order <strong>#{summary.orderNumber}</strong></p>
          <p className="text-sm text-neutral-600">{formatDateTime(created, timeZone)}</p>
        </div>
        <p className="text-sm">Status: <span className="font-medium">{statusName(statuses, summary.status)}</span></p>
      </header>

      <section className="grid gap-6 border-b border-neutral-300 py-6 sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{summary.address.heading}</h2>
          {summary.address.lines.length > 0
            ? <address className="mt-2 text-sm not-italic leading-6">{summary.address.lines.map((line, index) => <span key={index} className="block break-words">{line}</span>)}</address>
            : <p className="mt-2 text-sm text-neutral-600">No address on this order.</p>}
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Payment method</h2>
          <p className="mt-2 text-sm">{summary.payment || "Not recorded"}</p>
        </div>
      </section>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="pb-2">Item</th>
            <th className="pb-2">SKU</th>
            <th className="pb-2 text-right">Qty</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line, index) => (
            <tr key={index} className="border-b border-neutral-200 align-top break-inside-avoid">
              <td className="py-3 pr-4 font-medium">{line.name}</td>
              <td className="py-3 pr-4 font-mono text-xs">{line.sku || "—"}</td>
              <td className="py-3 text-right tabular-nums">{line.quantity}</td>
              <td className="py-3 text-right tabular-nums">{line.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
        {summary.totals.slice(0, -1).map(row => <div key={row.label} className="flex justify-between gap-4"><dt className="text-neutral-600">{row.label}</dt><dd className="tabular-nums">{row.amount}</dd></div>)}
        {summary.totals.slice(-1).map(row => <div key={row.label} className="flex justify-between gap-4 border-t border-neutral-300 pt-2 font-semibold"><dt>{row.label}</dt><dd className="tabular-nums">{row.amount}</dd></div>)}
      </dl>

      <footer className="mt-8 border-t border-neutral-300 pt-4 text-xs text-neutral-500">
        {summary.warning && <p className="mb-2 font-medium">{summary.warning}</p>}
        This is an order summary, not a tax invoice.
      </footer>
    </article>
  </div>;
}
