const storeUrl = process.env.WOOCOMMERCE_URL?.replace(/\/$/, "");
const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
const requestTimeout = 20_000;

export function isWooCommerceConfigured() {
  return Boolean(storeUrl && consumerKey && consumerSecret);
}

/** A WooCommerce failure with an HTTP status suitable for the WooOps route response. */
export class WooApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WooApiError";
  }
}

function statusMessage(status: number) {
  if (status === 401 || status === 403) {
    return `Store rejected the request (${status}). Check the API key, its Read/Write permission and the key user's capabilities.`;
  }
  if (status === 404) return "Store could not find that record (404).";
  if (status === 429) return "Store is rate limiting requests (429). Wait a moment and retry.";
  if (status >= 500) return `The store returned a server error (${status}).`;
  return `Store API returned ${status}.`;
}

async function request(path: string, init: RequestInit = {}) {
  if (!isWooCommerceConfigured()) throw new WooApiError("Store is not configured.", 503);
  const url = new URL(`wp-json/wc/v3/${path.replace(/^\//, "")}`, `${storeUrl}/`);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new WooApiError("Store must use HTTPS.", 503);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: init.signal ?? AbortSignal.timeout(requestTimeout),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new WooApiError(`Store did not respond within ${requestTimeout / 1000} seconds.`, 504);
    }
    throw new WooApiError("Could not reach the store. Check the store URL, HTTPS certificate and network access.", 502);
  }
  if (!response.ok) throw new WooApiError(statusMessage(response.status), response.status === 404 ? 404 : 502);
  return response;
}

export async function wooFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return readJson<T>(await request(path, init));
}

async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new WooApiError("The store response timed out. If saving, reload the record before retrying.", 504);
    }
    throw new WooApiError("The store returned an unreadable response. If saving, reload the record before retrying.", 502);
  }
}

export async function wooFetchWithHeaders<T>(path: string, init: RequestInit = {}) {
  const response = await request(path, init);
  return {
    data: await readJson<T>(response),
    total: Number(response.headers.get("X-WP-Total") || 0),
    pages: Number(response.headers.get("X-WP-TotalPages") || 1),
  };
}
