"use client";

import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import type { Route } from "next";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { env } from "@/lib/env";
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
 * "Use a different email" remounts the step, so it starts from an empty form,
 * and focus moves to the email field.
 *
 * With a Turnstile site key configured, every code request (the first and each
 * "Send a new code") carries a fresh single-use token, and its button waits for
 * the check (issue #959). Without one there is no widget and no token.
 */
export function EmailCodeForm(props: EmailCodeFormProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <EmailCodeStep
      focusEmail={attempt > 0}
      key={attempt}
      onChangeEmail={() => setAttempt((count) => count + 1)}
      {...props}
    />
  );
}

interface EmailCodeStepProps extends EmailCodeFormProps {
  /** True after "Use a different email": move focus to the email field on mount. */
  readonly focusEmail: boolean;
  readonly onChangeEmail: () => void;
}

function EmailCodeStep({
  focusEmail,
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
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const resendRequested = useRef(false);
  const [notice, setNotice] = useState("");
  const check = useTurnstileCheck();

  useEffect(() => {
    if (focusEmail) emailRef.current?.focus();
  }, [focusEmail]);

  // A resend has finished: say so politely and move focus to the code field.
  // A refused resend keeps its error and leaves focus where it was.
  useEffect(() => {
    if (pending || !resendRequested.current) return;
    resendRequested.current = false;
    if (state.error || state.step === "email") return;
    setNotice("New code sent. Check your email.");
    codeRef.current?.querySelector("input")?.focus();
  }, [pending, state.error, state.step]);

  // React resets an uncontrolled form after its action settles, which would
  // wipe the typed email on a refusal. Passing FormData keeps the values.
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!sent) check.attachToken(data);
    startTransition(() => {
      formAction(data);
    });
  }

  // A new code for the same address: the email only, so the action sends one.
  function resendCode() {
    const data = new FormData();
    data.set("email", state.email);
    data.set("returnTo", returnTo ?? "");
    check.attachToken(data);
    resendRequested.current = true;
    setNotice("");
    startTransition(() => {
      formAction(data);
    });
  }

  const canResend = hydrated && !pending && secondsLeft === 0 && !check.waiting;
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
          <div ref={codeRef}>
            <CodeField autoFocus id="code" label="Email code" name="code" />
          </div>
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
            ref={emailRef}
            required
            spellCheck={false}
            type="email"
          />
        </div>
      )}

      <Turnstile {...check.widget} />

      <button
        className={primaryButtonClass}
        disabled={pending || !hydrated || (!sent && check.waiting)}
        type="submit"
      >
        {pending ? "Please wait…" : submitLabel}
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
          <p
            aria-live="polite"
            className="text-body-sm text-muted-foreground text-center"
            role="status"
          >
            {notice}
          </p>
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
 * The Turnstile check for code requests (issue #959). Without a site key it is
 * inert: no widget, never waiting, no token. A token is single-use, so each
 * request that carries one asks the widget for the next.
 */
function useTurnstileCheck() {
  const siteKey = env.NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  return {
    attachToken(data: FormData) {
      if (!(siteKey && token)) return;
      data.set("turnstile_token", token);
      setResetKey((count) => count + 1);
    },
    waiting: Boolean(siteKey) && !token,
    widget: { onToken: setToken, resetKey, siteKey },
  };
}

/**
 * Seconds left before "Send a new code" is offered. The timer starts when the
 * server reports a code was sent (`resendAfterSeconds`), not when a request
 * begins, because the server's own cooldown starts on its receipt. Each send
 * that finishes restarts it.
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
