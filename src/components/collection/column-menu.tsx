"use client";

import { Columns3 } from "lucide-react";
import { useEffect, useRef } from "react";

interface Column {
  key: string;
  label: string;
}

interface ColumnMenuProps {
  columns: Column[];
  visible: string[];
  onChange: (visible: string[]) => void;
  onReset: () => void;
}

export function ColumnMenu({ columns, visible, onChange, onReset }: ColumnMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && detailsRef.current?.open) {
        detailsRef.current.open = false;
      }
    }

    const element = detailsRef.current;
    element?.addEventListener("keydown", handleKeyDown);
    return () => element?.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleBlur(event: React.FocusEvent) {
    const details = detailsRef.current;
    if (!details?.open) return;

    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && details.contains(relatedTarget)) {
      return;
    }

    details.open = false;
  }

  function toggleColumn(key: string) {
    if (visible.length === 1 && visible.includes(key)) {
      return; // Can't uncheck the last visible column
    }

    const newVisible = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : [...visible, key];

    onChange(newVisible);
  }

  return (
    <details ref={detailsRef} className="relative" onBlur={handleBlur}>
      <summary
        className="list-none inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Choose columns"
      >
        <Columns3 className="size-4" aria-hidden="true" />
        Columns
      </summary>
      <div className="absolute right-0 mt-1 z-10 rounded-xl border bg-background shadow-md p-3 min-w-48">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {columns.map((column) => {
            const isChecked = visible.includes(column.key);
            const isLastVisible = visible.length === 1 && isChecked;

            return (
              <label key={column.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isLastVisible}
                  onChange={() => toggleColumn(column.key)}
                  className="cursor-pointer disabled:opacity-50"
                />
                <span>{column.label}</span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 w-full pt-3 border-t text-sm text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
        >
          Reset to default
        </button>
      </div>
    </details>
  );
}
