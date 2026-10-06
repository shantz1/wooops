"use client";

import { useCallback, useEffect, useState } from "react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextField } from "@/components/ui/field";
import { ErrorState, LoadingState, Notice } from "@/components/ui/feedback";
import { MetricCard } from "@/components/ui/metric-card";
import { MoneyField } from "@/components/ui/money-field";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { SectionCard } from "@/components/ui/section-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { errorMessage, fetchJson, RequestError } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/money";
import { currencyDecimals, refundTaxShares } from "@/lib/woocommerce/refund";
import type { WooLineItem, WooOrder } from "@/types/woocommerce";

interface Refund {
  id: number;
  date_created: string;
  reason: string;
  /** WooCommerce returns a refund's value as a positive `amount`; `total` is not part of this response. */
  amount: string;
  line_items: Array<{ id: number; name: string; quantity: number; total: string; meta_data?: Array<{ key: string; value: unknown }> }>;
}

interface RefundFormState {
  selected: number[];
  quantities: Record<number, number>;
  /** Amount without tax for each selected item, as typed. */
  amounts: Record<number, string>;
  /** null until the user types: the amount then follows the selected items. */
  totalAmount: string | null;
  reason: string;
  mode: "store" | "gateway";
  restock: boolean;
  requestId: string;
}

const emptyForm = (requestId = ""): RefundFormState => ({ selected: [], quantities: {}, amounts: {}, totalAmount: null, reason: "", mode: "store", restock: false, requestId });

