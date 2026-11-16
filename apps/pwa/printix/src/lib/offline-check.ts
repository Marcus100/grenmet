import { printixScanOutcome } from "@barrelsgd/api-client";
import type { ListMeta, StoredTicket } from "@/lib/offline-store";
import {
  ADMITTED_DISMISS_MS,
  formatTime,
  type Source,
  type Verdict,
  verdictFor,
} from "@/lib/scan-outcome";

/**
 * What the phone decides about a ticket with no signal, from its saved list.
 * The wording matches the live answers wherever the meaning is the same, and
 * says "no signal" wherever the phone knows less than the server would.
 */
export type OfflineDecision =
  /** Let the person in and queue the admission for the server. */
  | { readonly kind: "admit"; readonly verdict: Verdict }
  /** Refuse, or explain why nothing could be checked. */
  | { readonly kind: "refuse"; readonly verdict: Verdict };

const NOT_SENT = "No signal: this phone will send it when the signal is back.";

function refuse(verdict: Verdict): OfflineDecision {
  return { kind: "refuse", verdict };
}

/** Typed numbers are never checked offline (ADR-0060, offline amendment). */
export const TYPED_OFFLINE_VERDICT: Verdict = {
  tone: "unchecked",
  title: "No signal: typed numbers cannot be checked",
  detail:
    "With no signal this phone checks barcodes only. Scan the barcode, or use the paper list.",
  autoDismissMs: null,
  pairingProblem: null,
  sound: "refused",
};

function alreadyHere(ticket: StoredTicket): Verdict {
  const time = ticket.admittedAt ? formatTime(ticket.admittedAt) : null;
  return {
    tone: "refused",
    title: "Already admitted",
    detail: time
      ? `Admitted on this phone at ${time}, with no signal.`
      : "Admitted on this phone, with no signal.",
    autoDismissMs: null,
    pairingProblem: null,
    sound: "refused",
  };
}

export function decideOffline(
  ticket: StoredTicket | undefined,
  meta: ListMeta,
  source: Source
): OfflineDecision {
  if (source === "typed") {
    return refuse(TYPED_OFFLINE_VERDICT);
  }
  if (meta.eventStatus === "closed") {
    return refuse(
      verdictFor(
        {
          kind: "checked",
          result: { outcome: printixScanOutcome.event_closed },
        },
        source
      )
    );
  }
  if (!ticket) {
    return refuse({
      tone: "refused",
      title: "Not on the ticket list",
      detail:
        "This barcode is not on this phone's ticket list. Check the ticket is for this event, or scan again where there is signal.",
      autoDismissMs: null,
      pairingProblem: null,
      sound: "refused",
    });
  }
  if (ticket.state === "void") {
    return refuse(
      verdictFor(
        {
          kind: "checked",
          result: {
            outcome: printixScanOutcome.void,
            printed_number: ticket.printedNumber,
          },
        },
        source
      )
    );
  }
  if (ticket.state === "admitted") {
    return refuse(
      ticket.admittedHere
        ? alreadyHere(ticket)
        : verdictFor(
            {
              kind: "checked",
              result: {
                outcome: printixScanOutcome.already_admitted,
                printed_number: ticket.printedNumber,
                admitted_at: ticket.admittedAt,
                admitted_gate: ticket.admittedGate,
              },
            },
            source
          )
    );
  }
  return {
    kind: "admit",
    verdict: {
      tone: "admitted",
      title: "Admitted",
      detail: `Ticket ${ticket.printedNumber} admitted. ${NOT_SENT}`,
      autoDismissMs: ADMITTED_DISMISS_MS,
      pairingProblem: null,
      sound: "admitted",
    },
  };
}

/** The words for one conflict, as staff read them in the conflicts list. */
export function conflictText(conflict: {
  readonly admittedAt: string | null;
  readonly admittedGate: string | null;
  readonly outcome: string;
  readonly printedNumber: string;
}): string {
  const ticket = `Ticket ${conflict.printedNumber}`;
  switch (conflict.outcome) {
    case printixScanOutcome.already_admitted: {
      const time = conflict.admittedAt ? formatTime(conflict.admittedAt) : null;
      const gate = conflict.admittedGate?.trim();
      if (time && gate) {
        return `${ticket}: also admitted at ${gate} at ${time}.`;
      }
      return time
        ? `${ticket}: also admitted elsewhere at ${time}.`
        : `${ticket}: also admitted elsewhere.`;
    }
    case printixScanOutcome.void:
      return `${ticket}: the ticket is void.`;
    case printixScanOutcome.event_closed:
      return `${ticket}: scanned after the event closed.`;
    case printixScanOutcome.unknown:
      return `${ticket}: not recognised by the server.`;
    default:
      return `${ticket}: not recorded by the server.`;
  }
}
