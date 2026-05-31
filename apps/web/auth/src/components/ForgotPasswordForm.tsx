"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/app/actions";
import { initialForgotPasswordState } from "@/app/actions-types";

const inputClass =
  "w-full rounded-gm-8 border border-(--line) bg-white/80 px-4 py-3 text-foreground text-gm-body outline-none transition placeholder:text-(--muted) focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialForgotPasswordState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 text-sm leading-6">
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-(--muted) text-gm-body-sm">
            If <strong>{state.email}</strong> is registered, a password-reset
            link has been sent. It may take a minute to arrive.
          </p>
        </div>
        <Link
          className="block text-center text-(--auth-accent) text-sm underline-offset-4 hover:underline"
          href="/"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label
          className="block font-medium text-foreground text-gm-body-sm"
          htmlFor="email"
        >
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
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-(--muted) text-gm-body-sm">
        Remembered it?{" "}
        <Link
          className="text-(--auth-accent) underline-offset-4 hover:underline"
          href="/"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
