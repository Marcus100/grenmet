import { requestStaffAccessAction } from "@/app/actions";
import { SettingsRow, SettingsSection } from "@/components/account-layout";
import { formatDate } from "@/lib/profile";

/**
 * Public accounts ask for GAA/GMS staff access here (ADR-0017); only accounts
 * that ask appear in GAA Admin's staff setup and approval queue.
 */
export function StaffAccess({ requestedAt }: { requestedAt: string | null }) {
  return (
    <SettingsSection title="Staff access">
      {requestedAt ? (
        <SettingsRow
          description={`Requested ${formatDate(requestedAt)}. An administrator will link your employee record and approve it.`}
          title="Request sent"
        />
      ) : (
        <SettingsRow
          action={
            <form action={requestStaffAccessAction}>
              <button
                className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted"
                type="submit"
              >
                Request staff access
              </button>
            </form>
          }
          description="Work at GAA or GMS? Ask for access to staff tools such as GAA Admin."
          title="Staff tools"
        />
      )}
    </SettingsSection>
  );
}
