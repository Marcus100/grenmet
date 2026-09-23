"use client";
import Link from "next/link";
import { useActionState } from "react";
import {
  inputClass,
  labelClass,
  noticeBoxClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { verifyEmail } from "./actions";

export function VerifyEmail({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmail, {
    message: "",
    done: false,
  });
  return (
    <form action={action} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      {state.message && (
        <div className={noticeBoxClass} role="status">
          {state.message}
        </div>
      )}
      {token ? (
        <>
          <PasswordField
            autoComplete="new-password"
            id="password"
            label="New password"
            name="password"
            placeholder="At least 12 characters"
            showStrength
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm"
            label="Confirm password"
            name="confirm"
            placeholder="Repeat your password"
          />
        </>
      ) : (
        <div className="space-y-2">
          <label className={labelClass} htmlFor="email">
            Email address
          </label>
          <input
            autoComplete="email"
            className={inputClass}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      )}
      <button
        className={primaryButtonClass}
        disabled={pending || state.done}
        type="submit"
      >
        {pending && "Please wait…"}
        {!pending && token && "Verify and set password"}
        {!(pending || token) && "Send verification link"}
      </button>
      <Link
        className={`${textLinkClass} block text-center text-body-sm`}
        href="/"
      >
        Back to sign in
      </Link>
    </form>
  );
}
