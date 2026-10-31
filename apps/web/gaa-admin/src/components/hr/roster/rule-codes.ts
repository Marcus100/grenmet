import type {
  RosterRuleWarningsErrorPublic,
  RuleViolationPublic,
} from "@barrelsgd/api-client";

/** Plain-language titles for roster rule codes (#380). */
export const RULE_TITLE: Record<string, string> = {
  MAX_CONSECUTIVE_DAYS: "Too many consecutive shifts",
  DAYS_OFF_AFTER_RUN: "Too few days off after a run of shifts",
  MAX_DAILY_HOURS: "Daily hours over limit",
  MAX_WEEKLY_HOURS: "Weekly hours over limit",
  WEEKEND_OFF: "Weekends off not met",
  WEEKDAY_PATTERN: "Weekend shift on a Monday-to-Friday pattern",
  SHORT_NOTICE: "Less than the required notice",
  // Retired rule (no minimum-rest rule since #380); kept for old snapshots.
  MIN_REST: "Short rest between shifts",
};

/** "1 roster rule warning" / "3 roster rule warnings". */
export function warningCountText(count: number): string {
  return `${count} roster rule ${count === 1 ? "warning" : "warnings"}`;
}

export function ruleTitle(code: string): string {
  return RULE_TITLE[code] ?? code;
}

export function violationDates(violation: RuleViolationPublic): string {
  return violation.end_date === violation.start_date
    ? violation.start_date
    : `${violation.start_date} to ${violation.end_date}`;
}

function isWarnings(data: unknown): data is RosterRuleWarningsErrorPublic {
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "ROSTER_RULE_WARNINGS" &&
    "violations" in data &&
    Array.isArray(data.violations)
  );
}

/**
 * The roster rule warnings in a failed request (409), or null for any other
 * error. The caller shows them and resends with a supervisor's reason.
 */
export function ruleWarningsFrom(
  error: unknown
): RosterRuleWarningsErrorPublic | null {
  if (!error || typeof error !== "object") return null;
  if ("status" in error && error.status !== 409) return null;
  const data = "data" in error ? error.data : error;
  return isWarnings(data) ? data : null;
}
