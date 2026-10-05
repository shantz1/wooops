import { authorizeRequest, requirePermissions } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetch, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { pageParam, searchParam } from "@/lib/woocommerce/validation";
import type { WooProduct } from "@/types/woocommerce";
import { validStoreImageUrl } from "@/lib/product-details";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  if (!isWooCommerceConfigured()) return NextResponse.json({ configured: false, products: [], total: 0, pages: 0 });
  const params = request.nextUrl.searchParams;
  const query = new URLSearchParams({
    page: String(pageParam(params.get("page"), 1)),
    per_page: String(pageParam(params.get("per_page"), 20, 100)),
    orderby: "date",
    order: "desc",
    _fields: "id,name,type,status,sku,price,regular_price,manage_stock,stock_quantity,stock_status,images,low_stock_amount",
  });
  const search = searchParam(params.get("search"));
  if (search) query.set("search", search);
  if (params.has("stock_status")) {
    const stock = params.get("stock_status")!;
    if (!["instock", "outofstock", "onbackorder"].includes(stock)) return NextResponse.json({ error: "Invalid stock filter." }, { status: 400 });
    query.set("stock_status", stock);
  }
  if (params.has("type")) {
    const type = params.get("type")!;
    if (!["simple", "variable", "grouped", "external"].includes(type)) return NextResponse.json({ error: "Invalid product type." }, { status: 400 });
    query.set("type", type);
  }
  try {
    const result = await wooFetchWithHeaders<WooProduct[]>(`products?${query}`);
    return NextResponse.json({ configured: true, products: result.data, total: result.total, pages: result.pages });
  } catch (error) {
    return wooErrorResponse(error, "Unable to load products.");
  }
}

export async function POST(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const body = await readRequestJson(request).catch(() => null);
  const valid = body && typeof body.name === "string" && body.name.trim().length > 0 && body.name.length <= 200 &&
    typeof body.regular_price === "string" && /^\d+(?:\.\d{1,2})?$/.test(body.regular_price) &&
    (body.sku === undefined || (typeof body.sku === "string" && body.sku.length <= 100)) &&
    (body.description === undefined || (typeof body.description === "string" && body.description.length <= 10000)) &&
    (body.image_url === undefined || (typeof body.image_url === "string" && validStoreImageUrl(body.image_url.trim(), process.env.WOOCOMMERCE_URL))) &&
    (body.status === "draft" || body.status === "publish") && typeof body.manage_stock === "boolean" &&
    (!body.manage_stock || (Number.isSafeInteger(body.stock_quantity) && body.stock_quantity >= 0));
  if (!valid) return NextResponse.json({ error: "Invalid simple product details." }, { status: 400 });
  if (body.manage_stock === true) { const stock = requirePermissions(request, ["inventory.edit"]); if (stock) return stock; }

  const payload = {
    name: body.name.trim(),
    type: "simple",
    regular_price: body.regular_price,
    sku: body.sku?.trim() || "",
    description: body.description?.trim() || "",
    status: body.status,
    manage_stock: body.manage_stock,
    ...(body.image_url?.trim() ? { images: [{ src: body.image_url.trim() }] } : {}),
    ...(body.manage_stock ? { stock_quantity: body.stock_quantity } : {}),
  };
  try {
    return NextResponse.json(await wooFetch<WooProduct>("products", { method: "POST", body: JSON.stringify(payload) }), { status: 201 });
  } catch (error) {
    return wooErrorResponse(error, "Unable to create product.");
  }
}
