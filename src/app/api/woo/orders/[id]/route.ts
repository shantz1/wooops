import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { isId, isOrderStatus } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`orders/${id}`)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load order." }, { status: 502 }); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || !isOrderStatus(body?.status)) {
    return NextResponse.json({ error: "Invalid order ID or status." }, { status: 400 });
  }
  try { return NextResponse.json(await wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ status: body.status }) })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update order." }, { status: 502 }); }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`orders/${id}`, { method: "DELETE" })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete order." }, { status: 502 }); }
}
