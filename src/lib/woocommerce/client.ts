const storeUrl = process.env.WOOCOMMERCE_URL?.replace(/\/$/, "");
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export function isWooCommerceConfigured() {
  return Boolean(storeUrl && consumerKey && consumerSecret);
}

async function request(path: string, init: RequestInit = {}) {
  if (!isWooCommerceConfigured()) throw new Error("WooCommerce is not configured.");
  const url = new URL(`wp-json/wc/v3/${path.replace(/^\//, "")}`, `${storeUrl}/`);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("WooCommerce must use HTTPS.");
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
    },
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`WooCommerce API returned ${response.status}.`);
  return response;
}

export async function wooFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
}

export async function wooFetchWithHeaders<T>(path: string, init: RequestInit = {}) {
  const response = await request(path, init);
  return {
    data: (await response.json()) as T,
    total: Number(response.headers.get("X-WP-Total") || 0),
    pages: Number(response.headers.get("X-WP-TotalPages") || 1),
  };
}
