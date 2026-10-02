"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage, fetchJson, isAbortError } from "@/lib/fetch-json";

/**
 * Loads JSON from a WooOps route. A newer URL or reload aborts the older request, so stale results
 * never replace newer ones. Failed refreshes keep the last loaded data and expose the error separately.
 * Changing `refreshKey` reloads, letting a parent refresh this data after a related change.
 */
export function useRemote<T>(url: string, fallbackError: string, refreshKey: unknown = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
      fetchJson<T>(url, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setData(result); })
        .catch(cause => { if (!isAbortError(cause) && !controller.signal.aborted) setError(errorMessage(cause, fallbackError)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    });
    return () => controller.abort();
  }, [url, version, fallbackError, refreshKey]);

  const reload = useCallback(() => setVersion(current => current + 1), []);
  return { data, setData, error, loading, reload };
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
