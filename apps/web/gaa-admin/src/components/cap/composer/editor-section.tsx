import { Button } from "@barrelsgd/ui/components/ui/button";
import { BadgeCheck, CircleAlert, FilePlus, Settings } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type CapAlertList, fetchAdminAlerts } from "@/lib/cap-api";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@/lib/server-session";

const FILTERS = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"];

export async function EditorSection() {
  const alerts = await getAdminAlerts();
  const counts = Object.fromEntries(
    FILTERS.map((state) => [
      state,
      alerts.data.filter((alert) => alert.lifecycle_state === state).length,
    ])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-gm-text-primary text-heading-md leading-heading-md">
          Alert Dashboard
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/cap/admin/new">
              <FilePlus aria-hidden="true" />
              New
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/cap/profiles">
              <Settings aria-hidden="true" />
              Hazard profiles
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FILTERS.map((state) => (
          <div
            className="border border-gm-border bg-card p-4 shadow-card"
            key={state}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-gm-text-muted text-label uppercase leading-label">
                {state}
              </span>
              {state === "PUBLISHED" ? (
                <BadgeCheck
                  aria-hidden="true"
                  className="size-4 text-gm-risk-green"
                />
              ) : (
                <CircleAlert
                  aria-hidden="true"
                  className="size-4 text-gm-sun"
                />
              )}
            </div>
            <div className="mt-2 text-gm-text-primary text-heading-md leading-heading-md">
              {counts[state] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden border border-gm-border bg-card shadow-card">
        <div className="grid grid-cols-[1fr_120px_120px] gap-3 border-gm-border border-b bg-gm-surface px-4 py-3 text-gm-text-muted text-label uppercase leading-label">
          <span>Alert</span>
          <span>State</span>
          <span>Sent</span>
        </div>
        {alerts.data.length === 0 ? (
          <div className="px-4 py-8 text-center text-body text-gm-text-muted leading-body">
            No CAP alerts are available.
          </div>
        ) : (
          alerts.data.map((alert) => (
            <div
              className="grid grid-cols-[1fr_120px_120px] gap-3 border-gm-border border-b px-4 py-3 text-body leading-body last:border-b-0"
              key={alert.id}
            >
              <span className="min-w-0 truncate text-gm-text-primary">
                {alert.info?.[0]?.headline ?? alert.identifier}
              </span>
              <span className="text-gm-text-secondary">
                {alert.lifecycle_state}
              </span>
              <span className="text-gm-text-secondary">
                {new Date(alert.sent).toLocaleDateString("en")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

async function getAdminAlerts(): Promise<CapAlertList> {
  // The editor list hits the authenticated `/api/v1/cap/alerts`, so exchange the
  // session cookie for a Bearer access token (same handshake as the admin
  // layout). An expired/revoked session redirects to sign-in rather than
  // silently showing an empty dashboard.
  const sessionToken = await readSessionCookie();
  if (!sessionToken) {
    redirect("/signin");
  }

  let accessToken: string;
  try {
    const session = await exchangeSessionForAccessToken(sessionToken);
    accessToken = session.access_token;
  } catch {
    redirect("/signin");
  }

  return fetchAdminAlerts(accessToken);
}
