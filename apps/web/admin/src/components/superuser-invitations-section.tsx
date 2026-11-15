import { PendingInvitations } from "@/components/superuser-invitation-panels";
import { reportError } from "@/lib/report-error";
import { listSuperuserInvitations } from "@/lib/superuser-invitations-api";

/** Streams in behind Suspense. A failure shows a message, never an empty list. */
export async function SuperuserInvitationsSection({
  accessToken,
}: {
  accessToken: string;
}) {
  try {
    const invitations = await listSuperuserInvitations(accessToken);
    return <PendingInvitations invitations={invitations} />;
  } catch (error) {
    reportError(error, "admin-superusers");
    return (
      <p className="text-destructive text-sm" role="alert">
        Pending invitations could not be loaded. Refresh to try again.
      </p>
    );
  }
}
