"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { listHref, saveNavigation, useOrdersNavigation, type OrdersNavigation } from "@/lib/orders-navigation";
import { statusName, useOrderStatuses } from "@/lib/use-order-statuses";

const button = "inline-flex h-9 items-center gap-1 rounded-lg border bg-background px-3 text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

/**
 * Previous/next order within the filtered list the user came from. Steps inside the loaded page use plain
 * links (new tab works); at a page edge the adjacent page is fetched with the same filters. The list can
 * change after it was loaded, so the position is described as "in this list", not as a live count.
 */
export function OrderPager({ id }: { id: string }) {
  const router = useRouter();
  const statuses = useOrderStatuses();
  const [navigation, setNavigation] = useOrdersNavigation();
  const [busy, setBusy] = useState<"previous" | "next" | null>(null);
  const [error, setError] = useState("");
  if (!navigation) return null;
  const index = navigation.ids.indexOf(Number(id));
  if (index < 0) return null;

  const previousId = navigation.ids[index - 1];
  const nextId = navigation.ids[index + 1];
  const hasPreviousPage = index === 0 && navigation.page > 1;
  const hasNextPage = index === navigation.ids.length - 1 && navigation.page < navigation.pages;
  const position = (navigation.page - 1) * navigation.perPage + index + 1;
  const scope = navigation.status === "all" ? "all orders" : statusName(statuses, navigation.status);

  async function crossPage(direction: "previous" | "next", current: OrdersNavigation) {
    setBusy(direction);
    setError("");
    const page = current.page + (direction === "next" ? 1 : -1);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(current.perPage), search: current.search, status: current.status });
      const result = await fetchJson<{ orders: Array<{ id: number }>; total: number; pages: number }>(`/api/woo/orders?${params}`);
      const ids = (result.orders || []).map(order => order.id);
      const target = direction === "next" ? ids[0] : ids[ids.length - 1];
      if (!target) throw new Error("That page of the list is now empty. Return to the list to refresh it.");
      const next: OrdersNavigation = { ...current, page, ids, total: result.total || current.total, pages: Math.max(result.pages || 1, 1),
        listHref: listHref({ search: current.search, status: current.status, page }) };
      saveNavigation(next);
      setNavigation(next);
      router.push(`/orders/${target}`);
    } catch (cause) {
      setError(errorMessage(cause, "Could not load the adjacent page of the list."));
    } finally {
      setBusy(null);
    }
  }

  const step = (direction: "previous" | "next", targetId: number | undefined, crossesPage: boolean) => {
    const label = direction === "previous" ? "Previous order" : "Next order";
    const content = <>
      {direction === "previous" && (busy === "previous" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ChevronLeft className="size-4" aria-hidden="true" />)}
      <span className="hidden sm:inline">{direction === "previous" ? "Previous" : "Next"}</span>
      {direction === "next" && (busy === "next" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />)}
    </>;
    if (targetId) return <Link href={`/orders/${targetId}`} aria-label={label} className={button}>{content}</Link>;
    return <button type="button" aria-label={label} disabled={!crossesPage || busy !== null} onClick={() => crossPage(direction, navigation)} className={button}>{content}</button>;
  };

  return (
    <nav aria-label="Orders in this list" className="flex flex-wrap items-center gap-2">
      {step("previous", previousId, hasPreviousPage)}
      <span className="text-sm text-muted-foreground">
        {position} of {navigation.total} in {scope}{navigation.search ? ` matching “${navigation.search}”` : ""}
      </span>
      {step("next", nextId, hasNextPage)}
      {error && <span role="alert" className="w-full text-xs text-destructive">{error}</span>}
    </nav>
  );
}
