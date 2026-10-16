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
  requested: "Request sent. You can sign in once an administrator approves it.",
  left: "You left the app and signed out of it. Your other apps are unchanged.",
  "left-still":
    "You left the app, but an administrator still gives you access through a role.",
};

const BUTTON =
  "rounded-lg border border-border px-3 py-1.5 font-medium text-foreground text-sm transition hover:bg-muted";

type AccountApp = Awaited<ReturnType<typeof listAccountApps>>[number];

function describe(app: AccountApp): string {
  if (app.can_leave) {
    return "Leaving ends your sessions in this app. You can join again any time.";
  }
  if (!app.can_join || app.joined) {
    return "Access is given by an administrator.";
  }
  return app.pending
    ? "Your request is waiting for an administrator to approve it."
    : "Join to ask for access. An administrator approves it.";
}

function badge(app: AccountApp): {
  label: string;
  tone: "on" | "off" | "neutral";
} {
  if (app.joined) return { label: "Joined", tone: "on" };
  if (app.pending) return { label: "Waiting for approval", tone: "neutral" };
  return { label: "Not joined", tone: "off" };
}

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
        {apps.map((app) => {
          const canLeave = app.joined && app.can_leave;
          const canJoin = !(app.joined || app.pending) && app.can_join;
          return (
            <SettingsRow
              action={
                canLeave || canJoin ? (
                  <form
                    action={canLeave ? leaveAppFromAccount : joinAppFromAccount}
                  >
                    <input name="app" type="hidden" value={app.key} />
                    <button className={BUTTON} type="submit">
                      {canLeave ? "Leave" : "Join"}
                    </button>
                  </form>
                ) : null
              }
              description={describe(app)}
              key={app.key}
              title={app.label}
            >
              <StatusBadge tone={badge(app).tone}>
                {badge(app).label}
              </StatusBadge>
            </SettingsRow>
          );
        })}
      </SettingsSection>
    </AccountLayout>
  );
}
