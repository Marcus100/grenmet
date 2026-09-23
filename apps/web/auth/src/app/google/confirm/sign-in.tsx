"use client";
import Link from "next/link";
import { useActionState } from "react";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { completeGoogle } from "./actions";

export function GoogleConfirm({ requiresTotp }: { requiresTotp: boolean }) {
  const [error, action, pending] = useActionState(completeGoogle, "");
  return (
    <form action={action} className="space-y-5">
      {error && (
        <div className={errorBoxClass} role="alert">
          {error}
        </div>
      )}
      {requiresTotp && (
        <CodeField
          allowRecovery
          autoFocus
          id="totp_code"
          label="Authenticator code"
          name="totp_code"
        />
      )}
      <button className={primaryButtonClass} disabled={pending} type="submit">
        {pending ? "Signing in…" : "Continue"}
      </button>
      <Link
        className={`${textLinkClass} block text-center text-body-sm`}
        href="/google/start"
      >
        Start again
      </Link>
    </form>
  );
}
