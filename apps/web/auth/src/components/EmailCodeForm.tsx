"use client";

import type { Route } from "next";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { initialEmailCodeState } from "@/app/actions-types";
import { emailCodeAction } from "@/app/code/actions";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { useHydrated } from "@/lib/use-hydrated";

interface EmailCodeFormProps {
  /** Where "Use password instead" goes. Null hides the link (sign-up has no password). */
  readonly passwordHref?: Route | null;
  /** Sign-up names its final button for what it does. */
  readonly purpose?: "sign-in" | "sign-up";
  readonly returnTo: string | null;
}

/**
 * Passwordless sign-in and sign-up: one email, then the 6-digit code. The same
 * code creates the account on first use. Submits through onSubmit and waits for
 * hydration, so the email never travels in a URL.
 *
 * "Use a different email" remounts the step, so it starts from an empty form.
 */
export function EmailCodeForm(props: EmailCodeFormProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <EmailCodeStep
      key={attempt}
      onChangeEmail={() => setAttempt((count) => count + 1)}
      {...props}
    />
  );
}

interface EmailCodeStepProps extends EmailCodeFormProps {
  readonly onChangeEmail: () => void;
}

function EmailCodeStep({
  onChangeEmail,
  passwordHref = null,
  purpose = "sign-in",
  returnTo,
}: EmailCodeStepProps) {
  const [state, formAction, pending] = useActionState(
    emailCodeAction,
    initialEmailCodeState
  );
  const hydrated = useHydrated();
  const sent = state.step !== "email";
  const secondsLeft = useResendCountdown(state.resendAfterSeconds, pending);

  // React resets an uncontrolled form after its action settles, which would
  // wipe the typed email on a refusal. Passing FormData keeps the values.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  // A new code for the same address: the email only, so the action sends one.
  function resendCode() {
    const data = new FormData();
    data.set("email", state.email);
    data.set("returnTo", returnTo ?? "");
    startTransition(() => {
      formAction(data);
    });
  }

  const canResend = hydrated && !pending && secondsLeft === 0;
  let submitLabel = "Email me a code";
  if (sent) submitLabel = purpose === "sign-up" ? "Create account" : "Sign in";

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
            <span className="text-foreground font-medium">{state.email}</span>{" "}
            can sign in, we’ve sent it a 6-digit code. It expires in 10 minutes.
            Check your spam or junk folder if it does not arrive.
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
        {pending ? null : submitLabel}
      </button>

      {sent ? (
        <div className="space-y-3">
          <button
            className={secondaryButtonClass}
            disabled={!canResend}
            onClick={resendCode}
            type="button"
          >
            {secondsLeft > 0
              ? `Send a new code in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}`
              : "Send a new code"}
          </button>
          <p className="text-center">
            <button
              className={`${textLinkClass} text-body-sm`}
              disabled={pending}
              onClick={onChangeEmail}
              type="button"
            >
              Use a different email
            </button>
          </p>
        </div>
      ) : null}

      {!sent && passwordHref ? (
        <p className="text-center">
          <Link className={`${textLinkClass} text-body-sm`} href={passwordHref}>
            Use password instead
          </Link>
        </p>
      ) : null}
    </form>
  );
}

/**
 * Seconds left before "Send a new code" is offered. The timer starts when the
 * server reports a code was sent (`resendAfterSeconds`), not when a request
 * begins, because the server's own cooldown starts on its receipt.
 */
function useResendCountdown(
  resendAfterSeconds: number | undefined,
  pending: boolean
): number {
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!resendAfterSeconds || pending) return;
    const start = Date.now();
    setNow(start);
    setReadyAt(start + resendAfterSeconds * 1000);
  }, [pending, resendAfterSeconds]);

  useEffect(() => {
    if (readyAt === null) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [readyAt]);

  if (readyAt === null) return 0;
  return Math.max(0, Math.ceil((readyAt - now) / 1000));
}
