"use client";

import { ListPagination } from "@/components/list-pagination";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, Notice, RetryButton } from "@/components/ui/feedback";
import { useDebouncedValue, useRemote } from "@/lib/use-remote";
import type { WooCustomer } from "@/types/woocommerce";

type CustomersResponse = { configured?: boolean; customers: WooCustomer[]; total: number; pages: number };

export function CustomersTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const { data, error, loading, reload } = useRemote<CustomersResponse>(
    `/api/woo/customers?${new URLSearchParams({ page: String(page), per_page: "20", search: debouncedSearch })}`, "Unable to load customers.");
  const items = data?.customers || [];

  return <div className="space-y-4">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" aria-label="Search customers" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search customers..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" />
    </div>
    {error && data && <Notice tone="error" action={<RetryButton onRetry={reload} busy={loading} />}>Showing the last loaded customers. {error}</Notice>}
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      {!data ? (loading ? <LoadingState label="Loading customers…" /> : <ErrorState message={error || "Unable to load customers."} onRetry={reload} busy={loading} />)
        : items.length === 0 ? <EmptyState icon={Users} title="No customers found">Guest checkouts have no customer record and appear only on their orders.</EmptyState>
        : <div className={`overflow-x-auto transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}><table className="w-full text-sm">
          <thead className="border-b font-medium text-left text-xs text-muted-foreground"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Orders</th><th className="px-5 py-3">Spent</th></tr></thead>
          <tbody className="divide-y">{items.map(customer => <tr key={customer.id}>
            <td className="px-5 py-4 font-medium">{customer.first_name} {customer.last_name}</td>
            <td className="px-5 py-4">{customer.email || "—"}</td>
            <td className="px-5 py-4 text-muted-foreground">{customer.billing?.phone || "—"}</td>
            <td className="px-5 py-4">{customer.orders_count ?? "—"}</td>
            <td className="px-5 py-4">{customer.total_spent ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      {data && <ListPagination page={page} pages={data.pages} total={data.total} busy={loading} onPage={setPage} />}
    </div>
  </div>;
}
