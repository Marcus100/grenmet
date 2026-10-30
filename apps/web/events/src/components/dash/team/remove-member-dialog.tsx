"use client";

import type { MembershipGrantPublic } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { SIGN_IN_REQUIRED } from "@/data/action-result";
import { loadIssuedGrants, removeMember } from "@/data/team-actions";
import {
  bundleCopy,
  COULDNT_CONFIRM_TEAM,
  formatUtc,
  OWNER_ONLY_REMOVE,
  OWNER_TOUCH_REFUSED,
} from "@/lib/team-roles";
import { useTeamFeedback } from "./team-feedback";

type Issued =
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loading" }
  | { readonly kind: "ok"; readonly grants: readonly MembershipGrantPublic[] };

/**
 * Removes a member from the organisation (owners and admins). Opening it asks
 * the API which roles this person gave to others, because removal takes those
 * away too; the list is shown before the admin confirms.
 */
export function RemoveMemberDialog({
  memberName,
  membershipId,
  targetRole,
}: {
  memberName: string;
  membershipId: string;
  /** The member's organisation role, to word the owner-only refusal. */
  targetRole: "admin" | "member" | "owner";
}) {
  const router = useRouter();
  const issuedTitleId = useId();
  const feedback = useTeamFeedback();
  // Two actions, two states: the preview must not make the destructive
  // button read "Removing", and a failed preview must not enable it.
  const preview = useMemberAction(COULDNT_CONFIRM_TEAM);
  const removal = useMemberAction(COULDNT_CONFIRM_TEAM);
  const { pending, perform } = removal;
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Issued>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIssued({ kind: "loading" });
    const result = await preview.perform(() =>
      loadIssuedGrants({ membershipId })
    );
    setIssued(
      result.ok
        ? { kind: "ok", grants: result.data }
        : {
            kind: "error",
            message:
              result.error === SIGN_IN_REQUIRED
                ? "Sign in again to continue."
                : result.error,
          }
    );
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      load();
    }
  }

  async function confirm() {
    setError(null);
    const result = await perform(() => removeMember({ membershipId }));
    if (result.ok) {
      setOpen(false);
      feedback.notice(`${memberName} was removed from the organisation.`);
      router.refresh();
      return;
    }
    if (result.error !== SIGN_IN_REQUIRED) {
      setError(
        targetRole === "owner" && result.error === OWNER_TOUCH_REFUSED
          ? OWNER_ONLY_REMOVE
          : result.error
      );
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            aria-label={`Remove ${memberName} from the organisation`}
            className="min-h-11"
            type="button"
            variant="outline"
          />
        }
      >
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {memberName}?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to this organisation and every role they hold. Any
            role they gave to other people is taken away too. Roles those people
            passed on again stay until you take them away.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <section aria-labelledby={issuedTitleId} className="space-y-2">
          <h3 className="text-body font-medium" id={issuedTitleId}>
            Roles {memberName} gave to others
          </h3>
          {issued.kind === "loading" ? (
            <p className="text-body text-muted-foreground" role="status">
              Checking what they gave out
            </p>
          ) : null}
          {issued.kind === "error" ? (
            <div className="space-y-2">
              <p className="text-body text-destructive" role="alert">
                {issued.message}
              </p>
              <Button
                className="min-h-11"
                onClick={load}
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </div>
          ) : null}
          {issued.kind === "ok" && issued.grants.length === 0 ? (
            <p className="text-body text-muted-foreground" role="status">
              They haven't given any role to anyone, so removing them takes away
              nothing else.
            </p>
          ) : null}
          {issued.kind === "ok" && issued.grants.length > 0 ? (
            <ul className="text-body space-y-1">
              {issued.grants.map((grant) => (
                <li key={grant.id}>
                  {bundleCopy(grant.role_key).title} for {grant.member_name}
                  {grant.expires_at
                    ? `, ends ${formatUtc(grant.expires_at)}`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <p
          className="text-body text-destructive font-medium empty:hidden"
          role="alert"
        >
          {error}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">
            Keep member
          </AlertDialogCancel>
          <Button
            className="min-h-11"
            disabled={pending || issued.kind !== "ok"}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {pending ? "Removing" : "Remove member"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
