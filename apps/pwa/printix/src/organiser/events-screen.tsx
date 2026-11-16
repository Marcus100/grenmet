import type {
  PrintixEventPage,
  PrintixEventPublic,
  PrintixOrganiserOrganisation,
} from "@barrelsgd/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { roleLabel } from "@/organiser/choose-organisation";
import { type Problem, problemMessage } from "@/organiser/errors";
import { formatEventDate } from "@/organiser/format";
import { EVENTS_PAGE_SIZE, listEvents } from "@/organiser/organiser-api";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT, BUTTON_ROW, BUTTON_SECONDARY, NOTE } from "@/organiser/styles";

type ListState =
  | { readonly kind: "loading" }
  | { readonly kind: "list"; readonly page: PrintixEventPage }
  | { readonly kind: "problem"; readonly problem: Problem };

interface EventsScreenProps {
  readonly onOpen: (event: PrintixEventPublic) => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/** The organisation's events, one page at a time, newest first. */
export function EventsScreen({
  session,
  organisation,
  onOpen,
}: EventsScreenProps) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ListState>({ kind: "loading" });
  // Only the newest request may write the list, so an old answer cannot win.
  const latest = useRef(0);

  const load = useCallback(() => {
    latest.current += 1;
    const request = latest.current;
    setState({ kind: "loading" });
    listEvents(session, organisation.id, page).then((outcome) => {
      if (request !== latest.current) {
        return;
      }
      setState(
        outcome.ok
          ? { kind: "list", page: outcome.value }
          : { kind: "problem", problem: outcome.problem }
      );
    });
  }, [session, organisation.id, page]);

  useEffect(() => {
    load();
  }, [load]);

  // An empty page past the end (its events were removed since): show the last page.
  useEffect(() => {
    if (
      state.kind === "list" &&
      state.page.items.length === 0 &&
      state.page.total > 0
    ) {
      setPage(Math.max(1, Math.ceil(state.page.total / EVENTS_PAGE_SIZE)));
    }
  }, [state]);

  return (
    <section aria-labelledby="events-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold" id="events-title">
          Events
        </h2>
        <p className="text-px-muted text-sm">
          Your role here: {roleLabel(organisation)}.
        </p>
      </div>

      {state.kind === "loading" ? (
        <p className="text-px-muted text-base" role="status">
          Loading events…
        </p>
      ) : null}

      {state.kind === "problem" ? (
        <div className="flex flex-col gap-4">
          <p className={ALERT} role="alert">
            {problemMessage(state.problem)}
          </p>
          <button className={BUTTON_SECONDARY} onClick={load} type="button">
            Try again
          </button>
        </div>
      ) : null}

      {state.kind === "list" && state.page.total === 0 ? (
        <p className={NOTE}>
          No events yet. Events are set up by an organiser; creating events
          comes in the next step.
        </p>
      ) : null}

      {state.kind === "list" && state.page.total > 0 ? (
        <EventsPage
          onNext={() => setPage((current) => current + 1)}
          onOpen={onOpen}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          page={state.page}
        />
      ) : null}
    </section>
  );
}

function EventsPage({
  page,
  onOpen,
  onNext,
  onPrevious,
}: {
  readonly page: PrintixEventPage;
  readonly onOpen: (event: PrintixEventPublic) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
}) {
  const first = (page.page - 1) * page.size + 1;
  const last = Math.min(page.page * page.size, page.total);
  const hasNext = page.page * EVENTS_PAGE_SIZE < page.total;
  return (
    <>
      <p className="text-px-muted text-sm tabular-nums">
        Showing {first} to {last} of {page.total}
      </p>
      <ul className="flex flex-col gap-3">
        {page.items.map((event) => (
          <li key={event.id}>
            <button
              className={BUTTON_ROW}
              onClick={() => onOpen(event)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block font-semibold break-words">
                  {event.name}
                </span>
                <span className="text-px-muted block text-sm">
                  {formatEventDate(event.event_date)}
                </span>
              </span>
              <span
                className={`shrink-0 text-sm font-semibold ${event.status === "open" ? "text-px-green" : "text-px-muted"}`}
              >
                {event.status === "open" ? "Open" : "Closed"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <nav
        aria-label="Event pages"
        className="flex items-center justify-between gap-3"
      >
        <button
          className={BUTTON_SECONDARY}
          disabled={page.page <= 1}
          onClick={onPrevious}
          type="button"
        >
          Previous
        </button>
        <button
          className={BUTTON_SECONDARY}
          disabled={!hasNext}
          onClick={onNext}
          type="button"
        >
          Next
        </button>
      </nav>
    </>
  );
}
