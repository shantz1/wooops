import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetch, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import type { WooProduct } from "@/types/woocommerce";

export async function GET(request: NextRequest) {
  if (!isWooCommerceConfigured()) return NextResponse.json({ configured: false, products: [], total: 0, pages: 0 });
  const params = request.nextUrl.searchParams;
  const query = new URLSearchParams({
    page: params.get("page") || "1",
    per_page: params.get("per_page") || "20",
    orderby: "date",
    order: "desc",
  });
  if (params.get("search")) query.set("search", params.get("search")!);
  try {
    const result = await wooFetchWithHeaders<WooProduct[]>(`products?${query}`);
    return NextResponse.json({ configured: true, products: result.data, total: result.total, pages: result.pages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load products." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const valid = body && typeof body.name === "string" && body.name.trim().length > 0 && body.name.length <= 200 &&
    typeof body.regular_price === "string" && /^\d+(?:\.\d{1,2})?$/.test(body.regular_price) &&
    (body.sku === undefined || (typeof body.sku === "string" && body.sku.length <= 100)) &&
    (body.description === undefined || (typeof body.description === "string" && body.description.length <= 10000)) &&
    (body.status === "draft" || body.status === "publish") && typeof body.manage_stock === "boolean" &&
    (!body.manage_stock || (Number.isSafeInteger(body.stock_quantity) && body.stock_quantity >= 0));
  if (!valid) return NextResponse.json({ error: "Invalid simple product details." }, { status: 400 });

  const payload = {
    name: body.name.trim(),
    type: "simple",
    regular_price: body.regular_price,
    sku: body.sku?.trim() || "",
    description: body.description?.trim() || "",
    status: body.status,
    manage_stock: body.manage_stock,
    ...(body.manage_stock ? { stock_quantity: body.stock_quantity } : {}),
  };
  try {
    return NextResponse.json(await wooFetch<WooProduct>("products", { method: "POST", body: JSON.stringify(payload) }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create product." }, { status: 502 });
  }
}
