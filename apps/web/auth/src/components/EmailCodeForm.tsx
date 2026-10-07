"use client";

import Link from "next/link";
import { useActionState } from "react";
import { initialEmailCodeState } from "@/app/actions-types";
import { emailCodeAction } from "@/app/code/actions";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";

export function EmailCodeForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(
    emailCodeAction,
    initialEmailCodeState
  );
  const sent = state.step !== "email";

  return (
    <form action={formAction} className="space-y-5">
      <input name="returnTo" type="hidden" value={returnTo ?? ""} />
      {state.error ? (
        <div className={errorBoxClass} role="alert">
          {state.error}
        </div>
      ) : null}

      {sent ? (
        <>
          <input name="email" type="hidden" value={state.email} />
          <p className="text-muted-foreground text-sm" role="status">
            If{" "}
            <span className="font-medium text-foreground">{state.email}</span>{" "}
            can sign in, we've sent it a 6-digit code. It expires in 10 minutes.
          </p>
          <CodeField autoFocus id="code" label="Email code" name="code" />
          {state.step === "mfa" ? (
            <CodeField
              allowRecovery
              id="totp_code"
              label="Authenticator code"
              name="totp_code"
            />
          ) : null}
        </>
      ) : (
        <div className="space-y-2">
          <label className={labelClass} htmlFor="email">
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
      )}

      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending && "Please wait…"}
        {!pending && (sent ? "Sign in" : "Email me a code")}
      </button>

      <p className="text-center text-body-sm text-muted-foreground">
        New here? The same code creates your account.{" "}
        <Link className={textLinkClass} href="/">
          Use a password instead
        </Link>
      </p>
    </form>
  );
}