export function OrderRefunds({ order, onOrderChange }: { order: WooOrder; onOrderChange: (order: WooOrder) => void }) {
  const { can } = usePanelPreferences();
  const decimals = currencyDecimals(order);
  const scale = 10 ** decimals;
  /** Money as whole units of the smallest currency step, so sums never pick up floating-point noise. */
  const toUnits = (value: string | number | undefined) => Math.round(Number(value || 0) * scale);
  const fromUnits = (units: number) => (units / scale).toFixed(decimals);
  const money = (units: number) => formatMoney(fromUnits(units), order.currency);

  // `refunds` keeps the last successful load; a failed refresh never erases it.
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RefundFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error" | "warning"; message: string } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadRefunds = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setRefunds(await fetchJson<Refund[]>(`/api/woo/orders/${order.id}/refunds`));
      setHistoryError("");
    } catch (cause) {
      setHistoryError(errorMessage(cause, "Could not load refunds."));
    } finally {
      setHistoryLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  // The order itself always carries every refund total, so these figures never depend on the history request.
  const refundedUnits = (order.refunds || []).reduce((sum, refund) => sum + Math.abs(toUnits(refund.total)), 0);
  const leftUnits = Math.max(0, toUnits(order.total) - refundedUnits);
  // The form needs a reliable history (to know what is already refunded), so it stays closed while that is unavailable.
  const historyReady = refunds !== null && !historyError;
  const canRefund = can("orders.refund") && leftUnits > 0;

  const refundedQuantity = (itemId: number) =>
    (refunds || []).reduce((sum, refund) => sum + refund.line_items.reduce((inner, line) => {
      const original = line.meta_data?.find(meta => meta.key === "_refunded_item_id")?.value;
      return Number(original) === itemId && line.quantity < 0 ? inner + Math.abs(line.quantity) : inner;
    }, 0), 0);

  /** The share of a line's value for `quantity` units: exact for the whole line, proportional otherwise. */
  const share = (value: string | undefined, item: WooLineItem, quantity: number) =>
    quantity >= item.quantity ? toUnits(value) : Math.round((toUnits(value) * quantity) / item.quantity);

  /** Tax for the chosen quantity, per WooCommerce tax rate, so the refund is reported against the right rates. */
  const taxShares = (item: WooLineItem, quantity: number) => refundTaxShares(item, quantity, decimals);

  const itemTaxUnits = (item: WooLineItem, quantity: number) => {
    const rates = taxShares(item, quantity);
    return rates === null ? share(item.total_tax, item, quantity) : rates.reduce((sum, rate) => sum + rate.units, 0);
  };

  /** What the selected items add up to: the amount typed for each (without tax) plus their tax. */
  const itemsUnits = () => form.selected.reduce((sum, id) => {
    const item = order.line_items.find(line => line.id === id);
    return item ? sum + toUnits(form.amounts[id]) + itemTaxUnits(item, form.quantities[id] || 1) : sum;
  }, 0);
  const amountText = form.totalAmount ?? fromUnits(itemsUnits());

  const openForm = () => {
    setForm(emptyForm(crypto.randomUUID()));
    setShowForm(true);
    setResult(null);
  };

  const toggleItem = (item: WooLineItem, on: boolean) => {
    setForm(prev => {
      if (!on) {
        const { [item.id]: removedQuantity, ...quantities } = prev.quantities;
        const { [item.id]: removedAmount, ...amounts } = prev.amounts;
        void removedQuantity; void removedAmount;
        const selected = prev.selected.filter(id => id !== item.id);
        return { ...prev, selected, quantities, amounts, restock: selected.length > 0 && prev.restock };
      }
      const quantity = Math.max(1, item.quantity - refundedQuantity(item.id));
      return {
        ...prev,
        selected: [...prev.selected, item.id],
        quantities: { ...prev.quantities, [item.id]: quantity },
        amounts: { ...prev.amounts, [item.id]: fromUnits(share(item.total, item, quantity)) },
        restock: true,
      };
    });
  };

  const changeQuantity = (item: WooLineItem, quantity: number) =>
    setForm(prev => ({ ...prev, quantities: { ...prev.quantities, [item.id]: quantity }, amounts: { ...prev.amounts, [item.id]: fromUnits(share(item.total, item, quantity)) } }));

  const review = () => {
    if (!historyReady) return setResult({ tone: "error", message: "The refund history could not be refreshed, so this refund cannot be checked. Try again once it has loaded." });
    if (form.selected.some(id => { const item = order.line_items.find(line => line.id === id); return item && taxShares(item, form.quantities[id] || 1) === null; })) {
      return setResult({ tone: "error", message: "The store did not give a tax breakdown for a selected item, so its tax cannot be refunded correctly. Deselect it, or refund an amount without items." });
    }
    const total = toUnits(amountText);
    if (total <= 0) return setResult({ tone: "error", message: "Refund amount must be greater than 0." });
    if (total > leftUnits) return setResult({ tone: "error", message: "That is more than what is left to refund." });
    if (itemsUnits() > total) return setResult({ tone: "error", message: "The refund amount is less than the selected items plus their tax." });
    setResult(null);
    setShowConfirm(true);
  };

  const submit = async () => {
    if (!historyReady) { setShowConfirm(false); return setResult({ tone: "error", message: "The refund history could not be refreshed, so this refund cannot be checked. Try again once it has loaded." }); }
    setSaving(true);
    setShowConfirm(false);
    try {
      const items = form.selected.flatMap(id => {
        const item = order.line_items.find(line => line.id === id);
        if (!item) return [];
        const quantity = form.quantities[id] || 1;
        const rates = taxShares(item, quantity) || [];
        return [{ id, quantity, refund_total: form.amounts[id] || fromUnits(0), ...(rates.length ? { taxes: rates.map(rate => ({ id: rate.id, refund_total: fromUnits(rate.units) })) } : {}) }];
      });
      const response = await fetchJson<{ refund: Refund; order: WooOrder; duplicate?: boolean }>(`/api/woo/orders/${order.id}/refunds`, {
        method: "POST",
        json: { amount: amountText, request_id: form.requestId, gateway: form.mode === "gateway", ...(form.reason.trim() ? { reason: form.reason.trim() } : {}), ...(items.length ? { items, restock: form.restock } : {}) },
      });
      onOrderChange(response.order);
      await loadRefunds();
      setShowForm(false);
      setResult({ tone: "success", message: response.duplicate ? "This refund was already recorded." : `Refund of ${formatMoney(amountText, order.currency)} recorded.` });
    } catch (cause) {
      // 400, 403 and 409 are answers from the server: nothing was recorded. Anything else (network, timeout, 5xx) is unknown.
      if (cause instanceof RequestError && [400, 403, 409].includes(cause.status)) {
        setResult({ tone: "error", message: errorMessage(cause, "Refund failed.") });
      } else {
        setResult({ tone: "warning", message: "We could not confirm whether the refund was recorded. Check the refund history below. The store may still be finishing it, so wait a minute and look again; only if the refund is still not listed, try again." });
        await loadRefunds();
        onOrderChange(await fetchJson<WooOrder>(`/api/woo/orders/${order.id}`).catch(() => order));
      }
      setShowForm(true);
    } finally {
      setSaving(false);
    }
  };

  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Order total" value={money(toUnits(order.total))} />
        <MetricCard label="Refunded so far" value={money(refundedUnits)} tone="info" />
        <MetricCard label="Left to refund" value={money(leftUnits)} tone={leftUnits === 0 ? "success" : "neutral"} />
      </div>

      {result && <Notice tone={result.tone}>{result.message}</Notice>}

      <SectionCard title="Refund history">
        {historyLoading && refunds === null && <LoadingState label="Loading refunds…" className="py-8" />}
        {historyError && refunds === null && <ErrorState message={historyError} onRetry={loadRefunds} />}
        {historyError && refunds !== null && (
          <Notice tone="warning">
            {historyError} Showing the last list that loaded.{" "}
            <button type="button" onClick={loadRefunds} className={`underline ${focusRing}`}>Try again</button>
          </Notice>
        )}
        {refunds !== null && refunds.length === 0 && <p className="text-sm text-muted-foreground">No refunds on this order.</p>}
        {refunds !== null && refunds.length > 0 && (
          <div className="space-y-4">
            {refunds.map(refund => (
              <div key={refund.id} className="border-t pt-4 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{new Date(refund.date_created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{refund.reason || "No reason given"}</p>
                  </div>
                  <p className="text-sm font-medium">{money(Math.abs(toUnits(refund.amount)))}</p>
                </div>
                {refund.line_items.length > 0 && (
                  <ul className="mt-2 text-xs text-muted-foreground">
                    {refund.line_items.map(line => <li key={line.id}>{line.name} × {Math.abs(line.quantity)}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {can("orders.refund") && leftUnits === 0 && <p className="text-sm text-muted-foreground">Fully refunded.</p>}

      {canRefund && !showForm && (
        <div>
          <Button onClick={openForm} disabled={!historyReady}>Refund</Button>
          {!historyReady && <p className="mt-2 text-xs text-muted-foreground">Refunds are available once the refund history has loaded.</p>}
        </div>
      )}

      {canRefund && showForm && (
        <SectionCard title="New refund">
          <div className="space-y-4">
            {!historyReady && <Notice tone="warning">The refund history could not be refreshed. Refunds are paused until it loads. <button type="button" onClick={loadRefunds} className={`underline ${focusRing}`}>Try again</button></Notice>}
            <div>
              <p className="mb-3 text-sm font-medium">Items (optional)</p>
              <div className="space-y-3">
                {order.line_items.map(item => {
                  const already = refundedQuantity(item.id);
                  const fullyRefunded = already >= item.quantity;
                  const on = form.selected.includes(item.id);
                  const noTaxBreakdown = taxShares(item, 1) === null;
                  const tax = on ? itemTaxUnits(item, form.quantities[item.id] || 1) : 0;
                  return (
                    <div key={item.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <input type="checkbox" aria-label={`Refund ${item.name}`} checked={on} onChange={event => toggleItem(item, event.target.checked)} disabled={fullyRefunded || noTaxBreakdown || saving} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${fullyRefunded ? "text-muted-foreground" : "font-medium"}`}>{item.name}</p>
                        {fullyRefunded && <p className="text-xs text-muted-foreground">Already refunded</p>}
                        {noTaxBreakdown && !fullyRefunded && <p className="text-xs text-muted-foreground">The store gave no tax breakdown for this item, so it cannot be refunded here. Refund an amount without items instead.</p>}
                        {on && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <QuantityStepper label="Quantity" value={form.quantities[item.id] || 1} onChange={quantity => changeQuantity(item, quantity)} min={1} max={Math.max(1, item.quantity - already)} />
                            <MoneyField label="Amount for this item (without tax)" currency={order.currency} decimals={decimals} value={form.amounts[item.id] || ""} onChange={amount => setForm(prev => ({ ...prev, amounts: { ...prev.amounts, [item.id]: amount } }))} help={tax > 0 ? `Plus ${money(tax)} tax` : undefined} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.restock && form.selected.length > 0} onChange={event => setForm(prev => ({ ...prev, restock: event.target.checked }))} disabled={form.selected.length === 0 || saving} />
                <span className="text-sm">Restock refunded items</span>
              </label>
              <p className="ml-6 text-xs text-muted-foreground">Adds the refunded quantities back to stock when the product tracks stock.</p>
            </div>

            <MoneyField label="Refund amount" currency={order.currency} decimals={decimals} value={amountText} onChange={amount => setForm(prev => ({ ...prev, totalAmount: amount }))} help={`Includes tax. Left to refund: ${money(leftUnits)}`} />
            <TextField label="Reason" value={form.reason} onChange={event => setForm(prev => ({ ...prev, reason: event.target.value }))} optional maxLength={200} />

            <SegmentedControl
              label="How to refund"
              value={form.mode}
              onChange={mode => setForm(prev => ({ ...prev, mode: mode as "store" | "gateway" }))}
              options={[
                { value: "store", label: "Record in store only", description: "Marks the refund in the store. No money is moved by KartoDesk or WooCommerce." },
                { value: "gateway", label: "Also refund through the payment gateway", description: `Asks ${order.payment_method_title || "the payment gateway"} to send the money back. Only works if the gateway supports refunds; it cannot be undone.` },
              ]}
            />

            <div className="flex gap-2">
              <Button onClick={review} disabled={saving || !historyReady || toUnits(amountText) <= 0}>Review refund</Button>
              <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </SectionCard>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Confirm refund"
        description={`Refund ${formatMoney(amountText, order.currency)} on order #${order.number}? ${form.mode === "gateway" ? `Asks ${order.payment_method_title || "the payment gateway"} to send the money back.` : "The refund will be recorded in the store only."}`}
        confirmLabel={form.mode === "gateway" ? "Refund through gateway" : "Record refund"}
        tier={form.mode === "gateway" ? "type" : "confirm"}
        phrase={form.mode === "gateway" ? "REFUND" : undefined}
        busy={saving}
        onCancel={() => setShowConfirm(false)}
        onConfirm={submit}
      />
    </div>
  );
}
