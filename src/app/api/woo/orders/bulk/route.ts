import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { isId, isOrderStatus } from "@/lib/woocommerce/validation";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 ||
      !body.ids.every(isId) || !isOrderStatus(body.status)) {
    return NextResponse.json({ error: "Provide 1 to 100 valid order IDs and a valid status." }, { status: 400 });
  }
  try {
    const results = await Promise.allSettled(body.ids.map((id: number) =>
      wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ status: body.status }) }),
    ));
    const updated = results.filter(result => result.status === "fulfilled").length;
    if (updated !== results.length) {
      return NextResponse.json({ error: `${updated} of ${results.length} orders updated. Refresh before retrying.`, updated }, { status: 502 });
    }
    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json({ error: "Bulk update failed." }, { status: 502 });
  }
}
