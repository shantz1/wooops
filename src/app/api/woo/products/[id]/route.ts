import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { isId } from "@/lib/woocommerce/validation";
import type { WooProduct } from "@/types/woocommerce";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`products/${id}`)); }
  catch (error) { return wooErrorResponse(error, "Unable to load product."); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readRequestJson(request).catch(() => null);
  if (!isId(id) || !Number.isSafeInteger(body?.stock_quantity) || body.stock_quantity < 0 ||
      body.enable_stock_management !== undefined && typeof body.enable_stock_management !== "boolean") {
    return NextResponse.json({ error: "Provide a valid product ID and non-negative stock quantity." }, { status: 400 });
  }
  try {
    const current = await wooFetch<WooProduct>(`products/${id}`);
    if (!current.manage_stock && body.enable_stock_management !== true) {
      return NextResponse.json({ error: "This product does not manage stock. Explicitly confirm enabling stock management first." }, { status: 409 });
    }
    return NextResponse.json(await wooFetch(`products/${id}`, {
      method: "PUT", body: JSON.stringify({ stock_quantity: body.stock_quantity, ...(!current.manage_stock ? { manage_stock: true } : {}) }),
    }));
  } catch (error) {
    return wooErrorResponse(error, "Unable to update stock.");
  }
}
