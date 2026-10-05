"use client";

import { Field, inputClass } from "./field";
import { cn } from "cn";

interface MoneyFieldProps {
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
  optional?: boolean;
  /** Decimal places the currency uses (2 for most, 0 for JPY, 3 for KWD). */
  decimals?: number;
}

export function MoneyField({
  label,
  currency,
  value,
  onChange,
  help,
  error,
  optional,
  decimals = 2,
}: MoneyFieldProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // Only accept digits and up to `decimals` decimal places
    const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
    if (pattern.test(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <Field label={label} help={help} error={error} optional={optional}>
      {(props) => (
        <div className="flex items-center gap-2 border-b-2 border-input transition-colors focus-within:border-primary has-[[aria-invalid=true]]:border-destructive">
          <span
            className="text-sm text-muted-foreground"
            aria-hidden="true"
          >
            {currency}
          </span>
          <input
            {...props}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={handleChange}
            className={cn(inputClass, "flex-1 border-b-0 focus:border-transparent")}
          />
        </div>
      )}
    </Field>
  );
}
