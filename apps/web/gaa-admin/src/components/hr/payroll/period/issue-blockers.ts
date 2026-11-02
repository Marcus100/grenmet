import type { PaySummaryPublic } from "@barrelsgd/api-client";

export interface IssueBlocker {
  /** What is stopping the period being issued, in plain words. */
  message: string;
  /** Who can fix it, and where. */
  whoCanFix: string;
}

export interface IssueBlockerInput {
  canApprove: boolean;
  preparedByCaller: boolean;
  status: string;
  summary: PaySummaryPublic;
}

const LOCKED = new Set(["APPROVED", "EXPORTED", "CLOSED"]);
const STATUTORY_CATEGORIES = new Set(["INCOME_TAX", "SOCIAL_INSURANCE"]);

function employeesWithShortfall(summary: PaySummaryPublic): number {
  return summary.employees.filter((employee) => employee.shortfall_minor > 0)
    .length;
}

function unpricedLines(summary: PaySummaryPublic): number {
  return summary.employees.reduce(
    (sum, employee) => sum + employee.unpriced_line_count,
    0
  );
}

function hasStatutoryDeduction(summary: PaySummaryPublic): boolean {
  return summary.employees.some((employee) =>
    employee.deductions.some((line) => STATUTORY_CATEGORIES.has(line.category))
  );
}

/**
 * Everything that stops issue approval, mirroring the API's refusals so the
 * person sees each reason before pressing the button. The API still decides.
 */
export function issueBlockers(input: IssueBlockerInput): IssueBlocker[] {
  if (input.summary.issue_approved_at) {
    return [];
  }
  const blockers: IssueBlocker[] = [];
  if (!LOCKED.has(input.status)) {
    blockers.push({
      message: "The period's quantities are not approved yet.",
      whoCanFix:
        input.status === "OPEN"
          ? "The preparer submits the period, then a second person with approval permission approves it on this page."
          : "A second person with approval permission approves it on this page.",
    });
  }
  if (input.preparedByCaller) {
    blockers.push({
      message: "You prepared this period, so you cannot approve it for issue.",
      whoCanFix: "Another person with approval permission approves it.",
    });
  }
  for (const code of input.summary.blocking_tables) {
    blockers.push({
      message: `The ${code} table is still provisional.`,
      whoCanFix:
        "Someone other than its creator, with the tables permission, confirms it under Tax and deductions. Then refresh the table state here.",
    });
  }
  const short = employeesWithShortfall(input.summary);
  if (short > 0) {
    blockers.push({
      message: `Deductions are more than gross pay for ${short} employee${short === 1 ? "" : "s"}.`,
      whoCanFix:
        "Someone with the rates permission corrects the deductions or pay under Tax and deductions or Pay rates.",
    });
  }
  const unpriced = unpricedLines(input.summary);
  if (unpriced > 0) {
    blockers.push({
      message: `${unpriced} pay line${unpriced === 1 ? " has" : "s have"} no rate.`,
      whoCanFix:
        "Someone with the rates permission adds the missing basic pay or item rate under Pay rates.",
    });
  }
  if (
    input.summary.employees.length > 0 &&
    !hasStatutoryDeduction(input.summary)
  ) {
    blockers.push({
      message:
        "No income tax or social insurance was calculated for this period.",
      whoCanFix:
        "Set up the tables under Tax and deductions, then recompute the period while it is open.",
    });
  }
  if (!input.canApprove) {
    blockers.push({
      message:
        "You do not have the approval permission, so you cannot approve it for issue.",
      whoCanFix:
        "The owner assigns the approval permission to you or another approver.",
    });
  }
  return blockers;
}
