"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions";
import { initialForgotPasswordState } from "@/app/actions-types";
import {
  errorBoxClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialForgotPasswordState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div
          className="rounded-lg border border-border bg-muted px-5 py-4 text-sm leading-6"
          role="status"
        >
          <p className="font-medium text-foreground">Check your inbox</p>
          <p className="mt-1 text-muted-foreground">
            If <strong>{state.email}</strong> is registered, a password-reset
            link has been sent. It may take a minute to arrive.
          </p>
        </div>
        <Link className={secondaryButtonClass} href="/">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          className="block font-medium text-body-sm text-foreground"
          htmlFor="email"
        >
          Email address
        </label>
        <input
          autoComplete="email"
          className={inputClass}
          defaultValue={state.email}
          id="email"
          name="email"
          placeholder="jane@example.com"
          required
          type="email"
        />
      </div>

      {state.error ? (
        <div className={errorBoxClass} role="alert">
          {state.error}
        </div>
      ) : null}

      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-body-sm text-muted-foreground">
        Remembered it?{" "}
        <Link className={textLinkClass} href="/">
          Sign in
        </Link>
      </p>
    </form>
  );
}
