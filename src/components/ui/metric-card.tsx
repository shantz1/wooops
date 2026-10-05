"use client";

import { cn } from "cn";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  definition?: string;
  className?: string;
}

const toneColors: Record<Tone, string> = {
  neutral: "border-t-transparent",
  info: "border-t-blue-500",
  success: "border-t-emerald-500",
  warning: "border-t-amber-500",
  danger: "border-t-red-500",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  definition,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-t-2 p-4",
        toneColors[tone],
        className
      )}
      title={definition}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
