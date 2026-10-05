"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { TextField, TextAreaField } from "@/components/ui/field";
import { Notice } from "@/components/ui/feedback";
import { SaveBar } from "@/components/ui/save-bar";
import { errorMessage, fetchJson } from "@/lib/fetch-json";
import { addressLines, hasAddress } from "@/lib/format";
import type { WooAddress, WooOrder } from "@/types/woocommerce";

interface OrderAddressFormProps {
  kind: "shipping" | "billing";
  order: WooOrder;
  canEdit: boolean;
  onSaved: (order: WooOrder) => void;
}

function validateEmail(email: string): boolean {
  if (!email) return true; // empty is ok for billing
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function countChanges(original: WooAddress, draft: WooAddress, fields: (keyof WooAddress)[]): number {
  return fields.filter(key => original[key] !== draft[key]).length;
}

export function OrderAddressForm({ kind, order, canEdit, onSaved }: OrderAddressFormProps) {
  const address = kind === "billing" ? order.billing : order.shipping;
  const [draft, setDraft] = useState<WooAddress & { customer_note?: string }>({
    ...address,
    ...(kind === "shipping" && { customer_note: order.customer_note || "" }),
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const isBilling = kind === "billing";
  const fields: (keyof WooAddress)[] = isBilling
    ? ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", "phone", "email"]
    : ["first_name", "last_name", "company", "address_1", "address_2", "city", "state", "postcode", "country", "phone"];

  const changed = canEdit ? countChanges(address, draft, fields) + (kind === "shipping" && (draft.customer_note || "") !== (order.customer_note || "") ? 1 : 0) : 0;

  const copyFromBilling = () => {
    setDraft(prev => ({
      ...prev,
      first_name: order.billing.first_name,
      last_name: order.billing.last_name,
      company: order.billing.company,
      address_1: order.billing.address_1,
      address_2: order.billing.address_2,
      city: order.billing.city,
      state: order.billing.state,
      postcode: order.billing.postcode,
      country: order.billing.country,
      phone: order.billing.phone,
    }));
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const country = draft.country || "";
    if (country && !/^[A-Za-z]{2}$/.test(country)) {
      newErrors.country = "Use a two-letter country code, for example IN";
    }
    if (isBilling) {
      const email = draft.email || "";
      if (!validateEmail(email)) {
        newErrors.email = "Enter a valid email address";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const save = async () => {
    if (!canEdit || saving || changed === 0 || !validate()) return;
    setSaving(true);
    setResult(null);

    const payload: Record<string, string | Record<string, string>> = {};
    const addressKey = kind === "billing" ? "billing" : "shipping";
    const addressPayload: Record<string, string> = {};

    for (const field of fields) {
      if (address[field] !== draft[field]) {
        addressPayload[field] = draft[field] ?? "";
      }
    }

    if (Object.keys(addressPayload).length > 0) {
      payload[addressKey] = addressPayload;
    }

    if (kind === "shipping" && (draft.customer_note || "") !== (order.customer_note || "")) {
      payload.customer_note = draft.customer_note || "";
    }

    if (Object.keys(payload).length === 0) {
      setSaving(false);
      return;
    }

    try {
      const updated = await fetchJson<WooOrder>(`/api/woo/orders/${order.id}`, { method: "PATCH", json: payload });
      setDraft({
        ...updated[addressKey as "billing" | "shipping"],
        ...(kind === "shipping" && { customer_note: updated.customer_note || "" }),
      });
      onSaved(updated);
      setResult({ tone: "success", message: `${isBilling ? "Billing" : "Shipping"} address updated.` });
    } catch (cause) {
      setResult({ tone: "error", message: errorMessage(cause, "Update failed.") });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setDraft({
      ...address,
      ...(kind === "shipping" && { customer_note: order.customer_note || "" }),
    });
    setErrors({});
    setResult(null);
  };

  if (!canEdit) {
    return (
      <div className="space-y-3">
        {hasAddress(address) ? (
          <address className="text-sm not-italic leading-6">
            {addressLines(address).map((line, index) => (
              <span key={index} className="block break-words">{line}</span>
            ))}
          </address>
        ) : (
          <p className="text-sm text-muted-foreground">No {kind} address recorded.</p>
        )}
        {kind === "shipping" && order.customer_note?.trim() && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground">Customer note:</p>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words">{order.customer_note}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          value={draft.first_name || ""}
          onChange={e => setDraft(prev => ({ ...prev, first_name: e.target.value }))}
          disabled={saving}
        />
        <TextField
          label="Last name"
          value={draft.last_name || ""}
          onChange={e => setDraft(prev => ({ ...prev, last_name: e.target.value }))}
          disabled={saving}
        />
      </div>

      <TextField
        label="Company"
        optional
        value={draft.company || ""}
        onChange={e => setDraft(prev => ({ ...prev, company: e.target.value }))}
        disabled={saving}
      />

      <TextField
        label="Address line 1"
        optional
        value={draft.address_1 || ""}
        onChange={e => setDraft(prev => ({ ...prev, address_1: e.target.value }))}
        disabled={saving}
      />

      <TextField
        label="Address line 2"
        optional
        value={draft.address_2 || ""}
        onChange={e => setDraft(prev => ({ ...prev, address_2: e.target.value }))}
        disabled={saving}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="City"
          optional
          value={draft.city || ""}
          onChange={e => setDraft(prev => ({ ...prev, city: e.target.value }))}
          disabled={saving}
        />
        <TextField
          label="State"
          optional
          value={draft.state || ""}
          onChange={e => setDraft(prev => ({ ...prev, state: e.target.value }))}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Postal code"
          optional
          value={draft.postcode || ""}
          onChange={e => setDraft(prev => ({ ...prev, postcode: e.target.value }))}
          disabled={saving}
        />
        <TextField
          label="Country"
          optional
          help="Two-letter code, for example IN"
          error={errors.country}
          value={(draft.country || "").toUpperCase()}
          onChange={e => setDraft(prev => ({ ...prev, country: e.target.value.toUpperCase() }))}
          disabled={saving}
        />
      </div>

      <TextField
        label="Phone"
        optional
        type="tel"
        value={draft.phone || ""}
        onChange={e => setDraft(prev => ({ ...prev, phone: e.target.value }))}
        disabled={saving}
      />

      {isBilling && (
        <TextField
          label="Email"
          optional
          type="email"
          error={errors.email}
          value={draft.email || ""}
          onChange={e => setDraft(prev => ({ ...prev, email: e.target.value }))}
          disabled={saving}
        />
      )}

      {kind === "shipping" && (
        <TextAreaField
          label="Customer note"
          optional
          maxLength={1000}
          value={draft.customer_note || ""}
          onChange={e => setDraft(prev => ({ ...prev, customer_note: e.target.value }))}
          disabled={saving}
        />
      )}

      {result && <Notice tone={result.tone}>{result.message}</Notice>}

      <div className="flex gap-2">
        {kind === "shipping" && (
          <button
            type="button"
            onClick={copyFromBilling}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Copy className="size-3.5" aria-hidden="true" />Copy from billing
          </button>
        )}
      </div>

      <SaveBar
        changes={changed}
        saving={saving}
        onSave={save}
        onDiscard={discard}
      />
    </div>
  );
}
