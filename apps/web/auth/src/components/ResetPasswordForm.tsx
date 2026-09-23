"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/app/actions";
import { initialResetPasswordState } from "@/app/actions-types";
import { errorBoxClass, primaryButtonClass } from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialResetPasswordState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div
          className="rounded-lg border border-border bg-muted px-5 py-4 text-sm leading-6"
          role="status"
        >
          <p className="font-medium text-foreground">Password updated</p>
          <p className="mt-1 text-muted-foreground">
            Sign in with your new password.
          </p>
        </div>
        <Link className={`${primaryButtonClass} block`} href="/">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />

      {state.error ? (
        <div className={errorBoxClass} role="alert">
          {state.error}
        </div>
      ) : null}

      <PasswordField
        autoComplete="new-password"
        id="new_password"
        label="New password"
        name="new_password"
        placeholder="At least 12 characters"
        showStrength
      />

      <PasswordField
        autoComplete="new-password"
        id="confirm_password"
        label="Confirm new password"
        name="confirm_password"
        placeholder="Repeat your new password"
      />

      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
