import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { clearOrderStatuses, isSettableStatus } from "@/lib/woocommerce/order-statuses";
import { isId } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`orders/${id}`)); }
  catch (error) { return wooErrorResponse(error, "Unable to load order."); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readRequestJson(request).catch(() => null);
  if (!isId(id) || !(await isSettableStatus(body?.status))) {
    return NextResponse.json({ error: "Invalid order ID or status." }, { status: 400 });
  }
  try {
    const order = await wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ status: body.status }) });
    clearOrderStatuses();
    return NextResponse.json(order);
  }
  catch (error) { return wooErrorResponse(error, "Unable to update order."); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  void params;
  return NextResponse.json({ error: "Order deletion is not supported." }, { status: 405, headers: { Allow: "GET, PATCH" } });
}
