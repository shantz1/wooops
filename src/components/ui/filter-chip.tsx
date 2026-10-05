"use client";

import { Check } from "lucide-react";
import { cn } from "cn";

interface FilterChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: React.ReactNode;
  count?: number;
  className?: string;
}

export function FilterChip({
  pressed,
  onPressedChange,
  children,
  count,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pressed
          ? "border-primary text-primary font-medium"
          : "text-muted-foreground hover:bg-accent",
        className
      )}
    >
      {pressed && <Check className="size-3.5" aria-hidden="true" />}
      <span>{children}</span>
      {count !== undefined && (
        <span className="ml-1 text-xs font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
