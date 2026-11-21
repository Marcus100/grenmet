"use client";

import type { ChoiceOption } from "@/lib/org-orders";

/**
 * A radio group where every option says what it does; the words stay visible
 * on phone and desktop. Used for who asked for a cancel and what happens to the
 * money.
 */
export function RefundChoiceGroup<T extends string>({
  disabledValues = [],
  legend,
  name,
  onChange,
  options,
  value,
}: {
  disabledValues?: readonly T[];
  legend: string;
  name: string;
  onChange: (value: T) => void;
  options: readonly ChoiceOption<T>[];
  value: T;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-body font-medium">{legend}</legend>
      {options.map((option) => {
        const disabled = disabledValues.includes(option.value);
        return (
          <label
            className="bg-card has-[:checked]:border-primary flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2 has-[:disabled]:opacity-60"
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="accent-primary mt-1 size-5"
              disabled={disabled}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>
              <span className="text-body block font-medium">
                {option.label}
              </span>
              <span className="text-caption text-muted-foreground block">
                {option.description}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
