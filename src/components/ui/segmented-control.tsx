"use client";

import { useRef } from "react";

interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
}

/** A small set of mutually exclusive choices (a radio group) with arrow-key navigation. */
export function SegmentedControl<T extends string>({ label, value, onChange, options }: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move the selection AND the focus, so repeated presses keep moving from the new item.
  function move(index: number) {
    const target = (index + options.length) % options.length;
    onChange(options[target].value);
    buttons.current[target]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: options.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    move(next);
  }

  const selected = options.find(option => option.value === value);

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1">
        {options.map((option, index) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              ref={element => { buttons.current[index] = element; }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={event => onKeyDown(event, index)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                checked ? "border-primary font-medium text-primary" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selected?.description && <p className="text-xs text-muted-foreground">{selected.description}</p>}
    </div>
  );
}
