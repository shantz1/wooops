import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import type { WooCustomer } from "@/types/woocommerce";

export async function GET(request: NextRequest) {
  if (!isWooCommerceConfigured()) {
    return NextResponse.json({ configured: false, customers: [], total: 0, pages: 0 });
  }

  const params = request.nextUrl.searchParams;
  const query = new URLSearchParams({
    page: params.get("page") || "1",
    per_page: params.get("per_page") || "20",
    orderby: "registered_date",
    order: "desc",
  });
  if (params.get("search")) query.set("search", params.get("search")!);

  try {
    const result = await wooFetchWithHeaders<WooCustomer[]>(`customers?${query}`);
    return NextResponse.json({ configured: true, customers: result.data, total: result.total, pages: result.pages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load customers." }, { status: 502 });
  }
}
