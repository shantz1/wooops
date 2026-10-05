"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { inputClass } from "./field";

type Tier = "confirm" | "type";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** "confirm" asks once; "type" also requires typing `phrase` exactly (for dangerous actions). */
  tier?: Tier;
  phrase?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * A modal confirmation built on the native <dialog>, so focus is trapped and Escape works. The parent owns
 * `open`: Escape or a click on the backdrop calls `onCancel`, and the parent then sets `open` to false.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  tier = "confirm",
  phrase = "DELETE",
  busy,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const phraseId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      queueMicrotask(() => setTyped(""));
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const canConfirm = tier === "confirm" || typed === phrase;

  return (
    <dialog
      ref={dialogRef}
      // Escape: take over from the browser and let the parent decide, so `open` never gets out of step.
      onCancel={event => { event.preventDefault(); onCancel(); }}
      // Fallback for browsers that close the dialog anyway (e.g. Escape pressed without prior user activation).
      onClose={() => { if (open) onCancel(); }}
      // Padding lives on the inner div, so a click that lands on the dialog element itself is a backdrop click.
      onClick={event => { if (event.target === dialogRef.current) onCancel(); }}
      aria-labelledby={`${phraseId}-title`}
      className="m-auto w-[min(92vw,24rem)] rounded-xl border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="space-y-4 p-6">
        <div>
          <h2 id={`${phraseId}-title`} className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>

        {tier === "type" && (
          <div>
            <label htmlFor={phraseId} className="block text-sm font-medium">
              Type <span className="font-mono font-bold">{phrase}</span> to confirm
            </label>
            <input id={phraseId} type="text" autoComplete="off" value={typed} onChange={event => setTyped(event.target.value)} className={inputClass} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} autoFocus disabled={busy}>Cancel</Button>
          <Button
            variant={tier === "type" ? "outline" : "default"}
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className={tier === "type" ? "border-destructive text-destructive hover:bg-accent" : ""}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
