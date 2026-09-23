"use client";

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
  secondaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { OrDivider } from "@/components/or-divider";
import { PasswordField } from "@/components/password-field";

interface SignInFormProps {
  appName: string | null;
  returnTo: string | null;
}

export function SignInForm({ appName, returnTo }: SignInFormProps) {
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
          <Link className={secondaryButtonClass} href="/google/start">
            Continue with Google
          </Link>
          <OrDivider />
        </>
      )}

      <form action={formAction} className="space-y-5">
        <input name="returnTo" type="hidden" value={returnTo ?? ""} />
        <input name="appName" type="hidden" value={appName ?? ""} />

        {state.error ? (
          <div className={errorBoxClass} role="alert">
            {state.error}
            {state.next === "verify" ? (
              <Link
                className="mt-1 block font-medium underline underline-offset-4"
                href="/verify-email"
              >
                Verify your email
              </Link>
            ) : null}
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
              autoComplete="username"
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
              <span className="font-medium text-foreground">{state.email}</span>
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
          <a
            className={`${textLinkClass} block text-center text-body-sm`}
            href="/"
          >
            Use a different account
          </a>
        ) : null}
      </form>

      <p className="text-center text-body-sm text-muted-foreground">
        New here?{" "}
        <Link className={textLinkClass} href="/signup">
          Create an account
        </Link>
      </p>
    </div>
  );
}
