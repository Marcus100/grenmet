import type {
  PrintixOrganiserOrganisation,
  PrintixTicketPublic,
} from "@barrelsgd/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Problem, problemMessage } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";
import {
  ALERT,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  NOTE,
} from "@/organiser/styles";
import { useConfirmFocus } from "@/organiser/use-confirm-focus";
import {
  listTickets,
  restoreTicket,
  TICKETS_PAGE_SIZE,
  voidTicket,
} from "@/organiser/write-api";

const number = new Intl.NumberFormat();

type ListState =
  | { readonly kind: "loading" }
  | {
      readonly kind: "list";
      readonly items: PrintixTicketPublic[];
      readonly total: number;
      readonly page: number;
    }
  | { readonly kind: "problem"; readonly problem: Problem };

type TicketAction = "void" | "restore" | "none";

/** The one action a ticket can take now. None once the event is closed or the ticket is in. */
export function ticketAction(
  ticket: PrintixTicketPublic,
  closed: boolean
): TicketAction {
  if (closed || ticket.admitted_at) {
    return "none";
  }
  return ticket.status === "void" ? "restore" : "void";
}

const CONFIRM_WORDS: Record<"void" | "restore", string> = {
  void: "Yes, void it",
  restore: "Yes, restore it",
};

function confirmQuestion(action: "void" | "restore", printed: string): string {
  return action === "void"
    ? `Void ticket ${printed}? It will be refused at the gate. You can restore it later.`
    : `Restore ticket ${printed}? It will be admitted at the gate again.`;
}

interface TicketRowProps {
  readonly action: TicketAction;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly onAsk: () => void;
  readonly onConfirm: (action: "void" | "restore") => void;
  readonly onKeep: () => void;
  readonly ticket: PrintixTicketPublic;
}

/**
 * One ticket: its printed number and state, with its action and confirm step.
 * Focus moves into the confirm when it opens, and back to the action when it closes.
 */
function TicketRow({
  ticket,
  action,
  confirming,
  busy,
  onAsk,
  onKeep,
  onConfirm,
}: TicketRowProps) {
  const actionButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const confirmOpen = confirming && action !== "none";
  useConfirmFocus(confirmOpen, keepButton, actionButton);

  const state = ticket.status === "void" ? "Void" : "Valid";
  const gate = ticket.admitted_gate ? ` at ${ticket.admitted_gate}` : "";
  const inAt = ticket.admitted_at ? ` · In${gate}` : "";
  const actionable = action !== "none";
  return (
    <li className="bg-px-surface border-px-rule flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-lg font-semibold">
          {ticket.printed_number}
        </p>
        <p className="text-sm">{`${state}${inAt}`}</p>
        {actionable && !confirming ? (
          <button
            className={BUTTON_SECONDARY}
            onClick={onAsk}
            ref={actionButton}
            type="button"
          >
            {action === "void" ? "Void ticket" : "Restore ticket"}
          </button>
        ) : null}
      </div>
      {confirmOpen ? (
        <section
          aria-label={`Confirm for ticket ${ticket.printed_number}`}
          className="flex flex-col gap-3"
        >
          <p className="text-base">
            {confirmQuestion(action, ticket.printed_number)}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={BUTTON_PRIMARY}
              disabled={busy}
              onClick={() => onConfirm(action)}
              type="button"
            >
              {CONFIRM_WORDS[action]}
            </button>
            <button
              className={BUTTON_SECONDARY}
              onClick={onKeep}
              ref={keepButton}
              type="button"
            >
              Keep it as it is
            </button>
          </div>
        </section>
      ) : null}
    </li>
  );
}

interface TicketsSectionProps {
  readonly closed: boolean;
  readonly eventId: string;
  readonly onAnnounce: (text: string) => void;
  readonly onChanged: () => void;
  readonly organisation: PrintixOrganiserOrganisation;
  readonly session: OrganiserSession;
}

/**
 * The event's tickets, by printed number. Barcodes are never shown or sent back.
 * Void and restore each take a confirm step, and both are refused once the event
 * is closed. Organisers only.
 */
export function TicketsSection({
  session,
  organisation,
  eventId,
  closed,
  onChanged,
  onAnnounce,
}: TicketsSectionProps) {
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = useCallback(() => {
    latest.current += 1;
    const request = latest.current;
    listTickets(session, organisation.id, eventId, page).then((outcome) => {
      if (request !== latest.current) {
        return;
      }
      setList(
        outcome.ok
          ? {
              kind: "list",
              items: outcome.value.items,
              total: outcome.value.total,
              page,
            }
          : { kind: "problem", problem: outcome.problem }
      );
    });
  }, [session, organisation.id, eventId, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function change(
    ticket: PrintixTicketPublic,
    action: "void" | "restore"
  ) {
    setBusy(true);
    setProblem(null);
    const outcome =
      action === "void"
        ? await voidTicket(session, organisation.id, ticket.id)
        : await restoreTicket(session, organisation.id, ticket.id);
    setBusy(false);
    setConfirming(null);
    if (outcome.ok) {
      load();
      onChanged();
      onAnnounce(
        action === "void"
          ? `Ticket ${ticket.printed_number} is void.`
          : `Ticket ${ticket.printed_number} is valid again.`
      );
    } else {
      setProblem(outcome.problem);
    }
  }

  const lastPage =
    list.kind === "list"
      ? Math.max(1, Math.ceil(list.total / TICKETS_PAGE_SIZE))
      : 1;

  return (
    <section aria-labelledby="tickets-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold" id="tickets-title">
          Tickets
        </h3>
        <p className="text-px-muted text-sm">
          Printed numbers only. Barcodes are not shown here.
        </p>
      </div>

      {closed ? (
        <p className={NOTE} role="status">
          This event is closed, so tickets cannot change.
        </p>
      ) : null}

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {list.kind === "loading" ? (
        <p className="text-px-muted text-base" role="status">
          Loading tickets…
        </p>
      ) : null}

      {list.kind === "problem" ? (
        <button className={BUTTON_SECONDARY} onClick={load} type="button">
          Try again
        </button>
      ) : null}

      {list.kind === "list" && list.total === 0 ? (
        <p className={NOTE}>
          No tickets yet. Import the printer&apos;s list below.
        </p>
      ) : null}

      {list.kind === "list" && list.items.length > 0 ? (
        <>
          <p className="text-px-muted text-sm tabular-nums">
            {number.format(list.total)} tickets, page {list.page} of {lastPage}
          </p>
          <ul className="flex flex-col gap-3">
            {list.items.map((ticket) => (
              <TicketRow
                action={ticketAction(ticket, closed)}
                busy={busy}
                confirming={confirming === ticket.id}
                key={ticket.id}
                onAsk={() => setConfirming(ticket.id)}
                onConfirm={(action) => change(ticket, action)}
                onKeep={() => setConfirming(null)}
                ticket={ticket}
              />
            ))}
          </ul>
          <nav
            aria-label="Ticket pages"
            className="flex items-center justify-between gap-3"
          >
            <button
              className={BUTTON_SECONDARY}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className={BUTTON_SECONDARY}
              disabled={page >= lastPage}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next
            </button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
