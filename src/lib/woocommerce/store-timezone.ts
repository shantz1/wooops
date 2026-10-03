import "server-only";
import { storeTimezone } from "@/lib/timezone";

type Timezone = { timezone: string; timezone_warning: string | null; site_name?: string | null };
let cached: { value: Timezone; expires: number } | null = null;
let pending: Promise<Timezone> | null = null;
export function clearStoreTimezone() { cached = null; }
export async function readStoreTimezone(): Promise<Timezone> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = loadTimezone().then(value => {
    cached = { value, expires: Date.now() + (value.timezone_warning ? 5_000 : 60_000) };
    return value;
  }).finally(() => { pending = null; });
  return pending;
}
async function loadTimezone(): Promise<Timezone> {
  try {
    const url = new URL(`${(process.env.WOOCOMMERCE_URL || "").replace(/\/$/, "")}/wp-json/`);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("HTTPS required");
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Store settings unavailable");
    const data = await response.json();
    if (data.gmt_offset === undefined || data.gmt_offset === null) throw new Error("Missing timezone");
    const siteName = typeof data.name === "string" ? data.name.trim().slice(0, 120) : "";
    return { timezone: storeTimezone(data.timezone_string, data.gmt_offset), timezone_warning: null, site_name: siteName || null };
  } catch {
    return { timezone: "UTC", timezone_warning: "Store timezone could not be read. Times and report dates currently use UTC. Check the store connection and refresh." };
  }
}
