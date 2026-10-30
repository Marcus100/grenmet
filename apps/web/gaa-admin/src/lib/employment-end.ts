import type { EmploymentStatus } from "@barrelsgd/api-client";
import { hrApiErrorMessage } from "@/components/hr/api-error";

/**
 * Plain-language rules for an employment's last day and department transfers
 * (#797). The API is the authority: these helpers only decide what the form
 * shows and when it asks for confirmation. `today` is always passed in (the
 * Grenada calendar date) so the rules stay deterministic in tests.
 */

export const END_DATE_EXPLANATION =
  "Roles end at midnight after this day. Access to everything except basic staff self-service stops then.";

export const DEPARTMENT_TRANSFER_WARNING =
  "Warning: all of this person's roles in the organisation end and must be granted again in the new department.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRAILING_DOT = /\.$/;

const LAST_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export type EndDateState = "none" | "upcoming" | "today" | "passed";

/** Where a stored last day sits relative to today (both YYYY-MM-DD, Grenada). */
export function endDateState(
  endDate: string | null | undefined,
  today: string
): EndDateState {
  if (!endDate) return "none";
  if (endDate === today) return "today";
  return endDate < today ? "passed" : "upcoming";
}

/** "2026-11-15" becomes "15 Nov 2026". Built in UTC so the calendar date never shifts. */
export function formatLastDay(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) return isoDate;
  // The regex above guarantees three numeric parts; the defaults only satisfy the type checker.
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return LAST_DAY_FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Client-side mirror of the API rule: the last day cannot precede the start date. */
export function lastDayError(
  endDate: string,
  startDate: string | null | undefined
): string | null {
  if (endDate && startDate && endDate < startDate) {
    return `The last day cannot be before the start date (${formatLastDay(startDate)}).`;
  }
  return null;
}

export interface EmploymentChangeInput {
  current: { departmentId: string; endDate: string | null };
  next: {
    departmentId: string;
    endDate: string | null;
    status: EmploymentStatus;
  };
  today: string;
}

export interface EmploymentChangeReview {
  /** Plain sentences the confirmation step shows before anything is saved. */
  confirmationLines: string[];
  /** The department differs from the saved record, so every role ends. */
  departmentMoves: boolean;
  endDateChanged: boolean;
  /** A new last day that is today or earlier, so access stops tonight or has already stopped. */
  endsNow: boolean;
  requiresConfirmation: boolean;
}

/** Decides what the form must confirm before it saves an employment change. */
export function reviewEmploymentChange({
  current,
  next,
  today,
}: EmploymentChangeInput): EmploymentChangeReview {
  const departmentMoves = next.departmentId !== current.departmentId;
  const endDateChanged = next.endDate !== current.endDate;
  const endsNow =
    endDateChanged && next.endDate !== null && next.endDate <= today;

  const confirmationLines: string[] = [];
  if (departmentMoves) confirmationLines.push(DEPARTMENT_TRANSFER_WARNING);
  if (endsNow && next.endDate) {
    confirmationLines.push(
      next.endDate === today
        ? "Last day is today. Access to everything except basic staff self-service stops at midnight tonight."
        : `Last day ${formatLastDay(next.endDate)} has already passed. Access to everything except basic staff self-service stops straight away.`
    );
    if (next.status === "ACTIVE") {
      confirmationLines.push(
        "The nightly update then sets the status to Terminated."
      );
    }
  }

  return {
    confirmationLines,
    departmentMoves,
    endDateChanged,
    endsNow,
    requiresConfirmation: confirmationLines.length > 0,
  };
}

export interface EmploymentSaveFailure {
  message: string;
  /** True for failures the API did not explain; the caller reports these. */
  unexpected: boolean;
}

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    return typeof error.status === "number" ? error.status : undefined;
  }
  return undefined;
}

function apiDetail(error: unknown): string | null {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (
      data &&
      typeof data === "object" &&
      "detail" in data &&
      typeof data.detail === "string"
    ) {
      return data.detail;
    }
  }
  return null;
}

/**
 * Plain words for a failed employment save. The API refuses these changes
 * before it writes anything (403 authority, 400 business rule), so the form
 * can say that nothing was saved and show the API's own reason.
 */
export function employmentSaveFailure(error: unknown): EmploymentSaveFailure {
  const status = statusOf(error);
  if (status === 400 || status === 403) {
    const fallback =
      status === 403
        ? "You do not have permission to make this change"
        : "This change is not allowed";
    const detail = apiDetail(error) ?? fallback;
    return {
      message: `${detail.replace(TRAILING_DOT, "")}. Nothing was saved.`,
      unexpected: false,
    };
  }
  if (status === 422) {
    return {
      message: `${hrApiErrorMessage(error).replace(TRAILING_DOT, "")}. Nothing was saved.`,
      unexpected: false,
    };
  }
  if (status === 404) {
    return {
      message:
        "This employment record could not be found. Refresh the page and try again.",
      unexpected: false,
    };
  }
  return {
    message: "Something went wrong and nothing was saved. Try again.",
    unexpected: true,
  };
}
