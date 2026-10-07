"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  noticeBoxClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { activateAccount } from "./actions";

export function ActivationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [state, action, pending] = useActionState(activateAccount, {
    message: "",
    done: false,
  });
  const readFragment = useRef(false);
  useEffect(() => {
    if (readFragment.current) return;
    readFragment.current = true;
    const secret =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(secret);
    // Keep the secret out of requests, referrers, browser history and later screenshots.
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  if (token === null) return <p>Opening your activation link…</p>;
  if (!token)
    return (
      <p role="alert">
        Open the complete activation link your administrator gave you. If it
        expired, ask for a new one.
      </p>
    );
  return (
    <form action={action} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      {state.message ? (
        <p className={noticeBoxClass} role="status">
          {state.message}
        </p>
      ) : null}
      {state.done ? null : (
        <>
          <PasswordField
            autoComplete="new-password"
            id="password"
            label="Your password"
            name="password"
            placeholder="At least 12 characters"
            showStrength
          />
          <PasswordField
            autoComplete="new-password"
            id="confirm"
            label="Confirm password"
            name="confirm"
          />
          <button
            className={primaryButtonClass}
            disabled={pending}
            type="submit"
          >
            {pending ? "Activating…" : "Activate account"}
          </button>
        </>
      )}
      <Link className={textLinkClass} href="/">
        {state.done ? "Sign in" : "Back to sign in"}
      </Link>
    </form>
  );
}
