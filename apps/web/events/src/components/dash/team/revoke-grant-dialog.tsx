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
import { useState } from "react";
import { useMemberAction } from "@/components/community/use-member-action";
import { SIGN_IN_REQUIRED } from "@/data/action-result";
import { revokeGrant } from "@/data/team-actions";
import { bundleCopy, COULDNT_CONFIRM_TEAM } from "@/lib/team-roles";
import { useTeamFeedback } from "./team-feedback";

/** Takes one role away from a member, after a confirm step. */
export function RevokeGrantDialog({
  grant,
  memberName,
}: {
  grant: Pick<MembershipGrantPublic, "id" | "role_key">;
  memberName: string;
}) {
  const router = useRouter();
  const feedback = useTeamFeedback();
  const { pending, perform } = useMemberAction(COULDNT_CONFIRM_TEAM);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = bundleCopy(grant.role_key).title;

  async function confirm() {
    setError(null);
    const result = await perform(() => revokeGrant({ grantId: grant.id }));
    if (result.ok) {
      setOpen(false);
      feedback.notice(`${title} was taken away from ${memberName}.`);
      router.refresh();
      return;
    }
    if (result.error !== SIGN_IN_REQUIRED) {
      setError(result.error);
    }
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger
        render={
          <Button
            aria-label={`Take away ${title} from ${memberName}`}
            className="min-h-11"
            type="button"
            variant="outline"
          />
        }
      >
        Take away
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Take away {title} from {memberName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {memberName} loses what this role allows straight away. Roles they
            gave to other people stay until you take those away too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p
          className="text-body text-destructive font-medium empty:hidden"
          role="alert"
        >
          {error}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Keep role</AlertDialogCancel>
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={confirm}
            type="button"
            variant="destructive"
          >
            {pending ? "Taking away" : "Take away role"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
