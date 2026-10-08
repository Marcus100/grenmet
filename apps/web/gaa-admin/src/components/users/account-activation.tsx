"use client";
import {
  type AccessBlocker,
  type ActivationLink,
  type UserPublic,
  useAuthGetOnboardingStatus,
  useAuthIssueActivation,
  useAuthRevokeActivation,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useId, useState } from "react";
import { reportError } from "@/lib/report-error";

const reasons: Record<AccessBlocker, string> = {
  inactive: "Account is disabled. Review this before enabling access.",
  password_setup: "Give the person an activation link to set their password.",
  email_verification:
    "Verify email, or use administrator-approved activation below.",
  staff_approval: "Staff approval is still required.",
  cms_grant: "Choose Writer or Publisher under CMS access.",
  mfa_enrolment:
    "Ask the person to set up two-step verification and save recovery codes in account security.",
};

export function AccountActivation({
  user,
  open,
}: {
  user: Pick<UserPublic, "id">;
  open: boolean;
}) {
  const actor = useSessionUser();
  return actor?.is_superuser && open ? (
    <ActivationDetails key={user.id} user={user} />
  ) : null;
}

function ActivationDetails({ user }: { user: Pick<UserPublic, "id"> }) {
  const fieldId = useId();
  const status = useAuthGetOnboardingStatus({ path: { user_id: user.id } });
  const issue = useAuthIssueActivation();
  const revoke = useAuthRevokeActivation();
  const [confirmed, setConfirmed] = useState(false);
  const [link, setLink] = useState<ActivationLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function generate() {
    setError(null);
    try {
      const result = await issue.mutateAsync({
        path: { user_id: user.id },
        body: { identity_confirmed: confirmed },
      });
      setLink(result);
      await status.refetch();
    } catch (caught) {
      reportError(caught, "account-activation");
      setError("Unable to issue a link. Refresh the account and try again.");
    }
  }
  async function cancel() {
    setError(null);
    try {
      await revoke.mutateAsync({ path: { user_id: user.id } });
      setLink(null);
      await status.refetch();
    } catch (caught) {
      reportError(caught, "account-activation");
      setError("Unable to revoke the link. Try again.");
    }
  }
  return (
    <section aria-label="Account setup" className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Account setup & access</h3>
      {status.isPending ? <p>Checking access…</p> : null}
      {status.isError ? (
        <p role="alert">
          Unable to check access.{" "}
          <Button
            onClick={() => status.refetch()}
            type="button"
            variant="outline"
          >
            Retry
          </Button>
        </p>
      ) : null}
      {status.data ? (
        <>
          <p className="text-muted-foreground text-sm">
            Email: {status.data.email_verified ? "verified" : "not verified"}.
            Activation does not verify the mailbox.
          </p>
          {status.data.apps.map((app) => (
            <div key={app.app}>
              <p className="font-medium text-sm">
                {app.label}:{" "}
                {app.available ? "Ready to sign in" : "Setup needed"}
              </p>
              {app.requires_mfa_sign_in ? (
                <p className="text-muted-foreground text-sm">
                  The person must verify their authenticator or a recovery code
                  when signing in.
                </p>
              ) : null}
              {app.blockers.map((reason) => (
                <p className="text-muted-foreground text-sm" key={reason}>
                  {reasons[reason]}
                </p>
              ))}
            </div>
          ))}
          {status.data.can_issue_activation ? (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  type="checkbox"
                />
                I have verified this person's identity and will give the link
                directly to them.
              </label>
              <p className="text-muted-foreground text-sm">
                The link expires in 30 minutes. Using it replaces their password
                and signs out existing sessions. It does not grant app access.
              </p>
              <Button
                disabled={!confirmed || issue.isPending || revoke.isPending}
                onClick={generate}
                type="button"
                variant="outline"
              >
                {status.data.activation_pending
                  ? "Replace activation link"
                  : "Create activation link"}
              </Button>
            </>
          ) : null}
          {status.data.activation_pending ? (
            <Button
              disabled={revoke.isPending || issue.isPending}
              onClick={cancel}
              type="button"
              variant="outline"
            >
              Revoke activation link
            </Button>
          ) : null}
        </>
      ) : null}
      {link ? (
        <div className="space-y-2">
          <label className="text-sm" htmlFor={`${fieldId}-activation-link`}>
            Copy this private activation link
          </label>
          <Input
            autoComplete="off"
            id={`${fieldId}-activation-link`}
            onFocus={(event) => event.target.select()}
            readOnly
            value={link.activation_url}
          />
          <p className="text-muted-foreground text-sm">
            Expires {new Date(link.expires_at).toLocaleString()}. Closing this
            panel hides the link; you can issue a replacement.
          </p>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
