"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/app/actions";
import { initialResetPasswordState } from "@/app/actions-types";

const inputClass =
  "w-full rounded-[1.1rem] border border-(--line) bg-white/80 px-4 py-3 text-[15px] text-foreground outline-none transition placeholder:text-(--muted) focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(
    resetPasswordAction,
    initialResetPasswordState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 text-sm leading-6">
          <p className="font-medium">Password updated</p>
          <p className="mt-1 text-(--muted) text-[13px]">
            Your password has been changed. Sign in with your new password.
          </p>
        </div>
        <Link
          className="block w-full rounded-full bg-(--auth-accent) px-5 py-3 text-center font-medium text-sm text-white transition hover:bg-(--auth-accent-strong)"
          href="/"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input name="token" type="hidden" value={token} />

      <div className="space-y-2">
        <label
          className="block font-medium text-[13px] text-foreground"
          htmlFor="new_password"
        >
          New password
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="new_password"
          maxLength={40}
          minLength={8}
          name="new_password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </div>

      <div className="space-y-2">
        <label
          className="block font-medium text-[13px] text-foreground"
          htmlFor="confirm_password"
        >
          Confirm new password
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="confirm_password"
          maxLength={40}
          minLength={8}
          name="confirm_password"
          placeholder="Repeat your new password"
          required
          type="password"
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
        {pending ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
