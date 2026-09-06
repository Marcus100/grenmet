"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "@/app/actions";
import { initialSignInState } from "@/app/actions-types";

interface SignInFormProps {
  appName: string | null;
  returnTo: string | null;
}

export function SignInForm({ appName, returnTo }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialSignInState
  );

  return (
    <form action={formAction} className="space-y-5">
      <input name="returnTo" type="hidden" value={returnTo ?? ""} />
      <input name="appName" type="hidden" value={appName ?? ""} />

      <div className="space-y-2">
        <label
          className="block font-medium text-body-sm text-foreground"
          htmlFor="email"
        >
          Email address
        </label>
        <input
          autoComplete="username"
          className="w-full rounded-lg border border-(--line) bg-white/80 px-4 py-3 text-body text-foreground outline-none transition placeholder:text-(--muted) focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4"
          defaultValue={state.email}
          id="email"
          name="email"
          placeholder="jane@example.com"
          required
          type="email"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            className="block font-medium text-body-sm text-foreground"
            htmlFor="password"
          >
            Password
          </label>
          <Link
            className="text-(--auth-accent) text-body-sm underline-offset-4 hover:underline"
            href="/forgot-password"
            tabIndex={-1}
          >
            Forgot password?
          </Link>
        </div>
        <input
          autoComplete="current-password"
          className="w-full rounded-lg border border-(--line) bg-white/80 px-4 py-3 text-body text-foreground outline-none transition placeholder:text-(--muted) focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4"
          id="password"
          name="password"
          placeholder="Enter your password"
          required
          type="password"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="totp_code">Authenticator code (if enabled)</label>
        <input
          autoComplete="one-time-code"
          className="w-full rounded-lg border border-border bg-background px-4 py-3"
          id="totp_code"
          inputMode="numeric"
          maxLength={6}
          name="totp_code"
        />
      </div>
      <Link
        className="block rounded-lg border border-border p-3 text-center"
        href="/google/start"
      >
        Continue with Google
      </Link>
      <Link className="block text-center underline" href="/verify-email">
        Verify email or finish account setup
      </Link>
      {state.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          {state.error}
        </div>
      ) : null}

      <button
        className="w-full rounded-full bg-(--auth-accent) px-5 py-3 font-medium text-sm text-white transition hover:bg-(--auth-accent-strong) disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-muted-foreground text-sm">
        Staff access is arranged by your administrator.
      </p>
    </form>
  );
}
