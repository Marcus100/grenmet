// Plain-language wording and small calculations for the organiser dashboard.
// Pure, so every sentence is covered by a test. Times are Grenada time. "Now" is
// always the server's own clock (`generated_at`), so a phone with a wrong clock
// cannot make a gate look quiet or a scan look old.

import type {
  PrintixArrivalBucket,
  PrintixEventAnalytics,
  PrintixGatePhone,
  PrintixScanItem,
} from "@barrelsgd/api-client";
import { EVENT_TIME_ZONE } from "@/organiser/format";

/** A gate phone with no scan for this long, during an open event, is flagged. */
export const QUIET_AFTER_MINUTES = 15;

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: EVENT_TIME_ZONE,
});

const secondsFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: EVENT_TIME_ZONE,
});

const number = new Intl.NumberFormat();

export function count(value: number): string {
  return number.format(value);
}

/** "20:14", in Grenada time. */
export function timeOf(iso: string): string {
  return clockFormat.format(new Date(iso));
}

/** "20:14:05", in Grenada time. */
export function timeWithSeconds(iso: string): string {
  return secondsFormat.format(new Date(iso));
}

/** A share between 0 and 1 as a whole percentage ("17%"). */
export function percent(share: number | null | undefined): string {
  if (share === null || share === undefined) {
    return "none yet";
  }
  return `${Math.round(share * 100)}%`;
}

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

/** A length of time in the largest sensible units ("1 hour 5 minutes"). */
export function durationWords(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) {
    return plural(seconds, "second", "seconds");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return plural(minutes, "minute", "minutes");
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = plural(hours, "hour", "hours");
  return rest === 0
    ? hourText
    : `${hourText} ${plural(rest, "minute", "minutes")}`;
}

/** Whole seconds from `thenIso` to `nowIso`, never negative. */
export function secondsBetween(thenIso: string, nowIso: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(nowIso).getTime() - new Date(thenIso).getTime()) / 1000
    )
  );
}

/** "3 minutes ago", or "just now" under a minute. */
export function agoWords(thenIso: string, nowIso: string): string {
  const seconds = secondsBetween(thenIso, nowIso);
  return seconds < 60 ? "just now" : `${durationWords(seconds)} ago`;
}

/** How long a phone has been quiet, in whole minutes; null if it is not flagged. */
export function quietMinutes(
  phone: PrintixGatePhone,
  generatedAt: string,
  eventOpen: boolean
): number | null {
  if (!(eventOpen && phone.active)) {
    return null;
  }
  if (phone.last_scan_at === null || phone.last_scan_at === undefined) {
    return null;
  }
  const minutes = Math.floor(
    secondsBetween(phone.last_scan_at, generatedAt) / 60
  );
  return minutes >= QUIET_AFTER_MINUTES ? minutes : null;
}

export const REFUSAL_WORDS: Record<
  string,
  { readonly label: string; readonly hint: string }
> = {
  already_admitted: {
    label: "Already in",
    hint: "The ticket was scanned before and the person had been let in.",
  },
  void: {
    label: "Void ticket",
    hint: "An organiser voided the ticket.",
  },
  unknown: {
    label: "Not recognised",
    hint: "A ticket that is not on this event (including another event's ticket), or a typed number at a gate where typing is not allowed.",
  },
  event_closed: {
    label: "Event closed",
    hint: "Scanned after the event closed.",
  },
};

export function refusalLabel(reason: string): string {
  return REFUSAL_WORDS[reason]?.label ?? reason;
}

/** What happened to one scan, in the words a person reads. */
export function outcomeWords(outcome: PrintixScanItem["outcome"]): string {
  switch (outcome) {
    case "admitted":
      return "Let in";
    case "already_admitted":
      return "Refused, already in";
    case "void":
      return "Refused, void ticket";
    case "unknown":
      return "Refused, not recognised";
    case "event_closed":
      return "Refused, event closed";
    default:
      return outcome;
  }
}

export function entryWords(scan: PrintixScanItem): string {
  const how = scan.typed ? "typed" : "scanned";
  return scan.offline ? `${how}, sent late` : how;
}

/** The ticket number as printed, or a plain sentence when no ticket matched. */
export function numberWords(scan: PrintixScanItem): string {
  return scan.printed_number ?? "no ticket matched";
}

/** The chart's text summary: the same facts as the bars, in a sentence or two. */
export function arrivalsSummary(
  analytics: Pick<
    PrintixEventAnalytics,
    | "admitted"
    | "first_admission_at"
    | "last_admission_at"
    | "busiest_5_minutes"
  >
): string {
  const {
    admitted,
    first_admission_at: first,
    last_admission_at: last,
  } = analytics;
  if (admitted === 0 || !first || !last) {
    return "No one has been let in yet. The chart fills in as people arrive.";
  }
  const span = durationWords(secondsBetween(first, last));
  const peak = analytics.busiest_5_minutes;
  const people = plural(admitted, "person", "people");
  const base = `${people} let in, from ${timeOf(first)} to ${timeOf(last)} (${span}).`;
  return peak
    ? `${base} The busiest five minutes began at ${timeOf(peak.starts_at)}, with ${plural(peak.admitted, "person", "people")}.`
    : base;
}

/** Index of the first bar with the most people, or -1 if every bar is empty. */
export function peakIndex(arrivals: readonly PrintixArrivalBucket[]): number {
  let best = -1;
  let most = 0;
  arrivals.forEach((bucket, index) => {
    if (bucket.admitted > most) {
      most = bucket.admitted;
      best = index;
    }
  });
  return best;
}

export function scanListFileName(eventDate: string): string {
  return `printix-scans-${eventDate}.csv`;
}

export interface PhoneNote {
  /** True when the phone has been quiet too long and someone should look at it. */
  readonly flagged: boolean;
  readonly key: string;
  readonly text: string;
}

/** One sentence about a gate phone, or none when there is nothing worth saying. */
export function phoneNote(
  phone: PrintixGatePhone,
  position: { readonly many: boolean; readonly number: number },
  generatedAt: string,
  eventOpen: boolean
): PhoneNote | null {
  const who = position.many ? `Phone ${position.number}` : "This phone";
  const quiet = quietMinutes(phone, generatedAt, eventOpen);
  if (quiet !== null) {
    return {
      flagged: true,
      key: phone.id,
      text: `${who} has not scanned for ${quiet} minutes. Check it.`,
    };
  }
  const ended = phone.active ? "" : ", gate code no longer active";
  if (position.many) {
    const last = phone.last_scan_at
      ? `last scan ${timeOf(phone.last_scan_at)}`
      : "no scan yet";
    return { flagged: false, key: phone.id, text: `${who}: ${last}${ended}.` };
  }
  return phone.active
    ? null
    : {
        flagged: false,
        key: phone.id,
        text: "This gate code is no longer active.",
      };
}
