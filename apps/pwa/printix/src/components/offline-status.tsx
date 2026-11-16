import { conflictText } from "@/lib/offline-check";
import type { Conflict } from "@/lib/offline-store";
import { formatTime } from "@/lib/scan-outcome";
import type { OfflineMode } from "@/lib/use-offline";

const number = new Intl.NumberFormat();

interface OfflineStatusProps {
  readonly conflicts: readonly Conflict[];
  readonly fetchedAt: string | null;
  readonly mode: OfflineMode;
  readonly online: boolean;
  readonly pending: number;
}

function waitingText(pending: number, online: boolean): string | null {
  if (pending === 0) {
    return null;
  }
  const count =
    pending === 1 ? "1 admission" : `${number.format(pending)} admissions`;
  return online ? `sending ${count}` : `${count} waiting to send`;
}

function listText(mode: OfflineMode, fetchedAt: string | null): string {
  switch (mode) {
    case "starting":
      return "Loading the ticket list…";
    case "no-storage":
      return "This phone cannot keep the ticket list, so tickets can only be checked with signal.";
    case "unavailable":
      return "";
    default: {
      const time = fetchedAt ? formatTime(fetchedAt) : null;
      return time
        ? `Ticket list from ${time}`
        : "Ticket list not downloaded yet. It loads when there is signal.";
    }
  }
}

/**
 * Whether the phone has signal, how many offline admissions wait to be sent,
 * how old the saved ticket list is, and any conflicts the server reported.
 * Always shown, so staff know what the phone can do before the queue arrives.
 */
export function OfflineStatus({
  conflicts,
  fetchedAt,
  mode,
  online,
  pending,
}: OfflineStatusProps) {
  const waiting = waitingText(pending, online);
  return (
    <section
      aria-label="Signal and ticket list"
      className="flex flex-col gap-2"
    >
      <p
        aria-live="polite"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
        role="status"
      >
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
            online ? "bg-px-surface text-px-paper" : "bg-px-paper text-px-ink"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${online ? "bg-px-green" : "bg-px-stop"}`}
          />
          {online ? "Online" : "Offline"}
        </span>
        {waiting ? <span className="text-px-paper">{waiting}</span> : null}
      </p>

      {mode === "unavailable" ? (
        <p className="bg-px-surface text-px-paper rounded-xl px-4 py-3 text-sm">
          Offline checking is not available for this event. Tickets can only be
          checked with signal. With no signal, use the paper list.
        </p>
      ) : (
        <p className="text-px-muted text-sm">{listText(mode, fetchedAt)}</p>
      )}

      {conflicts.length > 0 ? (
        <details className="text-sm">
          <summary className="text-px-paper focus-visible:outline-px-paper inline-flex min-h-11 cursor-pointer items-center font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
            Conflicts ({number.format(conflicts.length)})
          </summary>
          <p className="text-px-muted pb-2">
            These people were let in with no signal, but the server did not
            record the admission. Tell your supervisor.
          </p>
          <ul className="flex flex-col gap-1 pb-2">
            {conflicts.map((conflict) => (
              <li key={conflict.clientRef}>{conflictText(conflict)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
