"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { usePanelPreferences } from "@/components/panel-preferences";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/feedback";
import { errorMessage, fetchJson, RequestError } from "@/lib/fetch-json";
import { cooldownMs } from "@/lib/woocommerce/order-email";
import type { WooOrder } from "@/types/woocommerce";

type Probe = { available: boolean; recipient: string };
type Outcome = { tone: "success" | "warning" | "error"; message: string };

/** Asks WooCommerce to send its standard order details email. Nothing is sent until the user confirms the address shown. */
export function OrderResendEmail({ order, onAccepted }: { order: WooOrder; onAccepted?: () => void }) {
  const { can } = usePanelPreferences();
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Blocks a second submission while one is in flight, and until the 60-second lock ends unless the request
  // failed definitively (the server refused it before sending anything).
  const inFlight = useRef(false);

  // Counts the lock down once a second. The timer stops when the lock ends or the component unmounts.
  useEffect(() => {
    if (lockUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockUntil) {
        inFlight.current = false;
        setLockUntil(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockUntil]);

  if (!can("orders.view") || !can("orders.notify")) return null;

  const locked = lockUntil !== null;
  const remaining = lockUntil === null ? 0 : Math.max(1, Math.ceil((lockUntil - now) / 1000));

  async function openFlow() {
    setProbing(true);
    setProbeError("");
    setOutcome(null);
    try {
      const result = await fetchJson<Probe>(`/api/woo/orders/${order.id}/email`);
      setProbe(result);
      setConfirmOpen(result.available && result.recipient !== "");
    } catch (cause) {
      setProbe(null);
      setProbeError(errorMessage(cause, "Could not check whether order details can be resent."));
    } finally {
      setProbing(false);
    }
  }

  async function send() {
    if (!probe?.recipient || inFlight.current) return;
    inFlight.current = true;
    const started = Date.now();
    setNow(started);
    setLockUntil(started + cooldownMs);
    setSending(true);
    setOutcome(null);
    let definite = false;
    try {
      const response = await fetchJson<{ accepted: boolean; recipient: string }>(`/api/woo/orders/${order.id}/email`, { method: "POST", json: { confirm_email: probe.recipient } });
      if (response.accepted !== true) throw new Error("The store did not confirm the email request. Check the order notes before retrying.");
      onAccepted?.();
      setOutcome({ tone: "success", message: `WooCommerce accepted the request to email order details to ${response.recipient}. Delivery depends on the store's email settings; the order notes show what WooCommerce recorded.` });
    } catch (cause) {
      const status = cause instanceof RequestError ? cause.status : 0;
      const body = cause instanceof RequestError ? (cause.body as { unknown?: boolean } | undefined) : undefined;
      if (status === 502 || status === 504 || body?.unknown) {
        setOutcome({ tone: "warning", message: "We could not confirm whether the store sent the email. Check the order notes before trying again." });
      } else if (status === 429) {
        setOutcome({ tone: "warning", message: errorMessage(cause, "Order details were already requested for this order a moment ago.") });
      } else {
        definite = [400, 403, 409, 501].includes(status);
        setOutcome({ tone: "error", message: errorMessage(cause, "Could not resend order details.") });
      }
    } finally {
      setSending(false);
      setConfirmOpen(false);
      if (definite) { inFlight.current = false; setLockUntil(null); }
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        onClick={openFlow}
        disabled={probing || sending || locked}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
      >
        {probing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
        {locked ? `Resend available in ${remaining} s` : "Resend order details"}
      </button>
      {probing && <p role="status" className="text-xs text-muted-foreground">Checking the billing address…</p>}
      {probeError && <Notice tone="error">{probeError}</Notice>}
      {probe && !probe.available && <Notice tone="info">This store&apos;s WooCommerce version cannot resend order details from here.</Notice>}
      {probe && probe.available && !probe.recipient && <Notice tone="info">This order has no valid billing email address, so there is nobody to send it to. Add one in the Billing tab first.</Notice>}
      {outcome && <Notice tone={outcome.tone}>{outcome.message}</Notice>}

      <ConfirmDialog
        open={confirmOpen}
        title="Resend order details"
        description={`WooCommerce will email its standard order details message to ${probe?.recipient ?? ""}. An email cannot be recalled once sent.`}
        confirmLabel="Send email"
        busy={sending}
        onCancel={() => { if (!sending) setConfirmOpen(false); }}
        onConfirm={send}
      />
    </div>
  );
}
