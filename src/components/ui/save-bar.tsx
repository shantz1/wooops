"use client";

import { Loader2 } from "lucide-react";
import { Button } from "./button";

interface SaveBarProps {
  changes: number;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
  summary?: string;
}

export function SaveBar({
  changes,
  onSave,
  onDiscard,
  saving,
  summary,
}: SaveBarProps) {
  if (changes === 0) {
    return null;
  }

  const changeText = `${changes} unsaved change${changes === 1 ? "" : "s"}`;

  return (
    <div className="sticky bottom-3 z-10 mx-3 rounded-xl border bg-background shadow-sm p-4">
      <div role="status" className="mb-2 text-sm">
        {changeText}
        {summary && (
          <p className="text-xs text-muted-foreground">{summary}</p>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onDiscard}
          disabled={saving}
        >
          Discard
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onSave}
          disabled={saving}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
