import type { Metadata } from "next";
import { AccountLayout, SettingsSection } from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { signOutEverywhereAction } from "../actions";
import { loadSecurity } from "../security/actions";
import { SessionsList } from "./sessions-list";

export const metadata: Metadata = { title: "Sessions — Grenmet Auth" };
export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const account = await requireAccount();
  const security = await loadSecurity().catch(() => null);

  return (
    <AccountLayout
      current="/sessions"
      description="Devices and apps signed in to your account. Sign out any you don't recognise."
      title="Sessions"
    >
      {security ? (
        <SessionsList
          currentSessionId={account.session.id}
          sessions={security.sessions}
        />
      ) : (
        <p className="text-destructive text-sm" role="alert">
          Sessions could not be loaded. Refresh to try again.
        </p>
      )}

      <SettingsSection title="Danger zone">
        <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="font-medium text-foreground text-sm">
              Sign out everywhere
            </h3>
            <p className="text-muted-foreground text-sm">
              Ends every session, including this one.
            </p>
          </div>
          <form action={signOutEverywhereAction}>
            <button
              className="rounded-lg border border-destructive/30 px-3 py-1.5 font-medium text-destructive text-sm transition hover:bg-destructive/10"
              type="submit"
            >
              Sign out everywhere
            </button>
          </form>
        </div>
      </SettingsSection>
    </AccountLayout>
  );
}
