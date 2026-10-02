import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetch, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { pageParam, searchParam } from "@/lib/woocommerce/validation";
import type { WooOrder } from "@/types/woocommerce";

export async function GET(request: NextRequest) {
  if (!isWooCommerceConfigured()) return NextResponse.json({ configured: false, orders: [], total: 0, pages: 0 });
  const params = request.nextUrl.searchParams;
  const status = params.get("status") || "all";
  // Custom statuses from extensions are allowed, but only as plain slugs.
  if (!/^[a-z0-9_-]{1,40}$/.test(status)) return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  const query = new URLSearchParams({
    page: String(pageParam(params.get("page"), 1)),
    per_page: String(pageParam(params.get("per_page"), 20, 100)),
    orderby: "date",
    order: "desc",
  });
  const search = searchParam(params.get("search"));
  if (search) query.set("search", search);
  if (status !== "all") query.set("status", status);
  try {
    const result = await wooFetchWithHeaders<WooOrder[]>(`orders?${query}`);
    return NextResponse.json({ configured: true, orders: result.data, total: result.total, pages: result.pages });
  } catch (error) {
    return wooErrorResponse(error, "Unable to load orders.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const order = await wooFetch<WooOrder>("orders", { method: "POST", body: JSON.stringify(body) });
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return wooErrorResponse(error, "Unable to create order.");
  }
}
