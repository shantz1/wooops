import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { WooApiError, wooFetch, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { withOrderLock } from "@/lib/woocommerce/order-lock";
import { findRefundByRequestId, parseRefundRequest, refundMetaKey, remainingUnits, toUnits } from "@/lib/woocommerce/refund";
import { isId } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };

/** After a timeout or unreadable reply the store may still be creating the refund, so the order stays locked for a while. */
const unknownOutcomeHoldMs = 45_000;
const holdAfter = (error: unknown) => (error instanceof WooApiError && [400, 404, 409, 429, 503].includes(error.status) ? 0 : unknownOutcomeHoldMs);
type Refund = { id: number; meta_data?: Array<{ key: string; value: unknown }> };
type Order = { total: string; refunds?: Array<{ total: string }> };

/** Every refund on an order. WooCommerce returns 10 per page by default, so all pages are read. */
async function allRefunds(id: string): Promise<Refund[]> {
  const all: Refund[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, pages } = await wooFetchWithHeaders<Refund[]>(`orders/${id}/refunds?per_page=100&page=${page}`);
    all.push(...data);
    if (page >= pages) return all;
  }
  throw new Error("This order has too many refunds to read safely.");
}

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(await allRefunds(id)); }
  catch (error) { return wooErrorResponse(error, "Unable to load refunds."); }
}

/**
 * Records a refund. By default nothing is sent to the payment gateway (`gateway: true` asks for that).
 * The request id is stored on the refund, so a retry returns the refund that was already made.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const parsed = parseRefundRequest(await readRequestJson(request).catch(() => null));
  if (!isId(id) || !parsed.ok) return NextResponse.json({ error: parsed.ok ? "Invalid order ID." : parsed.error }, { status: 400 });
  const refund = parsed.refund;
  try {
    return await withOrderLock(id, async () => {
      const existing = findRefundByRequestId(await allRefunds(id), refund.requestId);
      if (existing) return NextResponse.json({ refund: existing, order: await wooFetch(`orders/${id}`), duplicate: true });
      const before = await wooFetch<Order>(`orders/${id}`);
      if (toUnits(refund.amount) > remainingUnits(before)) {
        return NextResponse.json({ error: "That is more than what is left to refund on this order." }, { status: 409 });
      }
      const created = await wooFetch<Refund>(`orders/${id}/refunds`, {
        method: "POST",
        body: JSON.stringify({
          amount: refund.amount,
          reason: refund.reason,
          api_refund: refund.gateway,
          api_restock: refund.restock,
          line_items: refund.items.map(item => ({
            id: item.id,
            quantity: item.quantity,
            refund_total: item.refund_total,
            ...(item.taxes.length ? { refund_tax: item.taxes } : {}),
          })),
          meta_data: [{ key: refundMetaKey, value: refund.requestId }],
        }),
      });
      return NextResponse.json({ refund: created, order: await wooFetch(`orders/${id}`) }, { status: 201 });
    }, holdAfter);
  } catch (error) { return wooErrorResponse(error, "Unable to record the refund."); }
}
