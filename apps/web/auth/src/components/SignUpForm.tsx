"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction } from "@/app/actions";
import { initialSignUpState } from "@/app/actions-types";

const inputClass =
  "w-full rounded-gm-8 border border-(--line) bg-white/80 px-4 py-3 text-foreground text-gm-body outline-none transition placeholder:text-(--muted) focus:border-(--auth-accent) focus:ring-(--auth-accent-soft) focus:ring-4";

const labelClass = "block font-medium text-foreground text-gm-body-sm";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialSignUpState
  );

  if (state.success) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-green-800 text-sm leading-6">
          <p className="font-medium">Account created</p>
          <p className="mt-1 text-(--muted) text-gm-body-sm">
            Welcome aboard. Sign in to get started.
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
    <form action={formAction} className="space-y-4">
      {/* Name row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className={labelClass} htmlFor="first_name">
            First name
          </label>
          <input
            autoComplete="given-name"
            className={inputClass}
            id="first_name"
            maxLength={100}
            name="first_name"
            placeholder="Jane"
            required
            type="text"
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass} htmlFor="last_name">
            Last name
          </label>
          <input
            autoComplete="family-name"
            className={inputClass}
            id="last_name"
            maxLength={100}
            name="last_name"
            placeholder="Smith"
            required
            type="text"
          />
        </div>
      </div>

      {/* Middle name (optional) */}
      <div className="space-y-2">
        <label className={labelClass} htmlFor="middle_name">
          Middle name{" "}
          <span className="font-normal text-(--muted)">(optional)</span>
        </label>
        <input
          autoComplete="additional-name"
          className={inputClass}
          id="middle_name"
          maxLength={100}
          name="middle_name"
          placeholder="M."
          type="text"
        />
      </div>

      {/* Username */}
      <div className="space-y-2">
        <label className={labelClass} htmlFor="username">
          Username
        </label>
        <input
          autoComplete="username"
          className={inputClass}
          id="username"
          maxLength={255}
          minLength={3}
          name="username"
          placeholder="janesmith"
          required
          type="text"
        />
      </div>

      {/* Email */}
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

      {/* Password */}
      <div className="space-y-2">
        <label className={labelClass} htmlFor="password">
          Password
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="password"
          maxLength={40}
          minLength={8}
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </div>

      {/* Confirm password */}
      <div className="space-y-2">
        <label className={labelClass} htmlFor="confirm_password">
          Confirm password
        </label>
        <input
          autoComplete="new-password"
          className={inputClass}
          id="confirm_password"
          maxLength={40}
          minLength={8}
          name="confirm_password"
          placeholder="Repeat your password"
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
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-(--muted) text-gm-body-sm">
        Already have an account?{" "}
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
