import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch, WooApiError } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { withOrderLock } from "@/lib/woocommerce/order-lock";
import { cooldownLeft, markRequested, parseResendBody, resendRecipient, sameRecipient, sendRoute, supportsRecipientGuard } from "@/lib/woocommerce/order-email";
import { isId } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };
type EmailOrder = { billing?: { email?: string } };

/** Whether this store's WooCommerce offers the native "send order details" action. */
async function actionAvailable() {
  const index = await wooFetch<{ routes?: Record<string, unknown> }>("");
  return supportsRecipientGuard(index.routes?.[sendRoute]);
}

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const [order, available] = await Promise.all([wooFetch<EmailOrder>(`orders/${id}`), actionAvailable()]);
    return NextResponse.json({ available, recipient: resendRecipient(order) });
  } catch (error) { return wooErrorResponse(error, "Unable to check the email option."); }
}

/**
 * Asks WooCommerce to send its "order details" email to the order's billing address. The caller repeats the address it
 * showed the user; if the address changed since, nothing is sent. No address override is accepted or forwarded, and a
 * second request for the same order within a minute is refused.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = parseResendBody(await readRequestJson(request).catch(() => null));
  if (!isId(id) || !body.ok) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    return await withOrderLock(`order-${id}`, async () => {
      const [order, available] = await Promise.all([wooFetch<EmailOrder>(`orders/${id}`), actionAvailable()]);
      if (!available) return NextResponse.json({ error: "This store's WooCommerce version cannot resend order details from here." }, { status: 501 });
      const recipient = resendRecipient(order);
      if (!recipient) return NextResponse.json({ error: "This order has no valid billing email address, so there is nobody to send it to." }, { status: 409 });
      if (!sameRecipient(body.confirmEmail, recipient)) return NextResponse.json({ error: "The billing email changed after you opened this order. Reload it and check the address." }, { status: 409 });
      if (cooldownLeft(id) > 0) return NextResponse.json({ error: "Order details were already requested for this order a moment ago. Check the order notes before trying again." }, { status: 429 });
      markRequested(id);
      // The server-read confirmed address is repeated to WooCommerce, whose guard rejects a different existing
      // recipient at send time. Never forward a caller-supplied override or force a billing email change.
      const result = await wooFetch<{ message?: unknown }>(`orders/${id}/actions/send_order_details`, { method: "POST", body: JSON.stringify({ email: recipient, force_email_update: false }) });
      if (typeof result?.message !== "string" || !result.message.trim()) throw new WooApiError("The store did not confirm the email request.", 502);
      return NextResponse.json({ accepted: true, recipient });
    });
  } catch (error) {
    if (error instanceof WooApiError && [502, 504].includes(error.status)) {
      return NextResponse.json({ error: "We could not confirm whether the store sent the email. Check the order notes before trying again.", unknown: true }, { status: error.status });
    }
    return wooErrorResponse(error, "Unable to resend order details.");
  }
}
