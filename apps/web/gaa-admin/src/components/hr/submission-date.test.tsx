import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AbsenteeDocument, EMPTY_ABSENTEE } from "./absentee/absentee-document";
import { EMPTY_LEAVE, LeaveDocument } from "./leave/leave-document";
import {
  EMPTY_SHIFT,
  ShiftExchangeDocument,
} from "./shift/shift-exchange-document";
import {
  DailyStatusDocument,
  EMPTY_DAILY_STATUS,
} from "./status/daily-status-document";
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
  it.each([
    [
      "leave",
      <LeaveDocument
        key="leave"
        submission={submission}
        values={EMPTY_LEAVE}
      />,
    ],
    [
      "shift",
      <ShiftExchangeDocument
        key="shift"
        submission={submission}
        values={EMPTY_SHIFT}
      />,
    ],
    [
      "absentee",
      <AbsenteeDocument
        key="absentee"
        submission={submission}
        values={EMPTY_ABSENTEE}
      />,
    ],
    [
      "status",
      <DailyStatusDocument
        key="status"
        submission={submission}
        values={EMPTY_DAILY_STATUS}
      />,
    ],
    [
      "timesheet",
      <TimesheetDocument
        key="timesheet"
        submission={submission}
        values={EMPTY_TIMESHEET}
      />,
    ],
  ])("prints the saved date on %s", (_name, document) => {
    render(document);
    expect(screen.getByText("06 Sept 2026")).toBeInTheDocument();
  });
  it("marks an unsaved document as not submitted", () => {
    render(<LeaveDocument values={EMPTY_LEAVE} />);
    expect(screen.getByText("Not submitted")).toBeInTheDocument();
  });
});
