import { authorizeRequest } from "@/lib/request-guard";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";
import { storeDateBounds } from "@/lib/timezone";
import { NextRequest, NextResponse } from "next/server";
import { isWooCommerceConfigured, wooFetchWithHeaders } from "@/lib/woocommerce/client";
import { wooErrorResponse } from "@/lib/woocommerce/errors";
import { isSettableStatus } from "@/lib/woocommerce/order-statuses";
import type { ReportOrder, ReportProduct, ReportResponse } from "@/types/reports";

const limit = 500;
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") || "orders";
  if (kind !== "orders" && kind !== "inventory") return NextResponse.json({ error: "Invalid report type." }, { status: 400 });
  const query = new URLSearchParams({ per_page: "100", orderby: "id", order: "asc" });
  query.set("_fields", kind === "orders" ? "id,number,status,currency,total,date_created,date_created_gmt,refunds.total" : "id,name,sku,stock_status,stock_quantity,manage_stock");
  let timezone = { timezone: "UTC", timezone_warning: null as string | null };
  if (kind === "orders") {
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const status = params.get("status") || "all";
    if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000 || status !== "all" && !await isSettableStatus(status)) {
      return NextResponse.json({ error: "Choose a valid date range of up to one year and a supported status." }, { status: 400 });
    }
    timezone = await readStoreTimezone();
    try {
      const bounds = storeDateBounds(from, to, timezone.timezone);
      query.set("after", bounds.after);
      query.set("before", bounds.before);
    } catch { return NextResponse.json({ error: "Invalid dates in the store timezone." }, { status: 400 }); }
    query.set("dates_are_gmt", "true");
    if (status !== "all") query.set("status", status);
  } else {
    const stock = params.get("stock") || "all";
    if (!["all", "instock", "outofstock", "onbackorder"].includes(stock)) return NextResponse.json({ error: "Invalid stock filter." }, { status: 400 });
    timezone = await readStoreTimezone();
    if (stock !== "all") query.set("stock_status", stock);
  }
  const base = { timezone: timezone.timezone, timezone_warning: timezone.timezone_warning, configured: isWooCommerceConfigured(), kind, total: 0, loaded: 0, complete: true, limit,
    generated_at: new Date().toISOString(), filters: kind === "orders" ? { from: params.get("from")!, to: params.get("to")!, status: params.get("status") || "all" } : { stock: params.get("stock") || "all" }, orders: [], products: [] };
  if (!base.configured) return NextResponse.json(base);
  try {
    // One bounded live read, not a durable snapshot. Concurrent store changes may make it incomplete.
    const signal = AbortSignal.timeout(20_000);
    const resource = kind === "orders" ? "orders" : "products";
    const fetchPage = (page: number) => wooFetchWithHeaders<Array<ReportOrder & ReportProduct>>(`${resource}?${query}&page=${page}`, { signal });
    const first = await fetchPage(1);
    const pages = Math.min(Math.max(first.pages, 1), limit / 100);
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetchPage(index + 2)));
    const unique = new Map([...first.data, ...rest.flatMap(page => page.data)].map(row => [row.id, row]));
    const rows = [...unique.values()];
    const response: ReportResponse = { ...base, kind, total: first.total, loaded: rows.length,
      complete: first.pages <= limit / 100 && rows.length === first.total && rest.every(page => page.total === first.total),
      orders: kind === "orders" ? rows.map(({ id, number, status, currency, total, date_created, date_created_gmt, refunds }) => ({ id, number, status, currency, total, date_created, date_created_gmt, refunds: refunds?.map(({ total }) => ({ total })) })) : [],
      products: kind === "inventory" ? rows.map(({ id, name, sku, stock_status, stock_quantity, manage_stock }) => ({ id, name, sku, stock_status, stock_quantity, manage_stock })) : [],
    };
    return NextResponse.json(response);
  } catch (error) { return wooErrorResponse(error, "Could not generate the report."); }
}
