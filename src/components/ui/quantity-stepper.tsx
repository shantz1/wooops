"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Field, inputClass } from "./field";
import { cn } from "cn";

interface QuantityStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  error?: string;
}

const stepButton = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

/**
 * A whole-number control with minus/plus buttons. The number shown always follows `value` from the parent;
 * only while the user is typing does it show their unfinished text (a "draft"), which is committed on blur.
 */
export function QuantityStepper({ label, value, onChange, min = 0, max, step = 1, help, error }: QuantityStepperProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (number: number) => Math.min(max ?? Infinity, Math.max(min, number));
  const set = (number: number) => { setDraft(null); onChange(clamp(number)); };

  function commit() {
    if (draft === null) return;
    const parsed = parseInt(draft, 10);
    set(Number.isNaN(parsed) ? min : parsed);
  }

  return (
    <Field label={label} help={help} error={error}>
      {props => (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => set(value - step)} className={stepButton}>
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <input
            {...props}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={draft ?? String(value)}
            onChange={event => { if (/^\d*$/.test(event.target.value)) setDraft(event.target.value); }}
            onBlur={commit}
            onKeyDown={event => {
              if (event.key === "ArrowUp") { event.preventDefault(); set(value + step); }
              if (event.key === "ArrowDown") { event.preventDefault(); set(value - step); }
              if (event.key === "Enter") commit();
            }}
            className={cn(inputClass, "w-20 text-center")}
          />
          <button type="button" aria-label="Increase quantity" disabled={max !== undefined && value >= max} onClick={() => set(value + step)} className={stepButton}>
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </Field>
  );
}
