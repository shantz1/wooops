import { authorizeRequest, requirePermissions } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { isId } from "@/lib/woocommerce/validation";
import { touchesStock } from "@/lib/permissions";
import type { WooProduct } from "@/types/woocommerce";
import { validProductDetails, type ProductDetails } from "@/lib/product-details";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isId(id)) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 });
  try { return NextResponse.json(await wooFetch(`products/${id}`)); }
  catch (error) { return wooErrorResponse(error, "Unable to load product."); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const { id } = await params;
  const body = await readRequestJson(request).catch(() => null);
  // A product edit needs products.edit (and inventory.edit when it changes stock); a stock update needs inventory.edit.
  const needed = requirePermissions(request, body?.details !== undefined
    ? ["products.edit", ...(touchesStock(body.details) ? ["inventory.edit" as const] : [])]
    : ["inventory.edit"]);
  if (needed) return needed;
  if (body?.details !== undefined) {
    if (!isId(id) || !validProductDetails(body.details, process.env.WOOCOMMERCE_URL) ||
        typeof body.modified !== "string" || body.modified.length > 40 || Object.keys(body).some(key => !["details", "modified"].includes(key))) {
      return NextResponse.json({ error: "Invalid product details." }, { status: 400 });
    }
    try {
      const current = await wooFetch<ProductDetails>(`products/${id}`);
      if (current.date_modified_gmt !== body.modified) return NextResponse.json({ error: "This product changed since you opened it. Reload before saving." }, { status: 409 });
      if (current.type === "variable" && ("regular_price" in body.details || "sale_price" in body.details)) return NextResponse.json({ error: "Edit prices on each variation." }, { status: 400 });
      if (body.details.manage_stock === true && !current.manage_stock && !Number.isSafeInteger(body.details.stock_quantity)) return NextResponse.json({ error: "Provide a starting quantity when enabling stock management." }, { status: 400 });
      if (["upsell_ids", "cross_sell_ids", "grouped_products"].some(key => body.details[key]?.includes(Number(id)))) return NextResponse.json({ error: "A product cannot link to itself." }, { status: 400 });
      return NextResponse.json(await wooFetch(`products/${id}`, { method: "PUT", body: JSON.stringify(body.details) }));
    } catch (error) { return wooErrorResponse(error, "Unable to save product."); }
  }
  if (!isId(id) || !Number.isSafeInteger(body?.stock_quantity) || body.stock_quantity < 0 ||
      body.enable_stock_management !== undefined && typeof body.enable_stock_management !== "boolean") {
    return NextResponse.json({ error: "Provide a valid product ID and non-negative stock quantity." }, { status: 400 });
  }
  try {
    const current = await wooFetch<WooProduct>(`products/${id}`);
    if (!current.manage_stock && body.enable_stock_management !== true) {
      return NextResponse.json({ error: "This product does not manage stock. Explicitly confirm enabling stock management first." }, { status: 409 });
    }
    return NextResponse.json(await wooFetch(`products/${id}`, {
      method: "PUT", body: JSON.stringify({ stock_quantity: body.stock_quantity, ...(!current.manage_stock ? { manage_stock: true } : {}) }),
    }));
  } catch (error) {
    return wooErrorResponse(error, "Unable to update stock.");
  }
}
