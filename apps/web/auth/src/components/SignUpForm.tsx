"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/app/actions";
import { initialSignUpState } from "@/app/actions-types";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialSignUpState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div
          className="rounded-lg border border-border bg-muted px-5 py-4 text-sm leading-6"
          role="status"
        >
          <p className="font-medium text-foreground">Check your email</p>
          <p className="mt-1 text-muted-foreground">
            We sent a verification link to {state.email || "your inbox"}. After
            you verify, an administrator links your employee record and approves
            staff access.
          </p>
        </div>
        <Link className={secondaryButtonClass} href="/">
          Back to sign in
        </Link>
        <p className="text-center text-body-sm text-muted-foreground">
          No email?{" "}
          <Link className={textLinkClass} href="/verify-email">
            Send it again
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className={errorBoxClass} role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className={labelClass} htmlFor="first_name">
            First name
          </label>
          <input
            autoComplete="given-name"
            className={inputClass}
            id="first_name"
            maxLength={100}
            name="first_name"
            required
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass} htmlFor="last_name">
            Last name
          </label>
          <input
            autoComplete="family-name"
            className={inputClass}
            id="last_name"
            maxLength={100}
            name="last_name"
            required
            type="text"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className={labelClass} htmlFor="username">
          Username
        </label>
        <input
          autoCapitalize="none"
          autoComplete="username"
          className={inputClass}
          id="username"
          maxLength={255}
          minLength={3}
          name="username"
          placeholder="janesmith"
          required
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className={labelClass} htmlFor="email">
          Work email
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

      <PasswordField
        autoComplete="new-password"
        id="password"
        label="Password"
        name="password"
        placeholder="At least 12 characters"
        showStrength
      />

      <PasswordField
        autoComplete="new-password"
        id="confirm_password"
        label="Confirm password"
        name="confirm_password"
        placeholder="Repeat your password"
      />

      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-body-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className={textLinkClass} href="/">
          Sign in
        </Link>
      </p>
    </form>
  );
}
