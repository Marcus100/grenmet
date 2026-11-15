"use client";

import Link from "next/link";
import {
  type FormHTMLAttributes,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { CodeField } from "@/components/code-field";
import {
  errorBoxClass,
  noticeBoxClass,
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

const HEADINGS: Record<InviteState["step"], string> = {
  send: "Confirm your email",
  code: "Enter your code",
  done: "You are an administrator",
};

interface InviteBodyProps {
  action: FormAction;
  error: string | null;
  needsTotp: boolean;
  notice: string | null;
  pending: boolean;
  step: InviteState["step"];
  token: string;
}

/** The three screens of acceptance, as plain markup driven by the step. */
export function InviteBody({
  action,
  error,
  needsTotp,
  notice,
  pending,
  step,
  token,
}: InviteBodyProps) {
  const alertRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);

  // Move focus to the error when one appears, and to the step heading when the
  // step changes (the first render keeps focus where the browser put it).
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  return (
    <div className="space-y-5">
      <h2
        className="text-lg font-semibold outline-none"
        ref={headingRef}
        tabIndex={-1}
      >
        {HEADINGS[step]}
      </h2>

      {error ? (
        <div
          className={errorBoxClass}
          ref={alertRef}
          role="alert"
          tabIndex={-1}
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className={noticeBoxClass} role="status">
          {notice}
        </p>
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
                allowRecovery
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
            Step 2 of 3: set up your authenticator app. The admin tools need it
            before they open.
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
 * address bar. `null` means not read yet; an empty result means the link is missing.
 *
 * The ref guard matters: React Strict Mode runs effects twice in development, and a
 * second read would find the fragment already removed and show the missing-link text.
 */
export function SuperuserInviteForm() {
  const [link, setLink] = useState<{ token: string | null } | null>(null);
  const readFragment = useRef(false);
  const [state, action, pending] = useActionState(
    superuserInviteAction,
    INITIAL_INVITE_STATE
  );

  useEffect(() => {
    if (readFragment.current) return;
    readFragment.current = true;
    const token = readInviteToken(window.location.hash);
    setLink({ token });
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  }, []);

  if (link === null) return <p>Opening your invitation link…</p>;
  if (!link.token) {
    return (
      <p className="text-muted-foreground text-sm" role="alert">
        This page needs the link from your invitation email. Open the complete
        link. Invitations work once and end after 24 hours.
      </p>
    );
  }
  return (
    <InviteBody
      action={action}
      error={state.error}
      needsTotp={state.needsTotp}
      notice={state.notice}
      pending={pending}
      step={state.step}
      token={link.token}
    />
  );
}
