import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { WooApiError, wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { isId } from "@/lib/woocommerce/validation";
import { readShipments, shipmentMeta, type OrderWithMeta, type Shipment } from "@/lib/woocommerce/shipments";

type Context = { params: Promise<{ id: string }> };

async function loadOrder(id: string) {
  return wooFetch<OrderWithMeta>(`orders/${id}`);
}

/**
 * Writes the shipment list and returns the list WooCommerce reports after the update.
 * Shipments use read/modify/write on one metadata value, so simultaneous editors can still overwrite each other.
 */
async function writeShipments(id: string, metaId: number | undefined, shipments: Shipment[]) {
  try {
    const saved = await wooFetch<OrderWithMeta>(`orders/${id}`, {
      method: "PUT", body: JSON.stringify({ meta_data: shipmentMeta(metaId, shipments) }),
    });
    return readShipments(saved).shipments;
  } catch (error) {
    if (error instanceof WooApiError && error.status === 504) {
      throw new WooApiError("WooCommerce did not confirm the tracking change in time. It may or may not have been saved; reload shipments before retrying.", 504);
    }
    throw error;
  }
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

/** Adds a customer-facing order note. WooCommerce accepting the note does not confirm that an email was delivered. */
async function notifyCustomer(id: string, order: OrderWithMeta, shipment: Shipment) {
  if (!order.billing?.email) throw new Error("This order has no billing email address, so no customer note was added.");
  const link = shipment.tracking_url
    ? ` Track it here: <a href="${escapeHtml(shipment.tracking_url)}">${escapeHtml(shipment.tracking_url)}</a>.`
    : "";
  const date = shipment.shipped_at ? ` on ${escapeHtml(shipment.shipped_at)}` : "";
  const note = `Your order was shipped via ${escapeHtml(shipment.carrier)}${date}. Tracking number: ${escapeHtml(shipment.tracking_number)}.${link}`;
  try {
    await wooFetch(`orders/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ note, customer_note: true }),
    });
  } catch (error) {
    if (error instanceof WooApiError && error.status === 504) {
      throw new WooApiError("WooCommerce did not confirm the customer note in time. Check the order notes before sending again.", 504);
    }
    throw error;
  }
}

export async function GET(_: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  try {
    const { shipments } = readShipments(await loadOrder(id));
    return NextResponse.json({ shipments });
  } catch (error) {
    return wooErrorResponse(error, "Unable to load shipments.");
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!isId(id) || !body || typeof body.carrier !== "string" || !body.carrier.trim() || body.carrier.length > 80 ||
      typeof body.tracking_number !== "string" || !body.tracking_number.trim() || body.tracking_number.length > 120 ||
      typeof body.tracking_url !== "string" || !validTrackingUrl(body.tracking_url.trim()) ||
      typeof body.shipped_at !== "string" || !validDate(body.shipped_at) ||
      (body.notify_customer !== undefined && typeof body.notify_customer !== "boolean")) {
    return NextResponse.json({ error: "Provide a carrier, tracking number, and valid optional HTTPS link and date." }, { status: 400 });
  }
  let order: OrderWithMeta;
  let saved: Shipment[];
  let shipment: Shipment;
  try {
    order = await loadOrder(id);
    const { metaId, shipments } = readShipments(order);
    if (shipments.length >= 50) return NextResponse.json({ error: "This order already has 50 shipments." }, { status: 400 });
    if (shipments.some(item => item.carrier.toLowerCase() === body.carrier.trim().toLowerCase() &&
        item.tracking_number.toLowerCase() === body.tracking_number.trim().toLowerCase())) {
      return NextResponse.json({ error: "This tracking number is already saved for that carrier.", shipments }, { status: 409 });
    }
    shipment = {
      id: crypto.randomUUID(),
      carrier: body.carrier.trim(),
      tracking_number: body.tracking_number.trim(),
      tracking_url: body.tracking_url.trim(),
      shipped_at: body.shipped_at,
    };
    saved = await writeShipments(id, metaId, [...shipments, shipment]);
    if (!saved.some(item => item.id === shipment.id)) {
      return NextResponse.json({ error: "WooCommerce responded, but the new shipment was not in the saved order. Reload before retrying.", shipments: saved }, { status: 502 });
    }
  } catch (error) {
    return wooErrorResponse(error, "Unable to add shipment.");
  }

  // The shipment is saved from here on; a notification failure is reported as partial success, never as a failed save.
  if (!body.notify_customer) return NextResponse.json({ saved: true, shipments: saved, email_requested: false }, { status: 201 });
  try {
    await notifyCustomer(id, order, shipment);
    return NextResponse.json({ saved: true, shipments: saved, email_requested: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      saved: true, shipments: saved, email_requested: false, email_shipment_id: shipment.id,
      email_error: error instanceof Error ? error.message : "The customer note could not be added.",
    }, { status: 201 });
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
    if (!shipment) return NextResponse.json({ error: "Shipment not found. Reload the order." }, { status: 404 });
    await notifyCustomer(id, order, shipment);
    return NextResponse.json({ email_requested: true });
  } catch (error) {
    return wooErrorResponse(error, "The customer note could not be added.");
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
    if (updated.length === shipments.length) return NextResponse.json({ error: "Shipment not found. It may already have been removed.", shipments }, { status: 404 });
    const saved = await writeShipments(id, metaId, updated);
    if (saved.some(item => item.id === body.shipment_id)) {
      return NextResponse.json({ error: "WooCommerce responded, but the shipment is still on the order. Reload before retrying.", shipments: saved }, { status: 502 });
    }
    return NextResponse.json({ shipments: saved });
  } catch (error) {
    return wooErrorResponse(error, "Unable to remove shipment.");
  }
}
