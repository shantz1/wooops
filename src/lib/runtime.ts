/**
 * Where the panel runs. The standalone Next.js app has no config; the WordPress plugin prints
 * `window.storeOpsConfig` before loading its bundle, pointing API calls at its REST namespace.
 */
export interface WordPressRuntime {
  platform: "wordpress";
  /** REST namespace root, e.g. https://store.test/wp-json/storeops/v1/ (or ?rest_route= with plain permalinks). */
  restRoot: string;
  nonce: string;
  assetsUrl: string;
  adminUrl: string;
  /** Panel paths the plugin implements. Others are hidden from navigation. */
  features: string[];
}

export function wordpressRuntime(): WordPressRuntime | null {
  if (typeof window === "undefined") return null;
  const config = (window as unknown as { storeOpsConfig?: WordPressRuntime }).storeOpsConfig;
  return config?.platform === "wordpress" ? config : null;
}

/** Whether a panel screen exists in this runtime. The plugin implements a subset of the standalone app. */
export function isAvailable(href: string) {
  const runtime = wordpressRuntime();
  return !runtime || runtime.features.includes(href);
}

/** Maps a panel API path such as `/api/woo/orders?page=2` to the current runtime's endpoint. */
export function apiUrl(path: string) {
  const runtime = wordpressRuntime();
  if (!runtime || !path.startsWith("/api/")) return path;
  const route = path.slice("/api/".length);
  // With plain permalinks the root already has a query string (?rest_route=...), so join parameters with "&".
  return runtime.restRoot + (runtime.restRoot.includes("?") ? route.replace("?", "&") : route);
}

export function apiHeaders(): Record<string, string> {
  const runtime = wordpressRuntime();
  return runtime ? { "X-WP-Nonce": runtime.nonce } : {};
}
