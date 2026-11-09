"use client";

import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useId } from "react";

/** One labelled text field in the profile editor. */
export function ProfileField({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          aria-describedby={hint ? hintId : undefined}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <Input
          aria-describedby={hint ? hintId : undefined}
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          value={value}
        />
      )}
      {hint ? (
        <p className="text-muted-foreground text-caption" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
