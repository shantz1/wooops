import { authorizeRequest, requirePermissions } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { clearOrderStatuses, isSettableStatus } from "@/lib/woocommerce/order-statuses";
import { addressFields, billingFields, isStale, parseOrderUpdate, savedAddress } from "@/lib/woocommerce/order-update";
import { isId } from "@/lib/woocommerce/validation";
import { orderRevision, withOrderRevision } from "@/lib/woocommerce/order-revision";
import { withOrderLock } from "@/lib/woocommerce/order-lock";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(withOrderRevision(await wooFetch<Record<string, unknown>>(`orders/${id}`))); }
  catch (error) { return wooErrorResponse(error, "Unable to load order."); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readRequestJson(request).catch(() => null);
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID or status." }, { status: 400 });
  const parsed = await parseOrderUpdate(body, isSettableStatus);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return await withOrderLock(`order-${id}`, async () => {
      const { if_unmodified_since: since, if_match: revision, replace_addresses: replace, ...changes } = parsed.update;
      if (changes.customer_id !== undefined) {
        const needed = requirePermissions(request, ["orders.view", ...(changes.customer_id > 0 ? ["customers.view" as const] : [])]);
        if (needed) return needed;
      }
      if (replace) {
        // Reading a customer's saved addresses is a customer permission of its own.
        const needed = requirePermissions(request, ["customers.view"]);
        if (needed) return needed;
      }
      if (changes.customer_id) {
        // Only registered customers can be assigned; this also rejects ids of staff or deleted accounts.
        const customer = await wooFetch<{ id: number; role?: string }>(`customers/${changes.customer_id}`);
        if (customer.id !== changes.customer_id || customer.role !== "customer") return NextResponse.json({ error: "Choose a registered customer." }, { status: 400 });
        if (replace) {
          const saved = customer as { billing?: unknown; shipping?: unknown };
          changes.billing = savedAddress(saved.billing, billingFields);
          changes.shipping = savedAddress(saved.shipping, addressFields);
          const validated = await parseOrderUpdate({ billing: changes.billing, shipping: changes.shipping }, isSettableStatus);
          if (!validated.ok) return NextResponse.json({ error: "The customer's saved addresses are invalid. Correct the customer record before copying them." }, { status: 400 });
          Object.assign(changes, validated.update);
        }
      }
      if (since !== undefined || revision !== undefined) {
        const current = await wooFetch<Record<string, unknown>>(`orders/${id}`);
        if (isStale(since, current.date_modified_gmt as string | undefined) || revision !== undefined && revision !== orderRevision(current)) return NextResponse.json({ error: "This order was changed after you opened it. Reload it and make the change again.", stale: true }, { status: 409 });
      }
      const order = await wooFetch<Record<string, unknown>>(`orders/${id}`, { method: "PUT", body: JSON.stringify(changes) });
      if (changes.status) clearOrderStatuses();
      return NextResponse.json(withOrderRevision(order));
    });
  }
  catch (error) { return wooErrorResponse(error, "Unable to update order."); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  void params;
  return NextResponse.json({ error: "Order deletion is not supported." }, { status: 405, headers: { Allow: "GET, PATCH" } });
}
