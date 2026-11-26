"use client";

import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { useState } from "react";
import { holdOptions, holdValue } from "@/lib/deposit-hold";
import { SELECT, SettingsField } from "./settings-ui";

/**
 * How long an unpaid deposit by payment link or transfer holds the booking's
 * time. The select is named only when the person changes it, so saving the
 * deposit rule sends the hold only when it was changed; otherwise the stored
 * value stays as it is.
 */
export function DepositHoldField({ saved }: { saved: number | null }) {
  const stored = holdValue(saved);
  const [value, setValue] = useState(stored);
  return (
    <SettingsField
      hint="How long the time is kept for a customer to pay a deposit by payment link or bank transfer before the booking is released. Card payments online are kept at most 2 hours. This does not apply when customers pay you directly."
      id="deposit-hold"
      label="Hold a booking for its deposit"
    >
      {(describedBy) => (
        <NativeSelect
          aria-describedby={describedBy}
          className={`${SELECT} max-w-xs`}
          id="deposit-hold"
          name={value === stored ? undefined : "depositHoldMinutes"}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        >
          {holdOptions(saved).map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </SettingsField>
  );
}
