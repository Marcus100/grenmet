import type { ActivityEntry } from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";

const ACTION_LABELS: Record<string, string> = {
  "listing.created": "Created the event",
  "listing.updated": "Edited the event",
  "listing.published": "Published the event",
  "listing.rescheduled": "Changed the start time",
  "listing.cancelled": "Cancelled the event",
};

const FIELD_LABELS: Record<string, string> = {
  starts_at: "start",
  ends_at: "end",
  group_id: "group",
};

export function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? "Changed the event";
}

export function describeFields(changed: readonly string[]): string {
  return changed.map((name) => FIELD_LABELS[name] ?? name).join(", ");
}

/** The listing's append-only change history, newest first. */
export function ActivityPanel({
  entries,
}: {
  entries: readonly ActivityEntry[];
}) {
  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <h2
        className="font-display font-semibold text-heading-sm"
        id="activity-heading"
      >
        History
      </h2>
      {entries.length === 0 ? (
        <p className="text-body text-muted-foreground">No changes recorded.</p>
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {entries.map((entry) => (
            <li className="space-y-0.5 px-4 py-3" key={entry.id}>
              <p className="font-medium text-body">
                {describeAction(entry.action)}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  by {entry.actorName ?? "an organiser"}
                </span>
              </p>
              <p className="text-caption text-muted-foreground">
                {formatEventDate(entry.createdAt)}
                {entry.action === "listing.updated" && entry.changed.length > 0
                  ? ` · ${describeFields(entry.changed)}`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
