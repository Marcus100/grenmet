import type { EmploymentStatus } from "@barrelsgd/api-client";

/**
 * Employment status in words, with the badge tone for the HR app. The tone is
 * always paired with a text label, so colour is never the only signal.
 */
export const EMPLOYMENT_STATUS: Record<
  EmploymentStatus,
  {
    label: string;
    variant: "solid-success" | "solid-warning" | "solid-light";
  }
> = {
  ACTIVE: { label: "Active", variant: "solid-success" },
  INACTIVE: { label: "Inactive", variant: "solid-warning" },
  TERMINATED: { label: "Terminated", variant: "solid-light" },
};

/**
 * Upper-case codes become plain words: `PROFESSIONAL_APPOINTMENT` reads as
 * "Professional appointment". Unknown codes still show, never hidden.
 */
export function codeLabel(code: string): string {
  const words = code.replace(/_/gu, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A balance in days, in words: "1 day", "12.5 days". The API sends a decimal
 * string, which is kept as sent when it is not a plain number.
 */
export function leaveBalanceWords(balanceDays: string): string {
  const value = Number(balanceDays);
  if (!Number.isFinite(value) || balanceDays.trim() === "") {
    return `${balanceDays} days`;
  }
  const shown = Number.isInteger(value) ? String(value) : balanceDays;
  return `${shown} ${value === 1 ? "day" : "days"}`;
}

/**
 * A calendar date (`YYYY-MM-DD`) in words. Formatted in UTC so the day never
 * shifts with the viewer's time zone.
 */
export function formatRecordDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Calm wording for an optional field the API left empty. */
export const NOT_SET = "Not set";

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  TEMPORARY: "Temporary",
};

export function employmentTypeLabel(employmentType: string | null | undefined) {
  if (!employmentType) return NOT_SET;
  return EMPLOYMENT_TYPE_LABEL[employmentType] ?? codeLabel(employmentType);
}
