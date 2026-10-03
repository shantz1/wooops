import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { pageParam, searchParam } from "@/lib/woocommerce/validation";
import type { WooOrder } from "@/types/woocommerce";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
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
    _fields: "id,number,status,currency,total,date_created,date_created_gmt,customer_id,billing.first_name,billing.last_name,billing.email,payment_method_title",
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
  const denied = authorizeRequest(request);
  if (denied) return denied;
  // No order creation UI exists yet; do not expose an unvalidated pass-through write.
  void request;
  return NextResponse.json({ error: "Order creation is not supported." }, { status: 405, headers: { Allow: "GET" } });
}
