import "server-only";
import { storeTimezone } from "@/lib/timezone";

export async function readStoreTimezone() {
  try {
    const url = new URL(`${(process.env.WOOCOMMERCE_URL || "").replace(/\/$/, "")}/wp-json/`);
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Store settings unavailable");
    const data = await response.json();
    if (data.gmt_offset === undefined || data.gmt_offset === null) throw new Error("Missing timezone");
    return { timezone: storeTimezone(data.timezone_string, data.gmt_offset), timezone_warning: null };
  } catch {
    return { timezone: "UTC", timezone_warning: "Store timezone could not be read. Times and report dates currently use UTC. Check the store connection and refresh." };
  }
}
