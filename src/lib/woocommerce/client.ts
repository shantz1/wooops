const storeUrl = process.env.WOOCOMMERCE_URL?.replace(/\/$/, "");
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

export function isWooCommerceConfigured() {
  return Boolean(storeUrl && consumerKey && consumerSecret);
}

export async function wooFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isWooCommerceConfigured()) {
    throw new Error("WooCommerce is not configured. Add the WOOCOMMERCE_* environment variables.");
  }

  const url = new URL(`wp-json/wc/v3/${path.replace(/^\//, "")}`, `${storeUrl}/`);
  url.searchParams.set("consumer_key", consumerKey!);
  url.searchParams.set("consumer_secret", consumerSecret!);

  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WooCommerce API ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}
