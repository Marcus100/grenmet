"use client";

import Link from "next/link";
import {
  type FormHTMLAttributes,
  useActionState,
  useEffect,
  useState,
} from "react";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/form-styles";
import { superuserInviteAction } from "./actions";
import {
  INITIAL_INVITE_STATE,
  type InviteState,
  readInviteToken,
} from "./invite-state";

type FormAction = NonNullable<FormHTMLAttributes<HTMLFormElement>["action"]>;

interface InviteBodyProps {
  action: FormAction;
  error: string | null;
  needsTotp: boolean;
  pending: boolean;
  step: InviteState["step"];
  token: string;
}

/** The three screens of acceptance, as plain markup driven by the step. */
export function InviteBody({
  action,
  error,
  needsTotp,
  pending,
  step,
  token,
}: InviteBodyProps) {
  return (
    <div className="space-y-5">
      {error ? (
        <div className={errorBoxClass} role="alert">
          {error}
        </div>
      ) : null}

      {step === "send" ? (
        <form action={action} className="space-y-5">
          <input name="token" type="hidden" value={token} />
          <input name="intent" type="hidden" value="send" />
          <p className="text-muted-foreground text-sm">
            We'll email a six-digit code to the address this invitation was sent
            to. You need that code to accept.
          </p>
          <p className="text-muted-foreground text-sm">
            Step 1 of 3 confirms your email. Step 2 sets up your authenticator
            app. Step 3 saves your recovery codes.
          </p>
          <button
            className={primaryButtonClass}
            disabled={pending}
            type="submit"
          >
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : null}

      {step === "code" ? (
        <div className="space-y-5">
          <form action={action} className="space-y-5">
            <input name="token" type="hidden" value={token} />
            <input name="intent" type="hidden" value="accept" />
            <p className="text-muted-foreground text-sm">
              Step 1 of 3. Enter the code we emailed to the invited address.
              Accepting makes you an administrator of this platform.
            </p>
            <CodeField id="invite_code" label="6-digit code" name="code" />
            {needsTotp ? (
              <CodeField
                id="invite_totp"
                label="Authenticator code"
                name="totp_code"
              />
            ) : null}
            <button
              className={primaryButtonClass}
              disabled={pending}
              type="submit"
            >
              {pending ? "Accepting…" : "Accept invitation"}
            </button>
          </form>
          <form action={action}>
            <input name="token" type="hidden" value={token} />
            <input name="intent" type="hidden" value="send" />
            <button
              className={secondaryButtonClass}
              disabled={pending}
              type="submit"
            >
              Email me a new code
            </button>
          </form>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="space-y-4">
          <p className="text-foreground text-sm">
            You are now an administrator. Step 2 of 3: set up your authenticator
            app. The admin tools need it before they open.
          </p>
          <Link className={primaryButtonClass} href="/security">
            Set up your authenticator
          </Link>
          <p className="text-muted-foreground text-sm">
            Step 3 of 3 is on the same page: save the recovery codes it shows
            you, offline.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The invitation form. The token is read from the link's fragment in the browser
 * (it never reaches the server or a referrer), then the fragment is removed from the
 * address bar. Until a token is read, the form says how to open the link.
 */
export function SuperuserInviteForm() {
  const [token, setToken] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    superuserInviteAction,
    INITIAL_INVITE_STATE
  );

  useEffect(() => {
    setToken(readInviteToken(window.location.hash));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    );
  }, []);

  if (!token) {
    return (
      <p className="text-muted-foreground text-sm">
        This page needs the link from your invitation email. Invitations work
        once and end after 24 hours.
      </p>
    );
  }
  return (
    <InviteBody
      action={action}
      error={state.error}
      needsTotp={state.needsTotp}
      pending={pending}
      step={state.step}
      token={token}
    />
  );
}
