"use client";

import { useEffect, useState } from "react";
import { wordpressRuntime } from "./runtime.ts";
import { isStatusSlug } from "./woocommerce/validation.ts";

/** The orders list filters that live in the URL so refresh, Back and shared links keep them. */
export interface OrdersListState { search: string; status: string; page: number }

export const defaultListState: OrdersListState = { search: "", status: "all", page: 1 };

/**
 * The orders list as last loaded, kept in this tab's sessionStorage so an order page can offer
 * previous/next within the same filtered list. It reflects the list when it was loaded, not live data.
 */
export interface OrdersNavigation {
  listHref: string;
  search: string;
  status: string;
  page: number;
  pages: number;
  perPage: number;
  total: number;
  ids: number[];
}

const navigationKey = "panel:orders-navigation";

/** The standalone app keeps the query in location.search; the plugin keeps it after the hash path. */
function currentParams() {
  if (wordpressRuntime()) return new URLSearchParams(window.location.hash.split("?")[1] || "");
  return new URLSearchParams(window.location.search);
}

export function parseListState(params: URLSearchParams): OrdersListState {
  const status = params.get("status") || "all";
  const page = Number(params.get("page"));
  return {
    search: (params.get("search") || "").slice(0, 200),
    status: status === "all" || isStatusSlug(status) ? status : "all",
    page: Number.isSafeInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

export function listQuery(state: OrdersListState) {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("search", state.search.trim());
  if (state.status !== "all") params.set("status", state.status);
  if (state.page > 1) params.set("page", String(state.page));
  return params.toString();
}

/** A panel path for the list, e.g. "/orders?status=processing&page=2". */
export function listHref(state: OrdersListState) {
  const query = listQuery(state);
  return query ? `/orders?${query}` : "/orders";
}

export function readListState() {
  return parseListState(currentParams());
}

/** Replaces the current history entry, so typing in search does not add Back steps. */
export function writeListState(state: OrdersListState) {
  const query = listQuery(state);
  const { pathname, search, hash } = window.location;
  if (wordpressRuntime()) {
    const path = hash.startsWith("#/") ? hash.slice(1).split("?")[0] : "/orders";
    window.history.replaceState(window.history.state, "", `${pathname}${search}#${path}${query ? `?${query}` : ""}`);
  } else {
    window.history.replaceState(window.history.state, "", `${pathname}${query ? `?${query}` : ""}${hash}`);
  }
}

export function saveNavigation(navigation: OrdersNavigation) {
  try { sessionStorage.setItem(navigationKey, JSON.stringify(navigation)); } catch { /* Storage can be unavailable. */ }
  window.dispatchEvent(new Event("panel:orders-navigation"));
}

export function readNavigation(): OrdersNavigation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(navigationKey) || "null") as OrdersNavigation | null;
    const positive = (number: unknown) => Number.isSafeInteger(number) && (number as number) >= 1;
    if (!value || typeof value.listHref !== "string" || !value.listHref.startsWith("/orders") ||
        typeof value.search !== "string" || typeof value.status !== "string" || !positive(value.page) ||
        !positive(value.pages) || !positive(value.perPage) || !Number.isSafeInteger(value.total) ||
        !Array.isArray(value.ids) || !value.ids.every(positive)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Reads the saved list after mount, so server and client render the same first paint. */
export function useOrdersNavigation() {
  const [navigation, setNavigation] = useState<OrdersNavigation | null>(null);
  useEffect(() => {
    const restore = () => setNavigation(readNavigation());
    queueMicrotask(restore);
    window.addEventListener("panel:orders-navigation", restore);
    return () => window.removeEventListener("panel:orders-navigation", restore);
  }, []);
  return [navigation, setNavigation] as const;
}
