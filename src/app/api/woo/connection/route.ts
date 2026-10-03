import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetch } from "@/lib/woocommerce/client";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  if (!isWooCommerceConfigured()) return NextResponse.json({ configured: false });
  try {
    await wooFetch("products?per_page=1&_fields=id");
    return NextResponse.json({ configured: true });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "Connection failed" }, { status: 502 });
  }
}
