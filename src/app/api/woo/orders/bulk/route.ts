import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { clearOrderStatuses, isSettableStatus } from "@/lib/woocommerce/order-statuses";
import { isId } from "@/lib/woocommerce/validation";

export async function POST(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const body = await readRequestJson(request).catch(() => null);
  if (!body || !Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 100 ||
      !body.ids.every(isId) || !(await isSettableStatus(body.status))) {
    return NextResponse.json({ error: "Provide 1 to 100 valid order IDs and a valid status." }, { status: 400 });
  }
  try {
    const results = await Promise.allSettled(body.ids.map((id: number) =>
      wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ status: body.status }) }),
    ));
    const updated = results.filter(result => result.status === "fulfilled").length;
    clearOrderStatuses();
    if (updated !== results.length) {
      return NextResponse.json({ error: `${updated} of ${results.length} orders updated. Refresh before retrying.`, updated }, { status: 502 });
    }
    return NextResponse.json({ updated });
  } catch {
    return NextResponse.json({ error: "Bulk update failed." }, { status: 502 });
  }
}
