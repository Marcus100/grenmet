"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
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
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Passwordless sign-in and sign-up: one email, then the 6-digit code. The same
 * code creates the account on first use. Submits through onSubmit and waits for
 * hydration, so the email never travels in a URL.
 */
export function EmailCodeForm({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(
    emailCodeAction,
    initialEmailCodeState
  );
  const hydrated = useHydrated();
  const sent = state.step !== "email";

  // React resets an uncontrolled form after its action settles, which would
  // wipe the typed email on a refusal. Passing FormData keeps the values.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
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
            autoCapitalize="none"
            autoComplete="email"
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
      )}

      <button
        className={primaryButtonClass}
        disabled={pending || !hydrated}
        type="submit"
      >
        {pending && "Please wait…"}
        {!pending && (sent ? "Sign in" : "Email me a code")}
      </button>

      <p className="text-center text-body-sm text-muted-foreground">
        New here? The same code creates your account.{" "}
        <Link
          className={textLinkClass}
          href={returnTo ? `/?returnTo=${encodeURIComponent(returnTo)}` : "/"}
        >
          Sign in with a password instead
        </Link>
      </p>
    </form>
  );
}
