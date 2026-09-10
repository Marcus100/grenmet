"use client";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useId } from "react";

export function ProfileField({
  label,
  value,
  onChange,
  multiline = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          onChange={(e) => onChange(e.target.value)}
          value={value}
        />
      ) : (
        <Input
          id={id}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          value={value}
        />
      )}
    </div>
  );
}
