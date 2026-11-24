"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { forgotPasswordAction } from "@/app/actions";
import { initialForgotPasswordState } from "@/app/actions-types";
import {
  errorBoxClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";

const ERROR_ID = "forgot-password-error";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialForgotPasswordState
  );
  const emailRef = useRef<HTMLInputElement>(null);

  // A refused request leaves the form on screen: put focus back in the email
  // field, where the error points, once the request has finished.
  useEffect(() => {
    if (state.error) {
      emailRef.current?.focus();
    }
  }, [state]);

  if (state.success) {
    return (
      <div className="space-y-5">
        <div
          className="border-border bg-muted rounded-lg border px-5 py-4 text-sm leading-6"
          role="status"
        >
          <p className="text-foreground font-medium">Check your email</p>
          <p className="text-muted-foreground mt-1">
            If <strong>{state.email}</strong> has a Barrels account, we have
            sent a link to reset its password. It can take a minute to arrive.
            Check your spam folder if it does not come.
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
          className="text-body-sm text-foreground block font-medium"
          htmlFor="email"
        >
          Email address
        </label>
        <input
          aria-describedby={state.error ? ERROR_ID : undefined}
          aria-invalid={state.error ? true : undefined}
          autoComplete="email"
          className={inputClass}
          defaultValue={state.email}
          id="email"
          name="email"
          placeholder="jane@example.com"
          ref={emailRef}
          required
          type="email"
        />
      </div>

      {state.error ? (
        <div className={errorBoxClass} id={ERROR_ID} role="alert">
          {state.error}
        </div>
      ) : null}

      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-body-sm text-muted-foreground text-center">
        Remembered it?{" "}
        <Link className={textLinkClass} href="/">
          Sign in
        </Link>
      </p>
    </form>
  );
}
