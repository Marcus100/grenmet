"use client";

import type { RefundChoice } from "@/lib/org-orders";

export interface RefundChoiceOption {
  readonly description: string;
  readonly label: string;
  readonly value: RefundChoice;
}

/**
 * Which refund a cancel does. Every option says what it does with the money;
 * the choice is a radio group so the words stay visible on phone and desktop.
 */
export function RefundChoiceGroup({
  disabledValues = [],
  legend,
  name,
  onChange,
  options,
  value,
}: {
  disabledValues?: readonly RefundChoice[];
  legend: string;
  name: string;
  onChange: (value: RefundChoice) => void;
  options: readonly RefundChoiceOption[];
  value: RefundChoice;
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
