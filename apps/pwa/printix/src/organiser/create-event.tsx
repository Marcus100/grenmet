import type {
  PrintixEventPublic,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { type FormEvent, useId, useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import {
  addDays,
  grenadaLocalToIso,
  localDatePart,
  utcToday,
} from "@/organiser/format";
import type { OrganiserSession } from "@/organiser/session";
import {
  ALERT,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD,
} from "@/organiser/styles";
import { createEvent } from "@/organiser/write-api";

/** The server's limits, mirrored so a person hears about them before sending. */
export const MAX_DAYS_AHEAD = 365;
export const MAX_DAYS_CLOSING_AFTER_EVENT = 7;

/**
 * The first problem with the form, in words, or null. Dates are compared as the
 * server compares them: the event date against today in UTC, and the closing date
 * (in Grenada time) against the event date.
 */
export function formProblem(
  form: {
    readonly name: string;
    readonly eventDate: string;
    readonly closesAt: string;
  },
  today: string
): string | null {
  if (form.name.trim() === "") {
    return "Give the event a name.";
  }
  if (form.eventDate === "") {
    return "Choose the event date.";
  }
  if (form.eventDate > addDays(today, MAX_DAYS_AHEAD)) {
    return "The event date can be at most one year ahead.";
  }
  if (form.closesAt === "") {
    return "Choose the closing time.";
  }
  const closingDate = localDatePart(form.closesAt);
  if (closingDate < form.eventDate) {
    return "The closing time cannot be before the event date.";
  }
  if (closingDate > addDays(form.eventDate, MAX_DAYS_CLOSING_AFTER_EVENT)) {
    return "The event closes at most seven days after the event date.";
  }
  return null;
}

interface CreateEventScreenProps {
  readonly onCancel: () => void;
  readonly onCreated: (event: PrintixEventPublic) => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/** Creates an event for this organisation. Organisers only. */
export function CreateEventScreen({
  session,
  organisation,
  onCancel,
  onCreated,
}: CreateEventScreenProps) {
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameId = useId();
  const dateId = useId();
  const closeId = useId();
  const errorId = useId();

  if (!organisation.can_manage_events) {
    return (
      <p className={ALERT} role="alert">
        Only an organiser can create events.
      </p>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const complaint = formProblem({ name, eventDate, closesAt }, utcToday());
    setLocalError(complaint);
    setProblem(null);
    if (complaint !== null) {
      return;
    }
    setBusy(true);
    const outcome = await createEvent(session, organisation.id, {
      name: name.trim(),
      eventDate,
      closesAt: grenadaLocalToIso(closesAt),
    });
    setBusy(false);
    if (outcome.ok) {
      onCreated(outcome.value);
    } else {
      setProblem(outcome.problem);
    }
  }

  const message = localError ?? (problem ? problemMessage(problem) : null);

  return (
    <section aria-labelledby="create-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <button
          className="text-px-muted focus-visible:outline-px-paper min-h-11 w-fit text-base underline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={onCancel}
          type="button"
        >
          Back to events
        </button>
        <h2 className="text-xl font-semibold" id="create-title">
          New event
        </h2>
        <p className="text-px-muted text-sm">
          Times are Grenada time. The event belongs to {organisation.name}.
        </p>
      </div>

      <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <label className="text-base font-semibold" htmlFor={nameId}>
            Event name
          </label>
          <input
            aria-describedby={message ? errorId : undefined}
            className={FIELD}
            id={nameId}
            onChange={(event) => setName(event.target.value)}
            type="text"
            value={name}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-base font-semibold" htmlFor={dateId}>
            Event date
          </label>
          <input
            aria-describedby={`${dateId}-hint`}
            className={FIELD}
            id={dateId}
            onChange={(event) => setEventDate(event.target.value)}
            type="date"
            value={eventDate}
          />
          <p className="text-px-muted text-sm" id={`${dateId}-hint`}>
            Up to one year ahead.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-base font-semibold" htmlFor={closeId}>
            Closes (Grenada time)
          </label>
          <input
            aria-describedby={`${closeId}-hint`}
            className={FIELD}
            id={closeId}
            onChange={(event) => setClosesAt(event.target.value)}
            type="datetime-local"
            value={closesAt}
          />
          <p className="text-px-muted text-sm" id={`${closeId}-hint`}>
            At most seven days after the event date. Gate codes stop admitting
            people when the event closes.
          </p>
        </div>

        {message ? (
          <p className={ALERT} id={errorId} role="alert">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            aria-busy={busy}
            className={BUTTON_PRIMARY}
            disabled={busy}
            type="submit"
          >
            {busy ? "Creating…" : "Create event"}
          </button>
          <button className={BUTTON_SECONDARY} onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
