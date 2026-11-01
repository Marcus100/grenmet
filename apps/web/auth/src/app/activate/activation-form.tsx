"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AuthHeading } from "@/components/auth-shell";
import {
  noticeBoxClass,
  primaryButtonClass,
  textLinkClass,
} from "@/components/form-styles";
import { PasswordField } from "@/components/password-field";
import { activateAccount } from "./actions";

// The link's fragment says which flow issued it. Staff activation keeps its own wording.
type LinkPurpose = "staff-activation" | "sign-in-setup";

const COPY: Record<
  LinkPurpose,
  { intro: string; button: string; busy: string; missing: string }
> = {
  "staff-activation": {
    intro:
      "Your administrator has confirmed your identity. Keep this work account separate from your personal account. No email inbox is needed for this step.",
    button: "Activate account",
    busy: "Activating…",
    missing:
      "Open the complete activation link your administrator gave you. If it expired, ask for a new one.",
  },
  "sign-in-setup": {
    intro:
      "Your administrator set up this link so you can choose your own password. It works once and expires within 24 hours. Keep this work account separate from your personal account.",
    button: "Save password",
    busy: "Saving…",
    missing:
      "Open the complete sign-in link your administrator gave you. If it expired, ask for a new one.",
  },
};

function purposeFrom(fragment: URLSearchParams): LinkPurpose {
  return fragment.get("purpose") === "sign-in-setup"
    ? "sign-in-setup"
    : "staff-activation";
}

export function ActivationForm() {
  const [token, setToken] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<LinkPurpose>("staff-activation");
  const [state, action, pending] = useActionState(activateAccount, {
    message: "",
    done: false,
  });
  const readFragment = useRef(false);
  useEffect(() => {
    if (readFragment.current) return;
    readFragment.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const secret = fragment.get("token") ?? "";
    setPurpose(purposeFrom(fragment));
    setToken(secret);
    // Keep the secret out of requests, referrers, browser history and later screenshots.
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const copy = COPY[purpose];
  if (token === null) return <p>Opening your activation link…</p>;
  if (!token) return <p role="alert">{copy.missing}</p>;
  return (
    <>
      <AuthHeading title="Choose your password">{copy.intro}</AuthHeading>
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
            <button
              className={primaryButtonClass}
              disabled={pending}
              type="submit"
            >
              {pending ? copy.busy : copy.button}
            </button>
          </>
        )}
        <Link className={textLinkClass} href="/">
          {state.done ? "Sign in" : "Back to sign in"}
        </Link>
      </form>
    </>
  );
}
