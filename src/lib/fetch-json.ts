import { plainText } from "@/lib/format";
import { apiHeaders, apiUrl, wordpressRuntime } from "@/lib/runtime";
import { createReadPool } from "@/lib/read-pool";

const reads = createReadPool();
function mergedHeaders(extra?: HeadersInit) {
  const headers = new Headers(apiHeaders());
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

/** An error from a WooOps API route. `status` is 0 when the request never reached WooOps. */
export class RequestError<T = unknown> extends Error {
  constructor(message: string, readonly status: number, readonly body?: T) {
    super(message);
    this.name = "RequestError";
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Calls a WooOps route and returns its JSON body. Non-2xx responses throw a RequestError carrying the
 * route's `error` message and parsed body, so callers can still use partial-success data.
 */
export async function fetchJson<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  if (method === "GET" && init?.json === undefined && !init?.body) {
    const headers = mergedHeaders(init?.headers);
    const key = JSON.stringify([apiUrl(input), [...headers.entries()], init?.credentials, init?.cache]);
    return reads.read(key, signal => performFetch<T>(input, { ...init, signal }), init?.signal);
  }
  // A refresh after a write must not join a read started before the write.
  reads.clear();
  try { return await performFetch<T>(input, init); }
  finally { reads.clear(); }
}

async function performFetch<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init || {};
  let response: Response;
  try {
    const headers = mergedHeaders(rest.headers);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    const signal = rest.signal ? AbortSignal.any([rest.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000);
    response = await fetch(apiUrl(input), json === undefined ? { ...rest, signal, headers, cache: "no-store" } : { ...rest, signal, headers, cache: "no-store", body: JSON.stringify(json) });
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new RequestError("The request timed out. If saving, reload the record before retrying.", 504);
    throw new RequestError("Could not reach the server. Check your connection; if you were saving, reload before retrying.", 0);
  }
  const body = await response.json().catch((error: unknown) => {
    if (isAbortError(error)) throw error;
    if (error instanceof Error && error.name === "TimeoutError") throw new RequestError("The response timed out. If saving, reload before retrying.", 504);
    return null;
  }) as (T & { error?: string; code?: string; message?: string }) | null;
  if (wordpressRuntime() && (response.status === 401 || body?.code === "rest_cookie_invalid_nonce")) {
    throw new RequestError("Your WordPress session has expired. Reload the page and sign in again.", response.status, body);
  }
  if (response.status === 401) throw new RequestError("Your session has expired. Sign in again.", 401, body);
  // WordPress REST errors use `message`; WooOps routes use `error`.
  // The WordPress plugin HTML-escapes messages; plainText decodes them for display as text.
  if (!response.ok) throw new RequestError(plainText(body?.error || body?.message || "") || `The server returned ${response.status}.`, response.status, body);
  if (body === null) throw new RequestError("The server returned an unreadable response.", response.status);
  return body;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
