import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { isId } from "@/lib/woocommerce/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`orders/${id}/notes`)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load notes." }, { status: 502 }); }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || typeof body?.note !== "string" || !body.note.trim() || body.note.length > 5000 ||
      (body.customer_note !== undefined && typeof body.customer_note !== "boolean")) {
    return NextResponse.json({ error: "Provide a valid order ID and note." }, { status: 400 });
  }
  try {
    return NextResponse.json(await wooFetch(`orders/${id}/notes`, {
      method: "POST", body: JSON.stringify({ note: body.note.trim(), customer_note: body.customer_note === true }),
    }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add note." }, { status: 502 });
  }
}
