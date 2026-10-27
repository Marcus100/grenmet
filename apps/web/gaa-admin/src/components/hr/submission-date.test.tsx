import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { formatSubmissionDate } from "./submission-date";
import {
  EMPTY_TIMESHEET,
  TimesheetDocument,
} from "./timesheet/timesheet-document";

afterEach(cleanup);
const submission = {
  status: "SUBMITTED",
  submitted_at: "2026-09-07T02:30:00Z",
};
describe("HR submission dates", () => {
  it("uses the Grenada calendar date and preserves missing historical dates", () => {
    expect(formatSubmissionDate(submission)).toBe("06 Sept 2026");
    expect(formatSubmissionDate({ status: "DRAFT" })).toBe("Not submitted");
    expect(formatSubmissionDate({ status: "APPROVED" })).toBe("Not recorded");
    expect(
      formatSubmissionDate({ status: "SUBMITTED", submitted_at: "invalid" })
    ).toBe("Not recorded");
  });
  it("prints the saved date on the timesheet", () => {
    render(
      <TimesheetDocument submission={submission} values={EMPTY_TIMESHEET} />
    );
    expect(screen.getByText("06 Sept 2026")).toBeInTheDocument();
  });
  it("marks an unsaved timesheet as not submitted", () => {
    render(<TimesheetDocument values={EMPTY_TIMESHEET} />);
    expect(screen.getByText("Not submitted")).toBeInTheDocument();
  });
});
