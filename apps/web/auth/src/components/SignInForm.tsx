"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signInAction } from "@/app/actions";
import { initialSignInState } from "@/app/actions-types";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { OrDivider } from "@/components/or-divider";
import { PasswordField } from "@/components/password-field";
import {
  CreateAccountLink,
  GoogleSignInLink,
} from "@/components/sign-in-options";

interface SignInFormProps {
  appName: string | null;
  /** Where "Email me a code instead" goes (the code-first sign-in). */
  codeHref: Route;
  returnTo: string | null;
}

/** Password sign-in for staff who use one. The code-first form is the default. */
export function SignInForm({ appName, codeHref, returnTo }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialSignInState
  );
  // Controlled so the password survives the form reset React applies after
  // each action — the authenticator step resubmits it.
  const [password, setPassword] = useState("");
  const needsCode = state.next === "mfa";

  return (
    <div className="space-y-6">
      {needsCode ? null : (
        <>
          <GoogleSignInLink returnTo={returnTo} />
          <OrDivider />
        </>
      )}

      <form action={formAction} className="space-y-5">
        <input name="returnTo" type="hidden" value={returnTo ?? ""} />
        <input name="appName" type="hidden" value={appName ?? ""} />

        {state.error ? (
          <div className={errorBoxClass} role="alert">
            {state.error}
          </div>
        ) : null}

        {/* On the code step the credentials ride along hidden, so the page
            shows one question at a time. */}
        <div className={needsCode ? "hidden" : "space-y-5"}>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="email">
              Email address
            </label>
            <input
              autoCapitalize="none"
              autoComplete="username"
              className={inputClass}
              defaultValue={state.email}
              id="email"
              inputMode="email"
              name="email"
              placeholder="jane@example.com"
              required
              spellCheck={false}
              type="email"
            />
          </div>

          <PasswordField
            autoComplete="current-password"
            id="password"
            label="Password"
            labelAside={
              <Link
                className={`${textLinkClass} text-body-sm`}
                href="/forgot-password"
              >
                Forgot password?
              </Link>
            }
            name="password"
            onChange={setPassword}
            placeholder="Enter your password"
            value={password}
          />
        </div>

        {needsCode ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Two-step verification is on for{" "}
              <span className="text-foreground font-medium">{state.email}</span>
              . Enter the 6-digit code from your authenticator app.
            </p>
            <CodeField
              allowRecovery
              autoFocus
              id="totp_code"
              label="Authenticator code"
              name="totp_code"
            />
          </div>
        ) : null}

        <button className={primaryButtonClass} disabled={pending} type="submit">
          {pending && "Signing in…"}
          {!pending && (needsCode ? "Verify and sign in" : "Sign in")}
        </button>

        {needsCode ? (
          <p className="text-center">
            <a className={`${textLinkClass} text-body-sm`} href="/">
              Use a different account
            </a>
          </p>
        ) : (
          <p className="text-center">
            <Link className={`${textLinkClass} text-body-sm`} href={codeHref}>
              Email me a code instead
            </Link>
          </p>
        )}
      </form>

      {needsCode ? null : <CreateAccountLink returnTo={returnTo} />}
    </div>
  );
}
