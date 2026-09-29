import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { isId } from "@/lib/woocommerce/validation";
import { readShipments, shipmentMeta, type OrderWithMeta, type Shipment } from "@/lib/woocommerce/shipments";

type Context = { params: Promise<{ id: string }> };

async function loadOrder(id: string) {
  return wooFetch<OrderWithMeta>(`orders/${id}`);
}

function validTrackingUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && value.length <= 2048;
  } catch { return false; }
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export async function GET(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const { shipments } = readShipments(await loadOrder(id));
    return NextResponse.json({ shipments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load shipments." }, { status: 502 });
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || !body || typeof body.carrier !== "string" || !body.carrier.trim() || body.carrier.length > 80 ||
      typeof body.tracking_number !== "string" || !body.tracking_number.trim() || body.tracking_number.length > 120 ||
      typeof body.tracking_url !== "string" || !validTrackingUrl(body.tracking_url) ||
      typeof body.shipped_at !== "string" || !validDate(body.shipped_at)) {
    return NextResponse.json({ error: "Provide a carrier, tracking number, and valid optional HTTPS link and date." }, { status: 400 });
  }
  try {
    const { metaId, shipments } = readShipments(await loadOrder(id));
    if (shipments.length >= 50) return NextResponse.json({ error: "This order already has 50 shipments." }, { status: 400 });
    if (shipments.some(shipment => shipment.carrier.toLowerCase() === body.carrier.trim().toLowerCase() &&
        shipment.tracking_number.toLowerCase() === body.tracking_number.trim().toLowerCase())) {
      return NextResponse.json({ error: "This tracking number is already saved for that carrier." }, { status: 409 });
    }
    const shipment: Shipment = {
      id: crypto.randomUUID(),
      carrier: body.carrier.trim(),
      tracking_number: body.tracking_number.trim(),
      tracking_url: body.tracking_url.trim(),
      shipped_at: body.shipped_at,
    };
    const updated = [...shipments, shipment];
    await wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ meta_data: shipmentMeta(metaId, updated) }) });
    return NextResponse.json({ shipments: updated }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add shipment." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || typeof body?.shipment_id !== "string" || !body.shipment_id) {
    return NextResponse.json({ error: "Invalid order or shipment ID." }, { status: 400 });
  }
  try {
    const { metaId, shipments } = readShipments(await loadOrder(id));
    const updated = shipments.filter(shipment => shipment.id !== body.shipment_id);
    if (updated.length === shipments.length) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    await wooFetch(`orders/${id}`, { method: "PUT", body: JSON.stringify({ meta_data: shipmentMeta(metaId, updated) }) });
    return NextResponse.json({ shipments: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove shipment." }, { status: 502 });
  }
}
