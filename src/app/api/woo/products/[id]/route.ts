import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { isId } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`products/${id}`)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load product." }, { status: 502 }); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || !Number.isSafeInteger(body?.stock_quantity) || body.stock_quantity < 0) {
    return NextResponse.json({ error: "Provide a valid product ID and non-negative stock quantity." }, { status: 400 });
  }
  try {
    return NextResponse.json(await wooFetch(`products/${id}`, {
      method: "PUT", body: JSON.stringify({ stock_quantity: body.stock_quantity, manage_stock: true }),
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update stock." }, { status: 502 });
  }
}
