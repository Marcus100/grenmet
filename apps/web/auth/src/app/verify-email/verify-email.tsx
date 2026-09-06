"use client";
import Link from "next/link";
import { useActionState } from "react";
import { verifyEmail } from "./actions";
export function VerifyEmail({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmail, {
    message: "",
    done: false,
  });
  return (
    <form action={action} className="space-y-4">
      <input name="token" type="hidden" value={token} />
      {token ? (
        <>
          <label className="block">
            New password
            <input
              autoComplete="new-password"
              className="block w-full rounded border border-border bg-background p-3"
              maxLength={128}
              minLength={12}
              name="password"
              required
              type="password"
            />
          </label>
          <label className="block">
            Confirm password
            <input
              autoComplete="new-password"
              className="block w-full rounded border border-border bg-background p-3"
              name="confirm"
              required
              type="password"
            />
          </label>
        </>
      ) : (
        <label className="block">
          Email address
          <input
            autoComplete="email"
            className="block w-full rounded border border-border bg-background p-3"
            name="email"
            required
            type="email"
          />
        </label>
      )}
      {state.message && <p role="status">{state.message}</p>}
      <button
        className="rounded border border-border p-3"
        disabled={pending || state.done}
        type="submit"
      >
        {pending && "Please wait…"}
        {!pending && token && "Verify and set password"}
        {!(pending || token) && "Send verification link"}
      </button>
      <Link className="block underline" href="/">
        Back to sign in
      </Link>
    </form>
  );
}
