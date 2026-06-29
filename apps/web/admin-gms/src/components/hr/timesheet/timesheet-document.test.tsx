import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EMPTY_TIMESHEET,
  TimesheetDocument,
  type TimesheetValues,
} from "./timesheet-document";

describe("TimesheetDocument", () => {
  it("renders the official header and every column label", () => {
    render(<TimesheetDocument values={EMPTY_TIMESHEET} />);

    expect(
      screen.getByRole("heading", { name: "OFFICIAL TIME SHEET" })
    ).toBeInTheDocument();
    for (const label of ["DATE", "NAME", "ROSTER HRS", "REMARKS"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders entered rows and pads the table to a full page", () => {
    const values: TimesheetValues = {
      department: "Meteorology",
      period: "Wk 26",
      rows: [
        {
          id: "r1",
          date: "2026-06-15",
          name: "E. White",
          rosterHours: "8",
          actualHours: "8",
          totalHours: "8",
          breakHours: "1",
          hoursWorked: "7",
          remarks: "",
        },
      ],
    };

    render(<TimesheetDocument values={values} />);

    expect(screen.getByText("Meteorology")).toBeInTheDocument();
    expect(screen.getByText("E. White")).toBeInTheDocument();
    // 1 header row + 16 body rows (1 entered + 15 blanks padded to MIN_ROWS).
    expect(screen.getAllByRole("row")).toHaveLength(17);
  });
});
