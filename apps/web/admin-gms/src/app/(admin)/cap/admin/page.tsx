import { Button } from "@grenmet/ui/components/ui/button";
import { BadgeCheck, CircleAlert, FilePlus, Settings } from "lucide-react";
import Link from "next/link";
import { getCapApiBaseUrl } from "@/lib/auth-config";
import type { CapAlertList } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

const FILTERS = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"];

export default async function AdminPage() {
  const alerts = await getAdminAlerts();
  const counts = Object.fromEntries(
    FILTERS.map((state) => [
      state,
      alerts.data.filter((alert) => alert.lifecycle_state === state).length,
    ])
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-gm-body-sm text-gm-navy leading-gm-body-sm">
            CAP editor
          </p>
          <h1 className="mt-2 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
            Alert Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/cap/admin/new">
              <FilePlus aria-hidden="true" />
              New
            </Link>
          </Button>
          <Button size="sm" variant="outline">
            <Settings aria-hidden="true" />
            Settings
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FILTERS.map((state) => (
          <div
            className="border border-gm-border bg-white p-4 shadow-gm-card"
            key={state}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-gm-label text-gm-text-muted uppercase leading-gm-label">
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
            <div className="mt-2 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
              {counts[state] ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden border border-gm-border bg-white shadow-gm-card">
        <div className="grid grid-cols-[1fr_120px_120px] gap-3 border-gm-border border-b bg-gm-surface px-4 py-3 text-gm-label text-gm-text-muted uppercase leading-gm-label">
          <span>Alert</span>
          <span>State</span>
          <span>Sent</span>
        </div>
        {alerts.data.length === 0 ? (
          <div className="px-4 py-8 text-center text-gm-body text-gm-text-muted leading-gm-body">
            No CAP alerts are available.
          </div>
        ) : (
          alerts.data.map((alert) => (
            <div
              className="grid grid-cols-[1fr_120px_120px] gap-3 border-gm-border border-b px-4 py-3 text-gm-body leading-gm-body last:border-b-0"
              key={alert.id}
            >
              <span className="min-w-0 truncate text-gm-text-primary">
                {alert.info[0]?.headline ?? alert.identifier}
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
    </section>
  );
}

async function getAdminAlerts(): Promise<CapAlertList> {
  const response = await fetch(
    new URL("/api/v1/cap/alerts", getCapApiBaseUrl()),
    { cache: "no-store" }
  );

  if (!response.ok) {
    return { count: 0, data: [] };
  }
  return (await response.json()) as CapAlertList;
}
