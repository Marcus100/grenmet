"use client";

import type { CapProfilePublic } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveHazardProfileAction } from "@/app/desk/profiles/actions";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import type { DeskError } from "@/lib/desk/errors";
import { approvalCheck } from "@/lib/desk/profiles";

export interface ProfileApprovalProps {
  permissions: { approve: boolean; libraryManage: boolean };
  profile: CapProfilePublic;
  userId: string;
}

/**
 * Approve one draft profile version. Approval is never one click: the
 * forecaster confirms in a dialog that names the profile and version, because
 * an approved profile sets the severity rules for new warnings.
 */
export function ProfileApproval({
  permissions,
  profile,
  userId,
}: ProfileApprovalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<DeskError | null>(null);
  const check = approvalCheck(profile, permissions, userId);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const outcome = await approveHazardProfileAction({
        profileId: profile.id,
      });
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!check.allowed) {
    return <p className="text-body-sm text-muted-foreground">{check.reason}</p>;
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => setOpen(true)} type="button" variant="outline">
        Approve version {profile.version}
      </Button>
      <DeskErrorNotice error={error} />
      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Approve {profile.definition.name}, version {profile.version}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Once approved, this version sets the wording, impacts and severity
            rules that new warnings for this hazard use. Your name is recorded
            as the approver with the time. Only approve it if you have checked
            it against the source.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button disabled={pending} onClick={confirm} type="button">
              {pending
                ? "Approving…"
                : `Yes, approve version ${profile.version}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
