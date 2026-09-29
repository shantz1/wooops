import { NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetch } from "@/lib/woocommerce/client";
import type { WooOrder } from "@/types/woocommerce";

export async function GET() {
  if (!isWooCommerceConfigured()) {
    return NextResponse.json({ configured: false, orders: [] });
  }

  try {
    const orders = await wooFetch<WooOrder[]>("orders?per_page=10&orderby=date&order=desc");
    return NextResponse.json({ configured: true, orders });
  } catch (error) {
    return NextResponse.json(
      { configured: true, orders: [], error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
