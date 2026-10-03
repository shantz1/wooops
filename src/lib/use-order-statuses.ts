"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { editableStatuses } from "@/lib/woocommerce/validation";

export interface OrderStatusInfo { slug: string; name: string; count: number | null; settable: boolean }

const titleCase = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

/** Used until the store answers, or if it cannot: WooCommerce's standard statuses without counts. */
export const fallbackStatuses: OrderStatusInfo[] = editableStatuses.map(slug => ({ slug, name: titleCase(slug), count: null, settable: true }));

let cache: { value: OrderStatusInfo[]; expires: number } | null = null;
let pending: Promise<OrderStatusInfo[]> | null = null;
const listeners = new Set<(value: OrderStatusInfo[]) => void>();
const errorListeners = new Set<(value: string) => void>();
let loadError = "";
let generation = 0;
function updateError(value: string) { loadError = value; errorListeners.forEach(listener => listener(value)); }

function load(fresh = false) {
  if (!fresh && cache && cache.expires > Date.now()) return Promise.resolve(cache.value);
  if (pending) return pending;
  const started = generation;
  const request = fetchJson<{ statuses: OrderStatusInfo[] }>(`/api/woo/order-statuses${fresh ? "?fresh=1" : ""}`)
    .then(result => {
      const value = Array.isArray(result.statuses) && result.statuses.length ? result.statuses : fallbackStatuses;
      if (generation === started) {
        cache = { value, expires: Date.now() + 60_000 };
        updateError("");
        listeners.forEach(listener => listener(value));
      }
      return value;
    })
    .catch(() => {
      if (generation === started) updateError("Store statuses could not be refreshed. Custom statuses or counts may be unavailable. Check the connection and the API user's report permissions.");
      return cache?.value ?? fallbackStatuses;
    })
    .finally(() => { if (pending === request) pending = null; });
  pending = request;
  return pending;
}

/** Re-reads statuses (and their counts) after a status change. */
export function refreshOrderStatuses() {
  cache = null;
  pending = null;
  generation++;
  void load(true);
}

/**
 * The store's order statuses, including custom ones registered by extensions, shared by every component
 * on the page. Falls back to the standard statuses while loading or if the store cannot be reached.
 */
export function useOrderStatuses() {
  const [statuses, setStatuses] = useState<OrderStatusInfo[]>(() => cache?.value ?? fallbackStatuses);
  useEffect(() => {
    listeners.add(setStatuses);
    let active = true;
    const started = generation;
    void load().then(value => { if (active && started === generation) setStatuses(value); });
    return () => { active = false; listeners.delete(setStatuses); };
  }, []);
  return statuses;
}

export function useOrderStatusError() {
  const [error, setError] = useState(loadError);
  useEffect(() => {
    errorListeners.add(setError);
    return () => { errorListeners.delete(setError); };
  }, []);
  return error;
}

/** The store's label for a status, or a readable version of its slug. */
export function statusName(statuses: OrderStatusInfo[], slug: string) {
  return statuses.find(item => item.slug === slug)?.name || titleCase(slug.replace(/^wc-/, ""));
}
