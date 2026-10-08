import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/request-guard";
import { dashboardCountQuery, isCountCard, isDashboardCard } from "@/lib/dashboard";
import { isWooCommerceConfigured, wooFetchWithHeaders, WooApiError } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";
import { readOrderStatuses } from "@/lib/woocommerce/order-statuses";
import { isOrderStatus } from "@/lib/woocommerce/validation";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const cards = (request.nextUrl.searchParams.get("cards") || "").split(",");
  if (cards.length > 4 || new Set(cards).size !== cards.length || !cards.every(card => isDashboardCard(card) && isCountCard(card))) return NextResponse.json({ error: "Invalid dashboard cards." }, { status: 400 });
  if (!isWooCommerceConfigured()) return NextResponse.json({ configured: false, counts: {} });
  try {
    const custom = cards.filter(card => card.startsWith("status:") && !isOrderStatus(card.slice(7)));
    if (custom.length) {
      const statuses = await readOrderStatuses();
      if (custom.some(card => !statuses.some(status => status.slug === card.slice(7) && status.settable))) return NextResponse.json({ error: "A selected order status is no longer available." }, { status: 400 });
    }
    const { timezone, timezone_warning } = await readStoreTimezone();
    const now = new Date();
    const entries = await Promise.all(cards.map(async card => {
      const result = await wooFetchWithHeaders(`orders?${dashboardCountQuery(card, timezone, now)}`);
      if (!result.totalAvailable || !Number.isSafeInteger(result.total)) throw new WooApiError("The store did not return a valid order count.", 502);
      return [card, result.total] as const;
    }));
    return NextResponse.json({ configured: true, counts: Object.fromEntries(entries), timezone, timezone_warning });
  } catch (cause) { return wooErrorResponse(cause, "Could not load dashboard counts."); }
}
