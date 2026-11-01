"use client";

import { usePanelPreferences } from "@/components/panel-preferences";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { formatDateTime } from "@/lib/format";
import { buildTimeline, type TimelineEvent, type TimelineNote, type TimelineRefund, type TimelineShipment } from "@/lib/order-timeline";
import { useRemote } from "@/lib/use-remote";
import type { WooOrder, WooOrderNote } from "@/types/woocommerce";

type ShipmentResponse = { shipments?: TimelineShipment[] };
type RefundResponse = TimelineRefund[];

const dotColor: Record<TimelineEvent["kind"], string> = {
  refund: "text-destructive",
  "note-customer": "text-primary",
  placed: "text-muted-foreground",
  paid: "text-muted-foreground",
  completed: "text-muted-foreground",
  status: "text-muted-foreground",
  "note-private": "text-muted-foreground",
  shipment: "text-muted-foreground",
};

const caption = "Built from the order's dates, its notes, tracking entries and refunds. WooCommerce does not keep a complete audit log, so changes to addresses, items or totals may not appear here.";

/**
 * Read-only order timeline. Each source loads independently. A failed source is named in a warning with its own
 * Retry button, and the timeline is built from whatever did load.
 */
export function OrderActivity({ order, refreshKey = 0 }: { order: WooOrder; refreshKey?: number }) {
  const { timeZone } = usePanelPreferences();
  const notesState = useRemote<WooOrderNote[]>(`/api/woo/orders/${order.id}/notes`, "Could not load notes.", refreshKey);
  const shipmentsState = useRemote<ShipmentResponse>(`/api/woo/orders/${order.id}/shipments`, "Could not load tracking entries.", refreshKey);
  const refundsState = useRemote<RefundResponse>(`/api/woo/orders/${order.id}/refunds`, "Could not load refunds.", refreshKey);

  const notes = notesState.data;
  const shipments = shipmentsState.data;
  const refunds = refundsState.data;
  const anyLoaded = notes !== null || shipments !== null || refunds !== null;
  const anyLoading = notesState.loading || shipmentsState.loading || refundsState.loading;

  const events = useMemo(() => buildTimeline({
    order,
    notes: (notes ?? []) as TimelineNote[],
    shipments: shipments?.shipments ?? [],
    refunds: refunds ?? [],
    timeZone,
  }), [order, notes, shipments, refunds, timeZone]);

  const failures = [
    { name: "notes", error: notesState.error, reload: notesState.reload },
    { name: "tracking entries", error: shipmentsState.error, reload: shipmentsState.reload },
    { name: "refunds", error: refundsState.error, reload: refundsState.reload },
  ].filter(item => item.error);

  return (
    <section aria-labelledby="activity-heading" className="rounded-xl border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b p-5">
        <Activity className="size-5" aria-hidden="true" />
        <h2 id="activity-heading" className="font-semibold">Activity</h2>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted-foreground">{caption}</p>
        {failures.map(item => (
          <Notice key={item.name} tone="warning" action={<RetryButton onRetry={item.reload} busy={anyLoading} />}>
            Could not load {item.name}. {item.error}
          </Notice>
        ))}
        {anyLoaded && anyLoading && <p role="status" className="text-sm text-muted-foreground">Still loading the rest of the activity. This list is not complete yet.</p>}
        {!anyLoaded ? (
          anyLoading ? <LoadingState label="Loading activity…" className="py-10" />
            : failures.length === 0 ? null
              : <ErrorState message="Could not load activity." onRetry={() => failures.forEach(item => item.reload())} className="py-10" />
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded.</p>
        ) : (
          <ol className="divide-y">
            {events.map(event => (
              <li key={event.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <span aria-hidden="true" className={`mt-2 size-2 shrink-0 rounded-full bg-current ${dotColor[event.kind]}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    {event.kind === "note-customer" && <span className="rounded-full border px-2 py-0.5 text-xs font-medium">Customer-facing</span>}
                    {event.kind === "note-private" && <span className="rounded-full border px-2 py-0.5 text-xs font-medium">Private</span>}
                  </div>
                  {event.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.detail}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    <time dateTime={event.at}>{event.dateOnly ? new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "medium" }).format(new Date(event.at)) : formatDateTime(new Date(event.at), timeZone)}</time>
                    {event.source === "note" && <> · Order note</>}
                    {event.actor && <> · {event.actor}</>}
                    {event.approximate && <> · approximate</>}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
