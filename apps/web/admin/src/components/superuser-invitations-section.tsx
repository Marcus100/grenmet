import { isAuthApiError } from "@barrelsgd/auth";
import { PendingInvitations } from "@/components/pending-superuser-invitations";
import { reportError } from "@/lib/report-error";
import {
  FORBIDDEN_MESSAGES,
  forbiddenKind,
} from "@/lib/superuser-invitation-form";
import { listSuperuserInvitations } from "@/lib/superuser-invitations-api";

const FORBIDDEN = 403;

/**
 * Streams in behind Suspense. A refusal (403) says what to do and is not reported as a
 * fault; any other failure shows a message, never an empty list.
 */
export async function SuperuserInvitationsSection({
  accessToken,
}: {
  accessToken: string;
}) {
  try {
    const invitations = await listSuperuserInvitations(accessToken);
    return <PendingInvitations invitations={invitations} />;
  } catch (error) {
    if (isAuthApiError(error) && error.status === FORBIDDEN) {
      return (
        <p className="text-muted-foreground text-sm" role="status">
          {FORBIDDEN_MESSAGES[forbiddenKind(error.detail)]}
        </p>
      );
    }
    reportError(error, "admin-superusers");
    return (
      <p className="text-destructive text-sm" role="alert">
        Pending invitations could not be loaded. Refresh to try again.
      </p>
    );
  }
}
