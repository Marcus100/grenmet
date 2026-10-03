"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@barrelsgd/ui/components/ui/input-otp";
import { useState } from "react";
import { inputClass, labelClass } from "@/components/form-styles";

interface CodeFieldProps {
  /** Offer "use a recovery code instead" (sign-in and account confirmation). */
  readonly allowRecovery?: boolean;
  readonly autoFocus?: boolean;
  readonly id: string;
  readonly label: string;
  readonly name: string;
}

const DIGITS = /^\d+$/;

export function CodeField({
  allowRecovery = false,
  autoFocus = false,
  id,
  label,
  name,
}: CodeFieldProps) {
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor={id}>
        {useRecovery ? "Recovery code" : label}
      </label>
      {useRecovery ? (
        <input
          autoComplete="off"
          autoFocus
          className={inputClass}
          id={id}
          maxLength={64}
          name={name}
          required
        />
      ) : (
        <InputOTP
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          id={id}
          maxLength={6}
          name={name}
          pattern={DIGITS.source}
          required
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot
                className="size-11 text-base"
                index={index}
                key={index}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      )}
      {allowRecovery ? (
        <button
          className="font-medium text-(--auth-accent) text-body-sm underline-offset-4 hover:underline"
          onClick={() => setUseRecovery((recovery) => !recovery)}
          type="button"
        >
          {useRecovery
            ? "Use your authenticator app instead"
            : "Use a recovery code instead"}
        </button>
      ) : null}
    </div>
  );
}
