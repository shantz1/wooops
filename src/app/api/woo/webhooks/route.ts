import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { limitedText } from "@/lib/request-body";
import { clearStoreTimezone } from "@/lib/woocommerce/store-timezone";

export async function POST(request: NextRequest) {
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
  let raw: string;
  try { raw = await limitedText(request, 512 * 1024); }
  catch { return NextResponse.json({ error: "Webhook body is too large or unreadable." }, { status: 413 }); }
  const signature = request.headers.get("x-wc-webhook-signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("base64");
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  clearStoreTimezone();
  // Never log customer payloads, credentials or arbitrary request header values.
  console.info("Verified store webhook received");
  return NextResponse.json({ received: true });
}
