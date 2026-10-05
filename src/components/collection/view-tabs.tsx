"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, inputClass } from "@/components/ui/field";
import { cn } from "cn";

interface View {
  id: string;
  name: string;
  custom?: boolean;
}

interface ViewTabsProps {
  views: View[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onSave: (name: string) => string | undefined;
  onRemove: (id: string) => void;
  canSave: boolean;
}

export function ViewTabs({
  views,
  activeId,
  onSelect,
  onSave,
  onRemove,
  canSave,
}: ViewTabsProps) {
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | undefined>();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saving) {
      nameInputRef.current?.focus();
    }
  }, [saving]);

  function handleSave() {
    const error = onSave(saveName);
    if (error) {
      setSaveError(error);
    } else {
      setSaveName("");
      setSaveError(undefined);
      setSaving(false);
    }
  }

  return (
    <nav aria-label="Saved views" className="flex flex-wrap items-center gap-0.5">
      {views.map((view) => (
        <div key={view.id} className="relative flex items-center">
          <button
            type="button"
            onClick={() => onSelect(view.id)}
            aria-current={activeId === view.id ? "true" : undefined}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              activeId === view.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {view.name}
          </button>
          {view.custom && (
            <button
              type="button"
              onClick={() => onRemove(view.id)}
              aria-label={`Remove view ${view.name}`}
              className="ml-0.5 p-1 rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {canSave && (
        <div className="ml-auto flex items-center gap-2">
          {saving ? (
            <>
              <Field label="View name" error={saveError} className="gap-0">
                {(props) => (
                  <input
                    {...props}
                    ref={nameInputRef}
                    type="text"
                    maxLength={40}
                    value={saveName}
                    onChange={(e) => {
                      setSaveName(e.target.value);
                      setSaveError(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSave();
                      } else if (e.key === "Escape") {
                        setSaving(false);
                        setSaveName("");
                        setSaveError(undefined);
                      }
                    }}
                    className={cn(inputClass)}
                  />
                )}
              </Field>
              <button
                type="button"
                onClick={handleSave}
                className="px-2.5 py-1.5 text-sm font-medium rounded-lg border bg-primary text-primary-foreground hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaving(false);
                  setSaveName("");
                  setSaveError(undefined);
                }}
                className="px-2.5 py-1.5 text-sm rounded-lg border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSaving(true)}
              className="px-2.5 py-1.5 text-sm rounded-lg border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Save as view
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
