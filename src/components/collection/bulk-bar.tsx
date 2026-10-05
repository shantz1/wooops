"use client";

interface BulkBarProps {
  count: number;
  noun: string;
  onClear: () => void;
  children?: React.ReactNode;
}

export function BulkBar({ count, noun, onClear, children }: BulkBarProps) {
  if (count === 0) {
    return null;
  }

  const pluralized = count === 1 ? noun : `${noun}s`;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3 shadow-sm"
    >
      <span className="text-sm font-medium">
        {count} {pluralized} selected
      </span>
      {children}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
      >
        Clear selection
      </button>
    </div>
  );
}
