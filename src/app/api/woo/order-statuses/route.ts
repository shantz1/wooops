import { authorizeRequest } from "@/lib/request-guard";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { readOrderStatuses } from "@/lib/woocommerce/order-statuses";

/** GET /api/woo/order-statuses — the store's statuses (standard and custom) with order counts. */
export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  if (!isWooCommerceConfigured()) return NextResponse.json({ statuses: [] });
  try {
    return NextResponse.json({ statuses: await readOrderStatuses(request.nextUrl.searchParams.get("fresh") === "1") });
  } catch (error) {
    return wooErrorResponse(error, "Unable to load order statuses.");
  }
}
