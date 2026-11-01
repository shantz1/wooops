"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { labelContent } from "@/lib/print-documents";
import { useRemote } from "@/lib/use-remote";
import type { WooOrder } from "@/types/woocommerce";

/**
 * A printable shipping label: the recipient and nothing else (no email, items, prices or notes). Field selection
 * lives in `labelContent` in src/lib/print-documents.ts. The page is sized for a 100 mm × 150 mm label.
 */
export function AddressLabel({ id }: { id: string }) {
  const [includeBillingPhone, setIncludeBillingPhone] = useState(false);
  const { data: order, error, loading, reload } = useRemote<WooOrder>(`/api/woo/orders/${id}`, "Unable to load order.");
  const label = order ? labelContent(order, { includeBillingPhone }) : null;
  const printReady = Boolean(label && !loading && !error);

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

  if (!label) {
    return <div className="min-h-screen p-4 sm:p-8">{toolbar}
      <div className="mx-auto mt-6 max-w-3xl rounded-xl border bg-background"><ErrorState message="This order has no shipping address to print." /></div>
    </div>;
  }

  return <div className="min-h-screen p-4 sm:p-8 print:min-h-0 print:bg-white print:p-0">
    {/* The label is a fixed 100 mm × 150 mm sheet when printed. */}
    <style>{`@media print { @page { size: 100mm 150mm; margin: 6mm } }`}</style>
    {toolbar}
    {!order.shipping.phone && order.billing.phone && <label className="mx-auto mt-4 flex max-w-3xl items-start gap-2 text-sm print:hidden"><input type="checkbox" checked={includeBillingPhone} onChange={event => setIncludeBillingPhone(event.target.checked)} className="mt-0.5 size-4" /><span>Use the billing phone as the delivery contact: {order.billing.phone}. Only include it if this is the correct contact for the recipient.</span></label>}
    {error && <div className="mx-auto mt-4 max-w-3xl print:hidden"><Notice tone="warning" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded address. {error}</Notice></div>}
    <article className="mx-auto mt-6 max-w-md rounded-xl border bg-white p-8 text-neutral-900 shadow-sm print:mt-0 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <h1 className="text-sm font-semibold uppercase tracking-wider text-neutral-600">Deliver to</h1>
      <p className="mt-3 break-words text-3xl font-bold leading-tight">{label.name}</p>
      {label.company && <p className="mt-1 break-words text-2xl font-semibold leading-tight">{label.company}</p>}
      <address className="mt-4 text-2xl not-italic leading-snug">
        {label.lines.map((line, index) => <span key={index} className="block break-words">{line}</span>)}
        {label.postcode && <span className="block font-bold">{label.postcode}</span>}
        {label.country && <span className="block">{label.country}</span>}
      </address>
      {label.phone && <p className="mt-4 text-2xl">Phone: <span className="font-semibold">{label.phone}</span></p>}
      <p className="mt-6 text-xs text-neutral-600">Order #{label.orderNumber}</p>
    </article>
  </div>;
}
