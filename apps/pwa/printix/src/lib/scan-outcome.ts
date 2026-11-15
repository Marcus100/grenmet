import {
  type PrintixScanResult,
  printixScanOutcome,
} from "@barrelsgd/api-client";
import type { PairingProblem, ScanAnswer } from "@/lib/scan-api";

/**
 * admitted: the server said yes. refused: the server said no. unchecked: no
 * answer was obtained, so nobody may be let in on this screen. pairing: this
 * phone's pairing is the problem, not the ticket.
 */
export type Tone = "admitted" | "refused" | "unchecked" | "pairing";

/** Where the value came from: a camera read, or a number a person typed. */
export type Source = "camera" | "typed";

export interface Verdict {
  /** Admitted clears itself after this long; everything else waits for a tap. */
  readonly autoDismissMs: number | null;
  readonly detail: string;
  readonly pairingProblem: PairingProblem | null;
  readonly sound: "admitted" | "refused" | null;
  readonly title: string;
  readonly tone: Tone;
}

export const ADMITTED_DISMISS_MS = 1000;

/** Local time of day, so staff read the time they are standing in. */
export function formatTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function verdict(
  fields: Omit<Verdict, "pairingProblem"> & {
    pairingProblem?: PairingProblem;
  }
): Verdict {
  return { pairingProblem: null, ...fields };
}

function admittedVerdict(result: PrintixScanResult): Verdict {
  return verdict({
    tone: "admitted",
    title: "Admitted",
    detail: result.printed_number
      ? `Ticket ${result.printed_number} admitted.`
      : "Ticket admitted.",
    autoDismissMs: ADMITTED_DISMISS_MS,
    sound: "admitted",
  });
}

function alreadyAdmittedVerdict(result: PrintixScanResult): Verdict {
  const time = result.admitted_at ? formatTime(result.admitted_at) : null;
  const gate = result.admitted_gate?.trim() || null;
  let detail = "Already admitted. The time was not recorded.";
  if (time) {
    detail = gate
      ? `Admitted at ${time} through ${gate}.`
      : `Admitted at ${time}. The gate was not recorded.`;
  }
  return verdict({
    tone: "refused",
    title: "Already admitted",
    detail,
    autoDismissMs: null,
    sound: "refused",
  });
}

function unknownVerdict(source: Source): Verdict {
  return verdict({
    tone: "refused",
    title: source === "typed" ? "Not on this event" : "Not a ticket",
    detail:
      source === "typed"
        ? "This number is not a ticket for this event. Check the number. If it is right, typed numbers may be off for this phone."
        : "This barcode is not a ticket for this event. Check the ticket is for this event.",
    autoDismissMs: null,
    sound: "refused",
  });
}

function scanResultVerdict(result: PrintixScanResult, source: Source): Verdict {
  switch (result.outcome) {
    case printixScanOutcome.admitted:
      return admittedVerdict(result);
    case printixScanOutcome.already_admitted:
      return alreadyAdmittedVerdict(result);
    case printixScanOutcome.void:
      return verdict({
        tone: "refused",
        title: "Void ticket",
        detail: "This ticket is void. Do not admit it.",
        autoDismissMs: null,
        sound: "refused",
      });
    case printixScanOutcome.unknown:
      return unknownVerdict(source);
    case printixScanOutcome.event_closed:
      return verdict({
        tone: "refused",
        title: "Event closed",
        detail: "This event has closed. Do not admit anyone.",
        autoDismissMs: null,
        sound: "refused",
      });
    default:
      // A code this build does not know is not a yes.
      return verdict({
        tone: "unchecked",
        title: "Could not check this ticket",
        detail: "The answer was not one this scanner understands. Scan again.",
        autoDismissMs: null,
        sound: "refused",
      });
  }
}

/** The words for a pairing that cannot check tickets. Shared with the pairing screen. */
export const PAIRING_COPY: Record<
  PairingProblem,
  { title: string; detail: string }
> = {
  "not-recognised": {
    title: "Pairing not recognised",
    detail:
      "This phone's pairing is not recognised. Ask your administrator for a new pairing code.",
  },
  "revoked-or-expired": {
    title: "Pairing no longer valid",
    detail:
      "This pairing has been revoked or has expired. Ask your administrator for a new pairing code.",
  },
};

/** "1 second" or "45 seconds": the wait text a person reads at the gate. */
export function waitText(seconds: number): string {
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}

function failureVerdict(
  failure: Exclude<ScanAnswer, { kind: "checked" }>
): Verdict {
  switch (failure.kind) {
    case "pairing":
      return verdict({
        tone: "pairing",
        ...PAIRING_COPY[failure.problem],
        autoDismissMs: null,
        sound: null,
        pairingProblem: failure.problem,
      });
    case "rate-limited":
      return verdict({
        tone: "refused",
        title: "Too many scans",
        detail: `Wait ${waitText(failure.retryAfterSeconds)}, then scan again.`,
        autoDismissMs: null,
        sound: "refused",
      });
    case "rejected":
      return verdict({
        tone: "unchecked",
        title: "Value not read",
        detail:
          "The value could not be sent. Scan the ticket again, or type its number.",
        autoDismissMs: null,
        sound: "refused",
      });
    case "no-signal":
      return verdict({
        tone: "unchecked",
        title: "No signal: cannot check tickets",
        detail:
          "Nothing has been checked. Move to where there is signal, then scan again.",
        autoDismissMs: null,
        sound: "refused",
      });
    case "failed":
      return verdict({
        tone: "unchecked",
        title: "Could not check this ticket",
        detail:
          "The server did not answer properly. Nothing has been checked. Scan again.",
        autoDismissMs: null,
        sound: "refused",
      });
    default:
      return failure satisfies never;
  }
}

/** The screen text and sound for one answer. Pure: every outcome is tested. */
export function verdictFor(answer: ScanAnswer, source: Source): Verdict {
  if (answer.kind === "checked") {
    return scanResultVerdict(answer.result, source);
  }
  return failureVerdict(answer);
}
