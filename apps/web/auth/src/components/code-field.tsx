"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@barrelsgd/ui/components/ui/input-otp";
import { useRef, useState } from "react";
import { inputClass, labelClass } from "@/components/form-styles";

interface CodeFieldProps {
  /** Offer "use a recovery code instead" (sign-in and account confirmation). */
  readonly allowRecovery?: boolean;
  readonly autoFocus?: boolean;
  readonly id: string;
  readonly label: string;
  readonly name: string;
  /**
   * Submit the surrounding form as soon as the sixth digit is in (typed, pasted
   * or filled in by the phone). Native validation still runs first.
   */
  readonly submitOnComplete?: boolean;
}

const DIGITS = /^\d+$/u;
const SEPARATORS = /[\s-]/gu;

/** A code copied as "574 554" or "574-554" pastes as six digits. */
function withoutSeparators(pasted: string): string {
  return pasted.replace(SEPARATORS, "");
}

export function CodeField({
  allowRecovery = false,
  autoFocus = false,
  id,
  label,
  name,
  submitOnComplete = false,
}: CodeFieldProps) {
  const [useRecovery, setUseRecovery] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);

  function submitForm() {
    fieldRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <div className="space-y-2" ref={fieldRef}>
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
          spellCheck={false}
        />
      ) : (
        <InputOTP
          autoComplete="one-time-code"
          autoFocus={autoFocus}
          id={id}
          inputMode="numeric"
          maxLength={6}
          name={name}
          onComplete={submitOnComplete ? submitForm : undefined}
          pasteTransformer={withoutSeparators}
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
          className="text-body-sm text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline md:min-h-0"
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
