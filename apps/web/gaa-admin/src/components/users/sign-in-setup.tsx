"use client";
import {
  type ActivationLink,
  type UserPublic,
  useAuthIssueSignInSetup,
  useAuthRevokeSignInSetup,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../hr/api-error";

const TRAILING_DOT = /\.$/;
const REASON_MIN = 3;
const REASON_MAX = 500;

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return typeof error.status === "number" ? error.status : undefined;
  }
  return undefined;
}

/** Plain-language outcome for a refused sign-in setup. Null means unexpected. */
function describeRefusal(error: unknown): string | null {
  const status = statusOf(error);
  const detail = hrApiErrorMessage(error);
  if (status === 403 && detail.includes("mfa_enrolment_required")) {
    return "Set up two-step verification in your account security first. Managing sign-in needs it.";
  }
  if (status === 403 && detail.includes("Sign in again")) {
    return "Sign in again with your authenticator or a recovery code, then retry.";
  }
  if (status === 403 && detail.includes("superuser")) {
    return "Only a superuser can set up sign-in for this account.";
  }
  if (status === 403) {
    return "You cannot set up sign-in for this person.";
  }
  if (status === 404) {
    return "This person is outside your management scope, or the account no longer exists.";
  }
  if (status === 400 || status === 409 || status === 422) {
    return `${detail.replace(TRAILING_DOT, "")}. Nothing was changed.`;
  }
  if (status === 429) {
    return "Too many links were issued recently. Wait a while and try again.";
  }
  return null;
}

/**
 * Lets a manager give a person a one-use, 24-hour link to choose their own
 * password. Used when email codes cannot reach them. The manager never sees
 * the password, and the link does not verify email or grant access. The link
 * is kept only in this panel's state, never in the query cache.
 */
export function SignInSetup({
  user,
  open,
}: {
  user: Pick<UserPublic, "id" | "email">;
  open: boolean;
}) {
  return open ? <SignInSetupDetails key={user.id} user={user} /> : null;
}

function SignInSetupDetails({
  user,
}: {
  user: Pick<UserPublic, "id" | "email">;
}) {
  const fieldId = useId();
  // gcTime 0: the mutation's data (the link) is dropped as soon as it is unused.
  const issue = useAuthIssueSignInSetup({ mutation: { gcTime: 0 } });
  const revoke = useAuthRevokeSignInSetup({ mutation: { gcTime: 0 } });
  const { reset: resetIssue } = issue;
  const { reset: resetRevoke } = revoke;
  const [expanded, setExpanded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState<ActivationLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Closing the dialog unmounts this panel: clear mutation state with it.
  useEffect(
    () => () => {
      resetIssue();
      resetRevoke();
    },
    [resetIssue, resetRevoke]
  );

  const trimmedReason = reason.trim();
  const reasonValid =
    trimmedReason.length >= REASON_MIN && trimmedReason.length <= REASON_MAX;

  async function create() {
    setError(null);
    try {
      const result = await issue.mutateAsync({
        path: { user_id: user.id },
        body: { identity_confirmed: confirmed, reason: trimmedReason },
      });
      setLink(result);
      resetIssue();
    } catch (caught) {
      const refusal = describeRefusal(caught);
      if (refusal === null) {
        reportError(caught, "sign-in-setup");
        setError("Something went wrong. Try again.");
      } else {
        setError(refusal);
      }
    }
  }

  async function cancel() {
    setError(null);
    try {
      await revoke.mutateAsync({ path: { user_id: user.id } });
      setLink(null);
      toast.success("Sign-in link revoked");
    } catch (caught) {
      const refusal = describeRefusal(caught);
      if (refusal === null) {
        reportError(caught, "sign-in-setup");
      }
      setError(refusal ?? "Unable to revoke the link. Try again.");
    }
  }

  async function copy() {
    if (!link) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(link.activation_url);
      toast.success("Link copied. Send it to the person directly.");
    } catch {
      setError(
        "Copying did not work in this browser. Select the link and copy it by hand."
      );
    }
  }

  if (!expanded) {
    return (
      <section aria-label="Sign-in setup" className="flex flex-col gap-2">
        <Button
          onClick={() => setExpanded(true)}
          type="button"
          variant="outline"
        >
          Set up sign-in for this person
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Sign-in setup" className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Set up sign-in</h3>
      <p className="text-muted-foreground text-sm">
        Use this when the person cannot receive sign-in codes by email, for
        example when their work mailbox is not live yet or the address is wrong.
        They open the link and choose their own password, then sign in as usual.
        You never see the password.
      </p>
      <p className="text-muted-foreground text-sm">
        The link expires in 24 hours and works once. It does not verify their
        email and does not give them any roles or app access. We email the
        address on their account to tell them a link was set up.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        I have confirmed this person's identity and will give them the link
        directly.
      </label>
      <div className="flex flex-col gap-1">
        <label className="text-sm" htmlFor={`${fieldId}-reason`}>
          Reason (kept in the audit trail)
        </label>
        <p
          className="text-muted-foreground text-xs"
          id={`${fieldId}-reason-hint`}
        >
          Use at least 10 characters when the email is verified.
        </p>
        <Input
          aria-describedby={`${fieldId}-reason-hint`}
          autoComplete="off"
          id={`${fieldId}-reason`}
          maxLength={REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </div>
      <Button
        disabled={
          !(confirmed && reasonValid) || issue.isPending || revoke.isPending
        }
        onClick={create}
        type="button"
        variant="outline"
      >
        {link ? "Replace setup link" : "Create setup link"}
      </Button>
      {link ? (
        <div className="space-y-2">
          <label className="text-sm" htmlFor={`${fieldId}-setup-link`}>
            Private sign-in link
          </label>
          <div className="flex gap-2">
            <Input
              autoComplete="off"
              id={`${fieldId}-setup-link`}
              onFocus={(event) => event.target.select()}
              readOnly
              value={link.activation_url}
            />
            <Button onClick={copy} type="button" variant="outline">
              Copy link
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            Expires {new Date(link.expires_at).toLocaleString()}. Closing this
            panel hides the link; you can create a replacement.
          </p>
          <Button
            disabled={revoke.isPending || issue.isPending}
            onClick={cancel}
            type="button"
            variant="outline"
          >
            Revoke link
          </Button>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
