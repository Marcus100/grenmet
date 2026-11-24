import type { CapAuditEventPublic } from "@barrelsgd/api-client";
import type { Route } from "next";
import Link from "next/link";
import { grenadaTime } from "@/components/desk/desk-panels";
import { auditActorLabel, auditTransitionLabel } from "@/lib/desk/audit-labels";

export interface AlertAuditTrailProps {
  alertId: string;
  /** Newest first, as FastAPI returns them. `null` when the trail could not be read. */
  events: readonly CapAuditEventPublic[] | null;
  /** Total events for this alert; `events` holds only the newest page. */
  total: number;
}

/**
 * This alert's own history: who did what and when, with the note or reason
 * the API recorded (an emergency publish or a cancellation). Always rendered,
 * so an alert with no history says so instead of hiding the section.
 */
export function AlertAuditTrail({
  alertId,
  events,
  total,
}: AlertAuditTrailProps) {
  return (
    <section
      aria-labelledby="alert-audit-heading"
      className="bg-card space-y-3 rounded-xl border p-4"
    >
      <h2 className="font-semibold" id="alert-audit-heading">
        Audit history for this alert
      </h2>
      {events === null ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          The audit history could not be loaded, so a format problem from an
          emergency publish or cancellation would not show here.
        </p>
      ) : null}
      {events !== null && events.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">
          No audit events are recorded for this alert yet.
        </p>
      ) : null}
      {events !== null && events.length > 0 ? (
        <ol className="space-y-3">
          {events.map((event) => (
            <li
              className="border-border space-y-1 border-t pt-3 first:border-t-0 first:pt-0"
              key={event.id}
            >
              <p className="font-semibold">{event.action}</p>
              <p className="text-body-sm">
                {grenadaTime(event.created_at)} · Actor:{" "}
                {auditActorLabel(event.actor_user_id)}
              </p>
              <p className="text-body-sm">
                {auditTransitionLabel(event.previous_state, event.next_state)}
              </p>
              {event.note ? (
                <p className="text-body-sm whitespace-pre-wrap">{event.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {events !== null && total > events.length ? (
        <p className="text-body-sm text-muted-foreground" role="status">
          Showing the newest {events.length} of {total} events.
        </p>
      ) : null}
      <Link
        className="text-body-sm text-info inline-flex min-h-11 items-center underline"
        href={`/desk/audit?alert_id=${encodeURIComponent(alertId)}` as Route}
      >
        Full audit history for this alert
      </Link>
    </section>
  );
}
