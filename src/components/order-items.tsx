import { ProductThumbnail } from "@/components/product-thumbnail";
import { Notice } from "@/components/ui/feedback";
import { plainText } from "@/lib/format";
import { decimalsEqual, formatMoney, parseDecimal, roundDecimal } from "@/lib/money";
import { orderTotals } from "@/lib/order-totals";
import type { WooLineItem, WooOrder } from "@/types/woocommerce";

/** Customer-visible item meta such as variation attributes. Keys starting with "_" are internal to WooCommerce. */
function itemMeta(item: WooLineItem) {
  return (item.meta_data || []).flatMap(meta => {
    if (meta.key.startsWith("_")) return [];
    const label = plainText(String(meta.display_key || meta.key));
    const raw = meta.display_value ?? meta.value;
    if (typeof raw !== "string" && typeof raw !== "number") return [];
    const value = plainText(String(raw));
    return label && value ? [{ id: meta.id, label, value }] : [];
  });
}

export function OrderItems({ order }: { order: WooOrder }) {
  const totals = orderTotals(order);
  const money = (value: string) => {
    const parsed = parseDecimal(value);
    return parsed ? formatMoney(roundDecimal(parsed, totals.scale), order.currency) : `${order.currency} ${value}`;
  };

  const units = order.line_items.reduce((count, item) => count + item.quantity, 0);

  return (
    <section aria-labelledby="items-heading" className="rounded-xl border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b p-5">
        <h2 id="items-heading" className="font-semibold">Items</h2>
        <span className="text-sm text-muted-foreground">{units} {units === 1 ? "unit" : "units"}</span>
      </div>
      <ul className="divide-y">
        {order.line_items.map(item => {
          const meta = itemMeta(item);
          const subtotal = parseDecimal(item.subtotal);
          const total = parseDecimal(item.total);
          const discounted = subtotal && total && !decimalsEqual(subtotal, total);
          return (
            <li key={item.id} className="flex gap-3 p-5 sm:gap-4">
              <ProductThumbnail src={item.image?.src} alt={item.name} size={56} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <p className="font-medium">{plainText(item.name)}</p>
                  <p className="shrink-0 text-sm font-medium sm:text-right">
                    {discounted && <span className="mr-2 text-xs font-normal text-muted-foreground line-through">{money(item.subtotal)}</span>}
                    {money(item.total)}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Qty {item.quantity}{item.sku ? <> · SKU <span className="font-mono text-xs">{item.sku}</span></> : " · No SKU"}
                  {item.variation_id ? <> · Variation #{item.variation_id}</> : null}
                </p>
                {meta.length > 0 && <dl className="mt-2 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[max-content_1fr]">
                  {meta.map(entry => <div key={entry.id} className="contents"><dt className="text-muted-foreground">{entry.label}</dt><dd className="break-words">{entry.value}</dd></div>)}
                </dl>}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t p-5">
        <dl className="ml-auto max-w-sm space-y-2 text-sm">
          {totals.rows.map(row => <div key={row.key} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{row.label}{row.hint && <span className="block text-xs">{row.hint}</span>}</dt>
            <dd className="tabular-nums">{formatMoney(row.amount, order.currency)}</dd>
          </div>)}
          {(order.coupon_lines || []).length > 0 && <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <dt>Coupons</dt><dd className="text-right">{order.coupon_lines!.map(coupon => coupon.code).join(", ")}</dd>
          </div>}
          <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
            <dt>Order total</dt><dd className="tabular-nums">{money(order.total)}</dd>
          </div>
          {totals.refunded && <>
            <div className="flex justify-between gap-4 text-violet-800 dark:text-violet-300">
              <dt>Refunded ({order.refunds!.length})</dt><dd className="tabular-nums">−{formatMoney(totals.refunded, order.currency)}</dd>
            </div>
            {totals.netAfterRefunds && <div className="flex justify-between gap-4 font-medium">
              <dt>Total after refunds</dt><dd className="tabular-nums">{formatMoney(totals.netAfterRefunds!, order.currency)}</dd>
            </div>}
          </>}
        </dl>
        {(order.shipping_lines || []).length > 0 && <p className="mt-3 text-right text-xs text-muted-foreground">Shipping method: {order.shipping_lines!.map(line => plainText(line.method_title)).join(", ")}</p>}
        {(!totals.valid || !totals.reconciles) && <Notice tone="info" className="mt-4">
          {totals.valid
            ? "These lines do not add up exactly to Store's order total (for example because of rounding or an extension). The order total shown is Store's own value."
            : "Store returned an amount WooOps could not read, so the breakdown may be incomplete. The order total shown is Store's own value."}
        </Notice>}
      </div>
    </section>
  );
}
