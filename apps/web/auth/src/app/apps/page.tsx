import type { Metadata } from "next";
import {
  AccountLayout,
  SettingsRow,
  SettingsSection,
  StatusBadge,
} from "@/components/account-layout";
import { requireAccount } from "@/lib/account";
import { listAccountApps } from "@/lib/account-apps";
import { readQueryParam } from "@/lib/return-to";
import { readSessionCookie } from "@/lib/session";
import { joinAppFromAccount, leaveAppFromAccount } from "./actions";

export const metadata: Metadata = { title: "Apps — Barrels account" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  failed: "That didn't work. Try again, or ask the team if it keeps happening.",
  joined: "You joined the app.",
  left: "You left the app and signed out of it. Your other apps are unchanged.",
  "left-still":
    "You left the app, but an administrator still gives you access through a role.",
};

const BUTTON =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AppsPage({ searchParams }: PageProps) {
  await requireAccount();
  const token = await readSessionCookie();
  const apps = token ? await listAccountApps(token) : [];
  const notice = NOTICES[readQueryParam((await searchParams).notice) ?? ""];

  return (
    <AccountLayout
      current="/apps"
      description="Join an app to use it, or leave one you no longer need. Each app keeps its own sign-in."
      title="Apps"
    >
      {notice ? (
        <p className="text-muted-foreground text-sm" role="status">
          {notice}
        </p>
      ) : null}
      <SettingsSection title="Your apps">
        {apps.map((app) => (
          <SettingsRow
            action={
              app.can_leave ? (
                <form
                  action={app.joined ? leaveAppFromAccount : joinAppFromAccount}
                >
                  <input name="app" type="hidden" value={app.key} />
                  <button className={BUTTON} type="submit">
                    {app.joined ? "Leave" : "Join"}
                  </button>
                </form>
              ) : null
            }
            description={
              app.can_leave
                ? "Leaving ends your sessions in this app. You can join again any time."
                : "Access is given by an administrator."
            }
            key={app.key}
            title={app.label}
          >
            <StatusBadge tone={app.joined ? "on" : "off"}>
              {app.joined ? "Joined" : "Not joined"}
            </StatusBadge>
          </SettingsRow>
        ))}
      </SettingsSection>
    </AccountLayout>
  );
}
