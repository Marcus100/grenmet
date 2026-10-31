"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import { initialNamePromptState, saveNameAction } from "@/app/actions";
import {
  errorBoxClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Optional name, asked once after sign-in. Sign-up never asks for it. Submits
 * through onSubmit and waits for hydration; typed values survive a refusal.
 */
export function NamePrompt() {
  const [state, formAction, pending] = useActionState(
    saveNameAction,
    initialNamePromptState
  );
  const hydrated = useHydrated();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      formAction(data);
    });
  }

  if (state.saved) return null;

  return (
    <section
      aria-labelledby="name-prompt-heading"
      className="space-y-3 rounded-lg border border-border bg-muted p-4"
    >
      <h2
        className="font-medium text-foreground text-sm"
        id="name-prompt-heading"
      >
        Add your name (optional)
      </h2>
      <p className="text-muted-foreground text-sm">
        It helps staff recognise you. You can skip this.
      </p>
      <form className="space-y-3" onSubmit={submit}>
        {state.error ? (
          <div className={errorBoxClass} role="alert">
            {state.error}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className={labelClass} htmlFor="name-first">
              First name
            </label>
            <input
              autoComplete="given-name"
              className={inputClass}
              defaultValue=""
              id="name-first"
              maxLength={100}
              name="first_name"
              type="text"
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass} htmlFor="name-last">
              Last name
            </label>
            <input
              autoComplete="family-name"
              className={inputClass}
              defaultValue=""
              id="name-last"
              maxLength={100}
              name="last_name"
              type="text"
            />
          </div>
        </div>
        <button
          className={primaryButtonClass}
          disabled={pending || !hydrated}
          type="submit"
        >
          {pending ? "Saving…" : "Save name"}
        </button>
      </form>
    </section>
  );
}

/** Non-blocking reminder. Signing in with a code already confirms the email. */
export function VerifyBanner() {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-foreground text-sm"
      role="status"
    >
      <span>Confirm your email address to keep your account secure.</span>
      <Link className={textLinkClass} href="/verify-email">
        Send a confirmation link
      </Link>
    </div>
  );
}
