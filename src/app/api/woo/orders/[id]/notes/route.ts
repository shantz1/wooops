import { authorizeRequest, requirePermissions } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { isId } from "@/lib/woocommerce/validation";
import type { WooOrderNote } from "@/types/woocommerce";

type Context = { params: Promise<{ id: string }> };
const noteTypes = ["any", "customer", "internal"];

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") || "any";
  if (!isId(id) || !noteTypes.includes(type)) return NextResponse.json({ error: "Invalid order ID or note type." }, { status: 400 });
  try { return NextResponse.json(await wooFetch<WooOrderNote[]>(`orders/${id}/notes?type=${type}`)); }
  catch (error) { return wooErrorResponse(error, "Unable to load notes."); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readRequestJson(request).catch(() => null);
  if (!isId(id) || typeof body?.note !== "string" || !body.note.trim() || body.note.length > 5000 ||
      (body.customer_note !== undefined && typeof body.customer_note !== "boolean")) {
    return NextResponse.json({ error: "Provide a valid order ID and a note of up to 5,000 characters." }, { status: 400 });
  }
  // A customer-facing note is shown to the customer and may be emailed.
  if (body.customer_note === true) { const notify = requirePermissions(request, ["orders.notify"]); if (notify) return notify; }
  try {
    return NextResponse.json(await wooFetch<WooOrderNote>(`orders/${id}/notes`, {
      method: "POST", body: JSON.stringify({ note: body.note.trim(), customer_note: body.customer_note === true }),
    }), { status: 201 });
  } catch (error) {
    return wooErrorResponse(error, "Unable to add note.");
  }
}
