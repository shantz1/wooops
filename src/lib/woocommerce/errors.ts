import { NextResponse } from "next/server";
import { WooApiError } from "@/lib/woocommerce/client";

/** Converts a thrown WooCommerce or validation error into a JSON route response without exposing credentials. */
export function wooErrorResponse(error: unknown, fallback: string) {
  if (error instanceof WooApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 502 });
}
