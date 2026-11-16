import type {
  PrintixEventPublic,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { CountBar } from "@/components/count-bar";
import type { Link } from "@/lib/use-live-count";
import { roleLabel } from "@/organiser/choose-organisation";
import { type Problem, problemMessage } from "@/organiser/errors";
import { formatClock, formatEventDate, formatMoment } from "@/organiser/format";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT } from "@/organiser/styles";
import { useEventSummary } from "@/organiser/use-event-summary";

const number = new Intl.NumberFormat();

/** How CountBar words a stale count: a missing signal, or any other failure. */
function linkOf(problem: Problem | null): Link {
  if (problem === null) {
    return "ok";
  }
  return problem.kind === "no-signal" ? "no-signal" : "failed";
}

interface EventScreenProps {
  readonly event: PrintixEventPublic;
  readonly onBack: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/** One event's counts, refreshed while the page is open. */
export function EventScreen({
  session,
  organisation,
  event,
  onBack,
}: EventScreenProps) {
  const { summary, problem, updatedAt } = useEventSummary(
    session,
    organisation.id,
    event.id
  );
  const link = linkOf(problem);
  // The poll's copy of the event: a closing event updates while the page is open.
  const shown = summary?.event ?? event;

  return (
    <section aria-labelledby="event-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <button
          className="text-px-muted focus-visible:outline-px-paper min-h-11 w-fit text-base underline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={onBack}
          type="button"
        >
          Back to events
        </button>
        <h2 className="text-xl font-semibold break-words" id="event-title">
          {shown.name}
        </h2>
        <p className="text-px-muted text-sm">
          {formatEventDate(shown.event_date)} · Closes{" "}
          {formatMoment(shown.closes_at)} Grenada time ·{" "}
          {shown.status === "open" ? "Open" : "Closed"}
        </p>
        <p className="text-px-muted text-sm">
          Your role here: {roleLabel(organisation)}.
        </p>
      </div>

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {summary ? (
        <>
          <CountBar link={link} summary={summary} />
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Figure
              hint="Tickets voided by an organiser."
              label="Void"
              value={summary.void}
            />
            <Figure
              hint="Scans of a ticket already in, refused."
              label="Refused: already in"
              value={summary.duplicates_refused}
            />
            <Figure
              hint="Offline admissions the server could not record. The person was let in at the gate."
              label="Offline conflicts"
              value={summary.offline_conflicts ?? 0}
            />
          </dl>
        </>
      ) : null}

      {summary || problem ? null : (
        <p className="text-px-muted text-base" role="status">
          Loading the counts…
        </p>
      )}

      <p className="text-px-muted text-sm">
        {updatedAt ? `Updated ${formatClock(updatedAt)}. ` : ""}Refreshes every
        10 seconds while this page is open.
      </p>
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: number;
  readonly hint: string;
}) {
  return (
    <div className="bg-px-surface border-px-rule flex flex-col gap-1 rounded-2xl border p-4">
      <dt className="text-px-muted text-sm">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">
        {number.format(value)}
      </dd>
      <dd className="text-px-muted text-xs">{hint}</dd>
    </div>
  );
}
