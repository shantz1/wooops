"use client";

import { useId, type ReactNode } from "react";
import { cn } from "cn";

export const inputClass = "h-11 w-full rounded-none border-0 border-b-2 border-input bg-transparent px-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary aria-[invalid=true]:border-destructive disabled:opacity-50";

interface FieldProps {
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => ReactNode;
  className?: string;
}

export function Field({
  label,
  help,
  error,
  optional,
  children,
  className,
}: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const hasError = !!error;

  const childProps = {
    id,
    "aria-describedby": help || error ? (error ? errorId : helpId) : undefined,
    "aria-invalid": hasError || undefined,
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {optional && <span className="ml-1 text-muted-foreground">(optional)</span>}
      </label>
      {children(childProps)}
      {error ? (
        <div id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </div>
      ) : help ? (
        <div id={helpId} className="text-xs text-muted-foreground">
          {help}
        </div>
      ) : null}
    </div>
  );
}

interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "children"> {
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
}

export function TextField({
  label,
  help,
  error,
  optional,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field label={label} help={help} error={error} optional={optional}>
      {(props) => (
        <input
          {...props}
          {...inputProps}
          className={cn(inputClass, className)}
        />
      )}
    </Field>
  );
}

interface TextAreaFieldProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> {
  label: string;
  help?: string;
  error?: string;
  optional?: boolean;
}

export function TextAreaField({
  label,
  help,
  error,
  optional,
  className,
  rows = 4,
  ...textareaProps
}: TextAreaFieldProps) {
  return (
    <Field label={label} help={help} error={error} optional={optional}>
      {(props) => (
        <textarea
          {...props}
          {...textareaProps}
          rows={rows}
          className={cn(
            inputClass,
            "h-auto py-2 min-h-24 resize-y",
            className
          )}
        />
      )}
    </Field>
  );
}
