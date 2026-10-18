"use client";

import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";

export const PROFILE_SOURCE = "From your staff profile";

/**
 * A form input that is prefilled from stored data. Reference data (name,
 * employee number, department) is read-only when the source supplied a value,
 * so HR records stay consistent; a small hint names where it came from. When
 * the source has nothing, the field stays editable and shows no hint.
 */
export function PrefillInput({
  id,
  label,
  locked,
  onChange,
  source = PROFILE_SOURCE,
  value,
}: {
  id: string;
  label: string;
  /** True when the value came from stored data and must not be edited here. */
  locked: boolean;
  onChange: (value: string) => void;
  source?: string;
  value: string;
}) {
  const fromSource = locked && value !== "";
  return (
    <Field className="gap-1">
      <FieldLabel className="text-xs" htmlFor={id}>
        {label}
      </FieldLabel>
      <Input
        aria-describedby={fromSource ? `${id}-source` : undefined}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        readOnly={fromSource}
        value={value}
      />
      {fromSource ? (
        <p className="text-muted-foreground text-xs" id={`${id}-source`}>
          {source}
        </p>
      ) : null}
    </Field>
  );
}

/** Small hint under an editable field that was seeded from stored data. */
export function SourceHint({ children }: { children: string }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}

/**
 * The employee number from the staff record, shown locked. Form payloads do
 * not carry it (the printed form reads it from the record), so it is display
 * only. Renders nothing when HR has not recorded one.
 */
export function EmployeeNumberField({ value }: { value: string }) {
  if (!value) {
    return null;
  }
  return (
    <PrefillInput
      id="employee-number"
      label="Employee Number"
      locked
      onChange={() => undefined}
      value={value}
    />
  );
}
