import { authorizeRequest } from "@/lib/request-guard";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";
import { NextRequest, NextResponse } from "next/server";
import { authEnabled, cookieName, sessionRole } from "@/lib/auth";
import { isWooCommerceConfigured, wooFetch } from "@/lib/woocommerce/client";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const timezonePromise = readStoreTimezone();
  const configured = isWooCommerceConfigured();
  let storeUrl: string | null = null;
  try { const url = new URL(process.env.WOOCOMMERCE_URL || ""); storeUrl = url.origin + url.pathname.replace(/\/$/, ""); } catch { /* Invalid configuration. */ }
  const role = authEnabled() ? sessionRole(request.cookies.get(cookieName)?.value) : "admin";
  const access = { protected: authEnabled(), session_ready: Boolean(process.env.WOOOPS_SESSION_SECRET), role,
    two_factor: Boolean(role === "readonly" ? process.env.WOOOPS_READONLY_TOTP_SECRET : process.env.WOOOPS_ADMIN_TOTP_SECRET) };
  if (!configured) return NextResponse.json({ ...await timezonePromise, configured, store_url: storeUrl, access, store: null });
  try {
    const settings = await wooFetch<Array<{ id: string; value: unknown }>>("settings/general");
    const read = (id: string) => {
      const value = settings.find(setting => setting.id === id)?.value;
      return typeof value === "string" || typeof value === "number" ? String(value) : null;
    };
    return NextResponse.json({ ...await timezonePromise, configured, store_url: storeUrl, access, store: {
      currency: read("woocommerce_currency"), decimal_places: read("woocommerce_price_num_decimals"),
      country: read("woocommerce_default_country"), prices_include_tax: read("woocommerce_prices_include_tax"),
    } });
  } catch (error) {
    return NextResponse.json({ ...await timezonePromise, configured, store_url: storeUrl, access, store: null,
      store_error: error instanceof Error ? error.message : "Store details are unavailable." });
  }
}
