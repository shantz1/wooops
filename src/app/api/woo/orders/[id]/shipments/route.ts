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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

async function notifyCustomer(id: string, order: OrderWithMeta, shipment: Shipment) {
  if (!order.billing?.email) throw new Error("This order has no billing email address.");
  const link = shipment.tracking_url
    ? ` Track it here: <a href="${escapeHtml(shipment.tracking_url)}">${escapeHtml(shipment.tracking_url)}</a>.`
    : "";
  const date = shipment.shipped_at ? ` on ${escapeHtml(shipment.shipped_at)}` : "";
  const note = `Your order was shipped via ${escapeHtml(shipment.carrier)}${date}. Tracking number: ${escapeHtml(shipment.tracking_number)}.${link}`;
  await wooFetch(`orders/${id}/notes`, {
    method: "POST",
    body: JSON.stringify({ note, customer_note: true }),
  });
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
      typeof body.shipped_at !== "string" || !validDate(body.shipped_at) ||
      (body.notify_customer !== undefined && typeof body.notify_customer !== "boolean")) {
    return NextResponse.json({ error: "Provide a carrier, tracking number, and valid optional HTTPS link and date." }, { status: 400 });
  }
  try {
    const order = await loadOrder(id);
    const { metaId, shipments } = readShipments(order);
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
    if (body.notify_customer) {
      try {
        await notifyCustomer(id, order, shipment);
      } catch (error) {
        return NextResponse.json({ shipments: updated, email_triggered: false,
          email_error: error instanceof Error ? error.message : "Customer email could not be triggered." }, { status: 201 });
      }
    }
    return NextResponse.json({ shipments: updated, email_triggered: body.notify_customer === true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add shipment." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || typeof body?.shipment_id !== "string" || !body.shipment_id) {
    return NextResponse.json({ error: "Invalid order or shipment ID." }, { status: 400 });
  }
  try {
    const order = await loadOrder(id);
    const shipment = readShipments(order).shipments.find(item => item.id === body.shipment_id);
    if (!shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    await notifyCustomer(id, order, shipment);
    return NextResponse.json({ email_triggered: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Customer email could not be triggered." }, { status: 502 });
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
