"use client";

import {
  authGetOnboardingStatusQueryKey,
  type OnboardingStatus,
  type UserPublic,
  useAuthAdminActivateAccount,
  useAuthAdminResendVerification,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { reportError } from "@/lib/report-error";
import { useSecurityUrl } from "./security-url";
import {
  describeSuperuserFailure,
  type SuperuserActionFailure,
} from "./superuser-action-error";

const MIN_REASON = 10;
const MAX_REASON = 500;

type Mode = "activate" | "resend" | null;

/** Superuser-only: vouch for the account, or send the verification email again. */
export function AdminAccountActions({
  status,
  user,
}: {
  status: OnboardingStatus;
  user: Pick<UserPublic, "id" | "email"> &
    Partial<Pick<UserPublic, "is_superuser">>;
}) {
  const queryClient = useQueryClient();
  const securityUrl = useSecurityUrl();
  const activate = useAuthAdminActivateAccount();
  const resend = useAuthAdminResendVerification();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<SuperuserActionFailure | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    warning: boolean;
  } | null>(null);

  const trimmed = reason.trim();
  const reasonValid =
    trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;
  const busy = activate.isPending || resend.isPending;
  const activateRef = useRef<HTMLButtonElement | null>(null);
  const resendRef = useRef<HTMLButtonElement | null>(null);
  const lastMode = useRef<Mode>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  const wasOpen = useRef(false);

  // Return focus when the confirm panel closes: to the result if there is one,
  // otherwise to the button that opened it.
  useEffect(() => {
    if (mode !== null) {
      wasOpen.current = true;
      lastMode.current = mode;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const trigger =
      lastMode.current === "activate" ? activateRef.current : resendRef.current;
    (noticeRef.current ?? trigger)?.focus();
  }, [mode]);

  function open(next: Mode) {
    setMode(next);
    setReason("");
    setFailure(null);
    setNotice(null);
  }

  function fail(error: unknown) {
    const described = describeSuperuserFailure(error);
    if (described.unexpected) reportError(error, "admin-account-actions");
    setFailure(described);
  }

  async function submitActivate() {
    setFailure(null);
    try {
      const result = await activate.mutateAsync({
        path: { user_id: user.id },
        body: { reason: trimmed, expected_email: user.email },
      });
      await queryClient.invalidateQueries({
        queryKey: authGetOnboardingStatusQueryKey({
          path: { user_id: user.id },
        }),
      });
      setNotice({
        text:
          result.admin_activated || result.email_verified
            ? "Account is activated: staff roles and organisation membership can be granted. If it already was, nothing changed. This use was recorded."
            : "The request was accepted, but the account does not show as activated yet. Refresh and check its state.",
        warning: false,
      });
      setMode(null);
    } catch (error) {
      fail(error);
    }
  }

  async function submitResend() {
    setFailure(null);
    try {
      const result = await resend.mutateAsync({
        path: { user_id: user.id },
        body: { reason: trimmed },
      });
      setNotice(
        result.delivered
          ? {
              text: `Verification email sent to ${user.email}.`,
              warning: false,
            }
          : {
              text: "The mail could not be sent. Check the mail settings, then try again.",
              warning: true,
            }
      );
      setMode(null);
    } catch (error) {
      fail(error);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="admin-account-actions">
      <p className="text-sm">
        Activation pending: {status.activation_pending ? "yes" : "no"}. Admin
        activated: {status.admin_activated ? "yes" : "no"}.
      </p>
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          {user.is_superuser ? (
            <p className="text-muted-foreground text-sm">
              Superuser accounts cannot be activated here.
            </p>
          ) : (
            <Button
              className="min-h-11"
              onClick={() => open("activate")}
              ref={activateRef}
              type="button"
              variant="outline"
            >
              Activate account
            </Button>
          )}
          <Button
            className="min-h-11"
            onClick={() => open("resend")}
            ref={resendRef}
            type="button"
            variant="outline"
          >
            Resend verification email
          </Button>
        </div>
      ) : (
        <ConfirmPanel
          busy={busy}
          email={user.email}
          mode={mode}
          onCancel={() => open(null)}
          onConfirm={mode === "activate" ? submitActivate : submitResend}
          onReason={setReason}
          reason={reason}
          reasonValid={reasonValid}
        />
      )}
      {notice ? (
        <p
          className={
            notice.warning
              ? "rounded-md border border-warning px-3 py-2 text-sm"
              : "text-sm"
          }
          ref={noticeRef}
          role={notice.warning ? "alert" : "status"}
          tabIndex={-1}
        >
          {notice.text}
        </p>
      ) : null}
      {failure ? (
        <p className="text-destructive text-sm" role="alert">
          {failure.message}{" "}
          {failure.mfaRequired && securityUrl ? (
            <a className="underline" href={securityUrl}>
              Open Security settings
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function ConfirmPanel({
  busy,
  email,
  mode,
  onCancel,
  onConfirm,
  onReason,
  reason,
  reasonValid,
}: {
  busy: boolean;
  email: string;
  mode: "activate" | "resend";
  onCancel: () => void;
  onConfirm: () => void;
  onReason: (value: string) => void;
  reason: string;
  reasonValid: boolean;
}) {
  const fieldId = useId();
  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    reasonRef.current?.focus();
  }, []);
  const short = reason.trim().length < MIN_REASON;
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border p-3">
      <legend className="px-1 font-medium text-sm">
        {mode === "activate" ? "Confirm activation" : "Confirm resend"}
      </legend>
      {mode === "activate" ? (
        <p className="text-sm">
          This unlocks staff roles and organisation membership for{" "}
          <strong>{email}</strong>. It does not verify the email address and
          does not unlock deposits. The use is recorded with your reason.
        </p>
      ) : (
        <p className="text-sm">
          This sends the verification email to <strong>{email}</strong> again.
          The use is recorded with your reason.
        </p>
      )}
      <label className="text-sm" htmlFor={`${fieldId}-reason`}>
        Reason ({MIN_REASON} to {MAX_REASON} characters)
      </label>
      <Textarea
        aria-describedby={`${fieldId}-hint`}
        aria-invalid={reason.length > 0 && short}
        id={`${fieldId}-reason`}
        maxLength={MAX_REASON}
        onChange={(event) => onReason(event.target.value)}
        ref={reasonRef}
        value={reason}
      />
      <p className="text-muted-foreground text-xs" id={`${fieldId}-hint`}>
        {reasonValid
          ? "Ready to confirm."
          : `The confirm button stays disabled until the reason has at least ${MIN_REASON} characters (${reason.trim().length} so far).`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={!reasonValid || busy}
          onClick={onConfirm}
          type="button"
        >
          {mode === "activate"
            ? "Confirm activation"
            : "Send verification email"}
        </Button>
        <Button
          className="min-h-11"
          disabled={busy}
          onClick={onCancel}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}
