"use client";
import Link from "next/link";
import { useActionState } from "react";
import { completeGoogle } from "./actions";
export function GoogleConfirm({ requiresTotp }: { requiresTotp: boolean }) {
  const [error, action, pending] = useActionState(completeGoogle, "");
  return (
    <form action={action} className="space-y-4">
      {requiresTotp && (
        <label className="block">
          Authenticator code
          <input
            autoComplete="one-time-code"
            className="block w-full rounded border border-border bg-background p-3"
            inputMode="numeric"
            maxLength={6}
            name="totp_code"
            pattern="[0-9]{6}"
            required
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="rounded border border-border p-3"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <Link className="block underline" href="/google/start">
        Start again
      </Link>
    </form>
  );
}
