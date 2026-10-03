import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { pageParam, searchParam } from "@/lib/woocommerce/validation";
import type { WooCustomer } from "@/types/woocommerce";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  if (!isWooCommerceConfigured()) {
    return NextResponse.json({ configured: false, customers: [], total: 0, pages: 0 });
  }

  const params = request.nextUrl.searchParams;
  const query = new URLSearchParams({
    page: String(pageParam(params.get("page"), 1)),
    per_page: String(pageParam(params.get("per_page"), 20, 100)),
    orderby: "registered_date",
    order: "desc",
    _fields: "id,first_name,last_name,email,billing.phone,orders_count,total_spent",
  });
  const search = searchParam(params.get("search"));
  if (search) query.set("search", search);

  try {
    const result = await wooFetchWithHeaders<WooCustomer[]>(`customers?${query}`);
    return NextResponse.json({ configured: true, customers: result.data, total: result.total, pages: result.pages });
  } catch (error) {
    return wooErrorResponse(error, "Unable to load customers.");
  }
}
