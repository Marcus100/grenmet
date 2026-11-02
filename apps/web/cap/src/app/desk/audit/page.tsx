import type { Metadata, Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  DeskForbidden,
  DeskRefused,
  DeskUnavailable,
  grenadaTime,
} from "@/components/desk/desk-panels";
import { listAuditEvents } from "@/lib/desk/api";
import { AUDIT_PAGE_SIZE, parseAuditQuery } from "@/lib/desk/audit-query";
import { requireDeskGate } from "@/lib/desk/gate";
import { reportError } from "@/lib/report-error";

export const metadata: Metadata = { title: "Audit history" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Every CAP action, newest first. Read on the server with the forecaster's
 * token; the page and alert filter come from validated search parameters.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireDeskGate("/desk/audit");
  if (gate.status === "refused") return <DeskRefused email={gate.email} />;
  if (!gate.permissions.read) {
    return (
      <DeskForbidden permission="cap.alert.read" what="the audit history" />
    );
  }
  const query = parseAuditQuery(await searchParams);
  if (!query.ok) {
    return (
      <AuditShell alertId="">
        <div className="space-y-2" role="alert">
          {query.problems.map((problem) => (
            <p className="text-destructive" key={problem}>
              {problem}
            </p>
          ))}
        </div>
      </AuditShell>
    );
  }
  let audit: Awaited<ReturnType<typeof listAuditEvents>>;
  try {
    audit = await listAuditEvents(gate.accessToken, {
      alertId: query.alertId,
      page: query.page,
      size: AUDIT_PAGE_SIZE,
    });
  } catch (error) {
    reportError(error, "cap-desk-audit-page");
    return (
      <AuditShell alertId={query.alertId ?? ""}>
        <DeskUnavailable what="The audit history" />
      </AuditShell>
    );
  }
  const lastPage = Math.max(1, Math.ceil(audit.count / AUDIT_PAGE_SIZE));
  return (
    <AuditShell alertId={query.alertId ?? ""}>
      <p className="text-body-sm text-muted-foreground" role="status">
        {audit.count} events · page {query.page} of {lastPage}
      </p>
      {audit.data.length === 0 ? (
        <p className="py-6 text-muted-foreground">
          No audit events match this filter.
        </p>
      ) : (
        <ol className="space-y-3">
          {audit.data.map((event) => (
            <li
              className="space-y-1 rounded-lg border bg-card p-4"
              key={event.id}
            >
              <h2 className="font-semibold">{event.action}</h2>
              <p className="text-body-sm">
                {grenadaTime(event.created_at)} · Actor:{" "}
                {event.actor_user_id ?? "Not recorded"}
              </p>
              <p className="text-body-sm">
                {event.previous_state ?? "None"} → {event.next_state ?? "None"}
              </p>
              {event.note ? (
                <p className="whitespace-pre-wrap text-body-sm">{event.note}</p>
              ) : null}
              {event.alert_id ? (
                <Link
                  className="text-body-sm text-info underline"
                  href={`/desk/alerts/${event.alert_id}` as Route}
                >
                  Open alert
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <nav aria-label="Audit pages" className="flex gap-4 text-body-sm">
        {query.page > 1 ? (
          <Link
            className="text-info underline"
            href={auditHref(query.alertId, query.page - 1)}
          >
            Previous
          </Link>
        ) : null}
        {query.page < lastPage ? (
          <Link
            className="text-info underline"
            href={auditHref(query.alertId, query.page + 1)}
          >
            Next
          </Link>
        ) : null}
      </nav>
    </AuditShell>
  );
}

function auditHref(alertId: string | null, page: number): Route {
  const params = new URLSearchParams({ page: String(page) });
  if (alertId) params.set("alert_id", alertId);
  return `/desk/audit?${params}` as Route;
}

/** The filter resets to page 1 whenever it changes, so no page is sent. */
function AuditShell({
  alertId,
  children,
}: {
  alertId: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-2xl">Audit history</h1>
      <form
        action="/desk/audit"
        className="flex flex-wrap items-end gap-3"
        method="get"
      >
        <label
          className="flex flex-col gap-1 text-body-sm"
          htmlFor="audit-alert"
        >
          Alert ID (optional, a full UUID)
          <input
            className="min-w-80 rounded-md border bg-background px-3 py-2 font-mono"
            defaultValue={alertId}
            id="audit-alert"
            name="alert_id"
          />
        </label>
        <button
          className="rounded-md bg-primary px-3 py-2 font-medium text-body-sm text-primary-foreground"
          type="submit"
        >
          Filter history
        </button>
      </form>
      {children}
    </div>
  );
}
