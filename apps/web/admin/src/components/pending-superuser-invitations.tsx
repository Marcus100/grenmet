import type { SuperuserInvitationPublic } from "@barrelsgd/api-client";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { revokeSuperuserInvitationAction } from "@/app/(console)/superusers/actions";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";

// Server component. Revoke goes through the shared confirm dialog
// (ConfirmActionDialog, a client component), so nothing is revoked on the
// first click and the dialog says what stops working.

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Grenada",
});

/** Open invitations, or the empty state. The section always shows. */
export function PendingInvitations({
  invitations,
}: {
  invitations: readonly SuperuserInvitationPublic[];
}) {
  if (invitations.length === 0) {
    return (
      <Empty className="border p-4" role="status">
        <EmptyHeader>
          <EmptyTitle>No pending invitations</EmptyTitle>
          <EmptyDescription>
            Invitations you send appear here until they are used, revoked or
            expire after 24 hours.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {invitations.map((invitation) => (
        <li
          className="flex flex-wrap items-start justify-between gap-3 p-4"
          key={invitation.id}
        >
          <div className="min-w-0 space-y-1">
            <p className="font-medium break-all">{invitation.email}</p>
            <p className="text-muted-foreground text-sm">
              {`Expires ${WHEN.format(new Date(invitation.expires_at))}`}
            </p>
            <p className="text-muted-foreground text-sm">{invitation.reason}</p>
          </div>
          <ConfirmActionDialog
            action={revokeSuperuserInvitationAction}
            confirmLabel="Revoke invitation"
            description={`Revoking the invitation for ${invitation.email} stops it working at once and cannot be undone.`}
            fields={{ invitation_id: invitation.id }}
            title={`Revoke the invitation for ${invitation.email}?`}
            triggerLabel="Revoke"
          />
        </li>
      ))}
    </ul>
  );
}
