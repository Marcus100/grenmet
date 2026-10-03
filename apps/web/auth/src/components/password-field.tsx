"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { inputClass, labelClass } from "@/components/form-styles";
import { MIN_PASSWORD_LENGTH, scorePassword } from "@/lib/password-strength";

interface PasswordFieldProps {
  readonly autoComplete: "current-password" | "new-password";
  readonly id: string;
  readonly label: string;
  /** Extra content beside the label, e.g. a "Forgot password?" link. */
  readonly labelAside?: ReactNode;
  readonly name: string;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  /** Show the strength meter; only meaningful for a new password. */
  readonly showStrength?: boolean;
  readonly value?: string;
}

const METER_TONES = [
  "bg-destructive",
  "bg-destructive",
  "bg-gm-risk-amber",
  "bg-gm-sky-ink",
  "bg-gm-risk-green",
] as const;

export function PasswordField({
  autoComplete,
  id,
  label,
  labelAside,
  name,
  onChange,
  placeholder,
  readOnly,
  showStrength = false,
  value,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const [internal, setInternal] = useState("");
  const current = value ?? internal;
  const strength = scorePassword(current);
  const isNew = autoComplete === "new-password";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          aria-describedby={showStrength ? `${id}-strength` : undefined}
          autoComplete={autoComplete}
          className={cn(inputClass, "pr-12")}
          id={id}
          maxLength={128}
          minLength={isNew ? MIN_PASSWORD_LENGTH : undefined}
          name={name}
          onChange={(event) => {
            setInternal(event.target.value);
            onChange?.(event.target.value);
          }}
          placeholder={placeholder}
          readOnly={readOnly}
          required
          type={visible ? "text" : "password"}
          value={current}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition hover:text-foreground"
          onClick={() => setVisible((shown) => !shown)}
          type="button"
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" className="size-4" />
          ) : (
            <EyeIcon aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {showStrength && current ? (
        <div className="space-y-1" id={`${id}-strength`}>
          <div aria-hidden="true" className="grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((step) => (
              <span
                className={cn(
                  "h-1 rounded-full",
                  strength.score >= step
                    ? METER_TONES[strength.score]
                    : "bg-muted"
                )}
                key={step}
              />
            ))}
          </div>
          <p className="text-body-sm text-muted-foreground">
            {strength.score === 0
              ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
              : `Strength: ${strength.label}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
