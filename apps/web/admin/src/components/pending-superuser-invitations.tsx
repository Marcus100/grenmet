import type { SuperuserInvitationPublic } from "@barrelsgd/api-client";
import { revokeSuperuserInvitationAction } from "@/app/(console)/superusers/actions";

// Server component: the Revoke confirmation is a native <details>, the same pattern as
// the API-key revoke, so no client state is needed (docs/design/admin.md: destructive
// actions confirm first).

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Grenada",
});

const DANGER =
  "rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10";

/** Open invitations, or the empty state. The section always shows. */
export function PendingInvitations({
  invitations,
}: {
  invitations: readonly SuperuserInvitationPublic[];
}) {
  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No pending invitations</p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {invitations.map((invitation) => (
        <li
          className="flex flex-wrap items-start justify-between gap-3 p-4"
          key={invitation.id}
        >
          <div className="space-y-1">
            <p className="font-medium">{invitation.email}</p>
            <p className="text-muted-foreground text-sm">
              {`Expires ${WHEN.format(new Date(invitation.expires_at))}`}
            </p>
            <p className="text-muted-foreground text-sm">{invitation.reason}</p>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">Revoke</summary>
            <form
              action={revokeSuperuserInvitationAction}
              className="mt-2 grid gap-2"
            >
              <input name="invitation_id" type="hidden" value={invitation.id} />
              <p className="text-xs">
                Revoking the invitation for {invitation.email} stops it working
                at once and cannot be undone.
              </p>
              <div>
                <button className={DANGER} type="submit">
                  Confirm revoke
                </button>
              </div>
            </form>
          </details>
        </li>
      ))}
    </ul>
  );
}
