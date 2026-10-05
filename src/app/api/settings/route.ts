import { authorizeRequest, requestIdentity } from "@/lib/request-guard";
import { readAccess } from "@/lib/access";
import { totpSecretFor } from "@/lib/auth";
import { readStoreTimezone } from "@/lib/woocommerce/store-timezone";
import { NextRequest, NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth";
import { isWooCommerceConfigured, wooFetch } from "@/lib/woocommerce/client";

export async function GET(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (denied) return denied;
  const timezonePromise = readStoreTimezone();
  const configured = isWooCommerceConfigured();
  let storeUrl: string | null = null;
  try { const url = new URL(process.env.WOOCOMMERCE_URL || ""); storeUrl = url.origin + url.pathname.replace(/\/$/, ""); } catch { /* Invalid configuration. */ }
  const identity = requestIdentity(request);
  // Roles and logins are shown read-only to logins that can open Settings; password hashes and secrets never leave the server.
  const config = readAccess().config;
  const rules = identity?.permissions.includes("settings.view") ? {
    editable: false,
    source: process.env.WOOOPS_ACCESS_FILE ? "file" : "environment",
    roles: config.roles.map(item => ({ slug: item.slug, label: item.label, permissions: item.permissions, built_in: item.builtIn })),
    logins: [
      ...(process.env.WOOOPS_ADMIN_PASSWORD_HASH || process.env.WOOOPS_ADMIN_PASSWORD ? [{ username: null, name: "Administrator (built-in)", role: "admin", two_factor: Boolean(totpSecretFor("admin")) }] : []),
      ...(process.env.WOOOPS_READONLY_PASSWORD_HASH ? [{ username: null, name: "Read-only (built-in)", role: "readonly", two_factor: Boolean(totpSecretFor("readonly")) }] : []),
      ...config.logins.map(login => ({ username: login.username, name: login.name, role: login.role, two_factor: Boolean(login.totpSecret) })),
    ],
  } : null;
  const access = { protected: authEnabled(), session_ready: Boolean(process.env.WOOOPS_SESSION_SECRET),
    role: identity?.role ?? null, role_label: identity?.roleLabel ?? null, name: identity?.name ?? null,
    permissions: identity?.permissions ?? [], two_factor: Boolean(identity && totpSecretFor(identity.login)), rules };
  const { site_name: siteName = null, ...timezone } = await timezonePromise;
  if (!configured) return NextResponse.json({ ...timezone, configured, store_url: storeUrl, access, store: null });
  try {
    const settings = await wooFetch<Array<{ id: string; value: unknown }>>("settings/general");
    const read = (id: string) => {
      const value = settings.find(setting => setting.id === id)?.value;
      return typeof value === "string" || typeof value === "number" ? String(value) : null;
    };
    const [country, state] = (read("woocommerce_default_country") || "").split(":");
    return NextResponse.json({ ...timezone, configured, store_url: storeUrl, access, store: {
      currency: read("woocommerce_currency"), decimal_places: read("woocommerce_price_num_decimals"),
      country: read("woocommerce_default_country"), prices_include_tax: read("woocommerce_prices_include_tax"),
      // Used on packing slips. WooCommerce stores the base location as "COUNTRY:STATE".
      name: siteName,
      address: { address_1: read("woocommerce_store_address") || "", address_2: read("woocommerce_store_address_2") || "",
        city: read("woocommerce_store_city") || "", postcode: read("woocommerce_store_postcode") || "", state: state || "", country: country || "" },
    } });
  } catch (error) {
    return NextResponse.json({ ...timezone, configured, store_url: storeUrl, access, store: null,
      store_error: error instanceof Error ? error.message : "Store details are unavailable." });
  }
}
