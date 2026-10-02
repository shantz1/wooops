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
  const { json, ...rest } = init || {};
  let response: Response;
  try {
    response = await fetch(input, json === undefined ? rest : {
      ...rest, headers: { "Content-Type": "application/json", ...rest.headers }, body: JSON.stringify(json),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new RequestError("Could not reach WooOps. Check your connection; if you were saving, reload before retrying.", 0);
  }
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (response.status === 401) throw new RequestError("Your WooOps session has expired. Sign in again.", 401, body);
  if (!response.ok) throw new RequestError(body?.error || `WooOps returned ${response.status}.`, response.status, body);
  if (body === null) throw new RequestError("WooOps returned an unreadable response.", response.status);
  return body;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
