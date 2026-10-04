import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/request-guard";
import { readRequestJson } from "@/lib/request-body";
import { catalogPath, validCatalogWrite } from "@/lib/catalog";
import { wooFetchWithHeaders, wooFetch } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { pageParam, searchParam, isId } from "@/lib/woocommerce/validation";
import type { ProductDetails } from "@/lib/product-details";
import type { CatalogItem } from "@/lib/catalog";
import { validVariationOptions, overlapsVariation } from "@/lib/variation-options";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request); if (denied) return denied;
  const params = request.nextUrl.searchParams, resource = params.get("resource");
  const path = catalogPath(resource, params.get("parent"));
  if (!path) return NextResponse.json({ error: "Invalid catalogue resource." }, { status: 400 });
  const query = new URLSearchParams({ page: String(pageParam(params.get("page"), 1)), per_page: String(pageParam(params.get("per_page"), 20, 100)) });
  if (searchParam(params.get("search"))) query.set("search", searchParam(params.get("search")));
  if (resource === "reviews") {
    query.set("status", "all");
    if (params.has("product")) { if (!isId(params.get("product"))) return NextResponse.json({ error: "Invalid product ID." }, { status: 400 }); query.set("product", params.get("product")!); }
  }
  try {
    const result = await wooFetchWithHeaders(path + "?" + query);
    return NextResponse.json({ items: result.data, total: result.total, pages: result.pages });
  } catch (error) { return wooErrorResponse(error, "Unable to load catalogue."); }
}

async function write(request: NextRequest, creating: boolean) {
  const denied = authorizeRequest(request); if (denied) return denied;
  const params = request.nextUrl.searchParams, resource = params.get("resource") || "";
  const path = catalogPath(resource, params.get("parent"));
  const body = await readRequestJson(request).catch(() => null);
  if (!path || !validCatalogWrite(resource, body, creating) || !creating && !isId(params.get("id"))) return NextResponse.json({ error: "Invalid catalogue details." }, { status: 400 });
  try {
    if (resource === "variations" && creating) {
      const product = await wooFetch<ProductDetails>("products/" + params.get("parent"));
      if (product.type !== "variable" || !validVariationOptions(product.attributes, body.attributes)) return NextResponse.json({ error: "Choose a saved option for every variation attribute." }, { status: 400 });
      let pages = 1;
      for (let page = 1; page <= pages; page++) {
        const result = await wooFetchWithHeaders<CatalogItem[]>(path + "?per_page=100&page=" + page);
        if (result.total > 500 || result.pages > 5) return NextResponse.json({ error: "This product has too many variations to verify safely here." }, { status: 409 });
        pages = Math.max(1, result.pages);
        if (result.data.some(variation => overlapsVariation(body.attributes, variation.attributes || []))) return NextResponse.json({ error: "A variation already covers these options. Edit that variation instead." }, { status: 409 });
      }
    }
    return NextResponse.json(await wooFetch(creating ? path : `${path}/${params.get("id")}`, { method: creating ? "POST" : "PUT", body: JSON.stringify(body) }), { status: creating ? 201 : 200 });
  } catch (error) { return wooErrorResponse(error, "Unable to save catalogue details."); }
}
export async function POST(request: NextRequest) { return write(request, true); }
export async function PATCH(request: NextRequest) { return write(request, false); }
