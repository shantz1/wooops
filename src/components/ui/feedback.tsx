import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from "lucide-react";

export function LoadingState({ label = "Loading…", className = "py-16" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${className}`}>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />{label}
    </div>
  );
}

export function RetryButton({ onRetry, busy, label = "Retry" }: { onRetry: () => void; busy?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onRetry} disabled={busy}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
      <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />{label}
    </button>
  );
}

/** Full-panel error used when nothing useful has loaded yet. */
export function ErrorState({ message, onRetry, busy, className = "py-16" }: { message: string; onRetry?: () => void; busy?: boolean; className?: string }) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 px-5 text-center ${className}`}>
      <XCircle className="size-6 text-destructive" aria-hidden="true" />
      <p className="max-w-md text-sm text-destructive">{message}</p>
      {onRetry && <RetryButton onRetry={onRetry} busy={busy} />}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, className = "py-16" }: { icon?: LucideIcon; title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`px-5 text-center text-muted-foreground ${className}`}>
      {Icon && <Icon className="mx-auto size-7" aria-hidden="true" />}
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}

const tones = {
  error: { icon: XCircle, className: "border-destructive border-l-4 text-destructive", role: "alert" },
  warning: { icon: AlertTriangle, className: "border-amber-300 border-l-4 text-amber-950 dark:border-amber-700 dark:text-amber-100", role: "alert" },
  success: { icon: CheckCircle2, className: "border-emerald-300 border-l-4 text-emerald-950 dark:border-emerald-700 dark:text-emerald-100", role: "status" },
  info: { icon: Info, className: "border-border border-l-4 text-foreground", role: "status" },
} as const;

/** Inline message that keeps the surrounding data visible, e.g. a failed refresh or a partially successful save. */
export function Notice({ tone, children, action, className = "" }: { tone: keyof typeof tones; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass, role } = tones[tone];
  return (
    <div role={role} className={`flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${toneClass} ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
