"use client";

import { useRef, useState } from "react";
import { Check, Loader2, UserRound } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/field";
import { ErrorState, LoadingState, Notice } from "@/components/ui/feedback";
import { errorMessage, fetchJson, RequestError } from "@/lib/fetch-json";
import { useDebouncedValue, useRemote } from "@/lib/use-remote";
import type { WooCustomer, WooOrder } from "@/types/woocommerce";

interface OrderCustomerProps {
  order: WooOrder;
  onSaved: (order: WooOrder) => void;
  onReload: () => void;
}

type CustomersResponse = { customers: WooCustomer[] };
type PendingAction = "assign" | "guest";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const outlineButton = `inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm hover:bg-accent disabled:opacity-50 ${focusRing}`;
const primaryButton = `inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50 ${focusRing}`;

function customerName(customer: WooCustomer) {
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.username;
}

export function OrderCustomer({ order, onSaved, onReload }: OrderCustomerProps) {
  const { can } = usePanelPreferences();
  const canSearch = can("customers.view");
  const [open, setOpen] = useState(false);
  const [editToken, setEditToken] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const searching = open && canSearch && debouncedQuery.length >= 2;
  const { data, error, loading, reload } = useRemote<CustomersResponse>(
    searching ? `/api/woo/customers?${new URLSearchParams({ page: "1", per_page: "10", search: debouncedQuery })}` : null,
    "Unable to search customers.");
  const [selected, setSelected] = useState<WooCustomer | null>(null);
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [result, setResult] = useState<{ tone: "error" | "warning"; message: string; stale: boolean } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!can("orders.status")) return null;

  const customers = data?.customers.slice(0, 10) ?? [];
  const selectedName = selected ? customerName(selected) : "";
  const billingEmail = order.billing.email || "none";
  const explanation = `Assigning links the order to the customer's account and order history. It does not change where emails for this order are sent: that is the order's billing email (${billingEmail}), which only changes if you also replace the addresses below.`;
  const assignDescription = `Link order #${order.number} to ${selectedName}${selected ? ` (${selected.email || "no account email"}, customer #${selected.id})` : ""}? This account can then view the order in its history.${replace ? " Its billing and shipping addresses, including the email used for future order messages, will be replaced with the customer's saved addresses." : ""}`;

  function cancel() {
    setOpen(false);
    setQuery("");
    setSelected(null);
    setReplace(false);
    setResult(null);
  }

  async function save(customerId: number, name: string, replaceAddresses: boolean) {
    if (savingRef.current || !editToken || customerId > 0 && !canSearch) return;
    savingRef.current = true;
    setSaving(true);
    setResult(null);
    try {
      const updated = await fetchJson<WooOrder>(`/api/woo/orders/${order.id}`, {
        method: "PATCH",
        json: {
          customer_id: customerId,
          if_match: editToken,
          ...(replaceAddresses ? { replace_addresses: true } : {}),
          ...(order.date_modified_gmt ? { if_unmodified_since: order.date_modified_gmt } : {}),
        },
      });
      onSaved(updated);
      setSuccess(customerId > 0 ? `Order #${updated.number} is now linked to ${name}.` : `Order #${updated.number} returned to guest checkout.`);
      cancel();
    } catch (cause) {
      const stale = cause instanceof RequestError && cause.status === 409 && Boolean((cause.body as { stale?: boolean } | undefined)?.stale);
      setResult(stale
        ? { tone: "warning", message: "This order was changed after you opened it. Reload it, check the details and try again.", stale: true }
        : { tone: "error", message: errorMessage(cause, "Could not update the customer."), stale: false });
    } finally {
      savingRef.current = false;
      setSaving(false);
      setPending(null);
    }
  }

  function confirmAction() {
    if (pending === "guest") {
      save(0, "", false);
    } else if (pending === "assign" && selected) {
      save(selected.id, selectedName, replace);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {success && <Notice tone="success">{success}</Notice>}

      {!open ? (
        <button type="button" disabled={!order.edit_token} onClick={() => { setEditToken(order.edit_token); setOpen(true); }} className={outlineButton}>
          <UserRound className="size-4" aria-hidden="true" />Change customer
        </button>
      ) : (
        <section aria-labelledby="order-customer-heading" className="space-y-4 rounded-xl border p-4">
          <h3 id="order-customer-heading" className="font-semibold">Assign customer</h3>
          <p className="text-sm text-muted-foreground">{explanation}</p>

          {canSearch ? (
            <>
              <TextField
                label="Search customers"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                disabled={saving}
                className={focusRing}
              />
              {searching && (
                loading || (!data && !error) ? <LoadingState label="Searching customers…" className="py-4" />
                  : error ? <ErrorState message={error} onRetry={reload} busy={loading} className="py-4" />
                  : customers.length === 0 ? <p className="text-sm text-muted-foreground">No registered customers match.</p>
                  : <ul className="space-y-2" aria-label="Matching customers">
                    {customers.map(customer => {
                      const isSelected = selected?.id === customer.id;
                      return (
                        <li key={customer.id}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            disabled={saving}
                            onClick={() => setSelected(customer)}
                            className={`flex w-full items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2.5 text-left text-sm hover:bg-accent disabled:opacity-50 ${isSelected ? "border-primary" : ""} ${focusRing}`}
                          >
                            <span className="min-w-0">
                              <span className="block break-words font-medium">{customerName(customer)}</span>
                              {customer.email && <span className="block break-all text-muted-foreground">{customer.email}</span>}
                              {typeof customer.orders_count === "number" && (
                                <span className="block text-xs text-muted-foreground">{customer.orders_count} {customer.orders_count === 1 ? "order" : "orders"}</span>
                              )}
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                              {customer.id === order.customer_id && <span>Currently assigned</span>}
                              {isSelected && <Check className="size-4 text-foreground" aria-hidden="true" />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
              )}
            </>
          ) : (
            <Notice tone="info">Searching customers needs the View customers permission. You can still return this order to guest checkout.</Notice>
          )}

          {selected && canSearch && (
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={event => setReplace(event.target.checked)}
                  disabled={saving}
                  className={`mt-0.5 size-4 rounded ${focusRing}`}
                />
                <span>Also replace this order&apos;s billing and shipping addresses with the customer&apos;s saved addresses</span>
              </label>
              <p className="pl-6 text-xs text-muted-foreground">This overwrites the addresses on this order.</p>
            </div>
          )}

          {result && (
            <Notice
              tone={result.tone}
              action={result.stale ? <button type="button" onClick={onReload} className={outlineButton}>Reload order</button> : undefined}
            >
              {result.message}
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!selected || saving || !canSearch} onClick={() => setPending("assign")} className={primaryButton}>
              {saving && pending === "assign" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}Assign customer
            </button>
            {order.customer_id > 0 && (
              <button type="button" disabled={saving} onClick={() => setPending("guest")} className={outlineButton}>Return to guest checkout</button>
            )}
            <button type="button" disabled={saving} onClick={cancel} className={outlineButton}>Cancel</button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending === "guest" ? "Return to guest checkout" : "Assign customer"}
        description={pending === "guest"
          ? `Return order #${order.number} to guest checkout? The order stays linked to its billing email only.`
          : assignDescription}
        confirmLabel={pending === "guest" ? "Return to guest checkout" : "Assign customer"}
        busy={saving}
        onCancel={() => setPending(null)}
        onConfirm={confirmAction}
      />
    </div>
  );
}
