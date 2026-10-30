import { describe, expect, it } from "vitest";
import {
  DEPARTMENT_TRANSFER_WARNING,
  employmentSaveFailure,
  endDateState,
  formatLastDay,
  lastDayError,
  reviewEmploymentChange,
} from "./employment-end";

const TODAY = "2026-10-30";

function review(
  overrides: {
    departmentId?: string;
    currentEnd?: string | null;
    nextEnd?: string | null;
    status?: "ACTIVE" | "INACTIVE" | "TERMINATED";
  } = {}
) {
  return reviewEmploymentChange({
    current: {
      departmentId: "dept_met",
      endDate: overrides.currentEnd ?? null,
    },
    next: {
      departmentId: overrides.departmentId ?? "dept_met",
      endDate: overrides.nextEnd ?? null,
      status: overrides.status ?? "ACTIVE",
    },
    today: TODAY,
  });
}

describe("endDateState", () => {
  it("classifies no date, upcoming, today and passed last days", () => {
    expect(endDateState(null, TODAY)).toBe("none");
    expect(endDateState(undefined, TODAY)).toBe("none");
    expect(endDateState("2026-11-15", TODAY)).toBe("upcoming");
    expect(endDateState(TODAY, TODAY)).toBe("today");
    expect(endDateState("2026-10-29", TODAY)).toBe("passed");
  });
});

describe("formatLastDay", () => {
  it("formats a stored date without shifting the calendar day", () => {
    expect(formatLastDay("2026-11-15")).toBe("15 Nov 2026");
    expect(formatLastDay("2026-01-01")).toBe("1 Jan 2026");
  });

  it("returns anything that is not a date unchanged", () => {
    expect(formatLastDay("soon")).toBe("soon");
  });
});

describe("lastDayError", () => {
  it("rejects a last day before the start date, with the start date in plain words", () => {
    expect(lastDayError("2019-12-31", "2020-01-01")).toBe(
      "The last day cannot be before the start date (1 Jan 2020)."
    );
  });

  it("accepts the start date itself, a later date, or no start date", () => {
    expect(lastDayError("2020-01-01", "2020-01-01")).toBeNull();
    expect(lastDayError("2026-01-01", "2020-01-01")).toBeNull();
    expect(lastDayError("2026-01-01", null)).toBeNull();
  });

  it("accepts an empty last day (no end date)", () => {
    expect(lastDayError("", "2020-01-01")).toBeNull();
  });
});

describe("reviewEmploymentChange", () => {
  it("asks for nothing when nothing that ends roles changes", () => {
    const result = review({ currentEnd: "2099-01-01", nextEnd: "2099-01-01" });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.endDateChanged).toBe(false);
  });

  it("asks for nothing when a future last day is set", () => {
    const result = review({ nextEnd: "2099-01-01" });
    expect(result.endDateChanged).toBe(true);
    expect(result.endsNow).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("asks for nothing when a last day is cleared", () => {
    const result = review({ currentEnd: "2099-01-01", nextEnd: null });
    expect(result.endDateChanged).toBe(true);
    expect(result.endsNow).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
  });

  it("requires confirmation when the last day is today, and says access stops at midnight tonight", () => {
    const result = review({ nextEnd: TODAY });
    expect(result.endsNow).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationLines).toContain(
      "Last day is today. Access to everything except basic staff self-service stops at midnight tonight."
    );
  });

  it("requires confirmation when the last day has passed, and says access stops straight away", () => {
    const result = review({ nextEnd: "2026-10-01" });
    expect(result.confirmationLines).toContain(
      "Last day 1 Oct 2026 has already passed. Access to everything except basic staff self-service stops straight away."
    );
  });

  it("warns that the nightly update will set an active person to Terminated", () => {
    const active = review({ nextEnd: TODAY, status: "ACTIVE" });
    expect(active.confirmationLines).toContain(
      "The nightly update then sets the status to Terminated."
    );
    const inactive = review({ nextEnd: TODAY, status: "INACTIVE" });
    expect(inactive.confirmationLines).not.toContain(
      "The nightly update then sets the status to Terminated."
    );
  });

  it("requires confirmation for a department transfer, with the roles warning", () => {
    const result = review({ departmentId: "dept_admin" });
    expect(result.departmentMoves).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationLines).toEqual([DEPARTMENT_TRANSFER_WARNING]);
    expect(DEPARTMENT_TRANSFER_WARNING).toBe(
      "Warning: all of this person's roles in the organisation end and must be granted again in the new department."
    );
  });

  it("lists both reasons when a transfer also sets a last day today", () => {
    const result = review({ departmentId: "dept_admin", nextEnd: TODAY });
    expect(result.confirmationLines).toHaveLength(3);
    expect(result.confirmationLines[0]).toBe(DEPARTMENT_TRANSFER_WARNING);
  });
});

describe("employmentSaveFailure", () => {
  it("shows the API's own 403 reason and says nothing was saved", () => {
    const failure = employmentSaveFailure({
      data: {
        detail:
          "Changing an end date on someone who holds organisation-wide roles needs organisation-wide HR employment authority.",
      },
      status: 403,
    });
    expect(failure).toEqual({
      message:
        "Changing an end date on someone who holds organisation-wide roles needs organisation-wide HR employment authority. Nothing was saved.",
      unexpected: false,
    });
  });

  it("shows the API's 400 reason for a refused reinstatement", () => {
    const failure = employmentSaveFailure({
      data: {
        detail: "Clear or move the end date before reinstating employment",
      },
      status: 400,
    });
    expect(failure.message).toBe(
      "Clear or move the end date before reinstating employment. Nothing was saved."
    );
    expect(failure.unexpected).toBe(false);
  });

  it("falls back to plain words when a 403 has no detail", () => {
    expect(employmentSaveFailure({ data: {}, status: 403 }).message).toBe(
      "You do not have permission to make this change. Nothing was saved."
    );
  });

  it("maps a missing record to a refresh prompt", () => {
    expect(employmentSaveFailure({ status: 404 })).toEqual({
      message:
        "This employment record could not be found. Refresh the page and try again.",
      unexpected: false,
    });
  });

  it("marks anything else as unexpected so the caller reports it", () => {
    expect(employmentSaveFailure({ status: 500 })).toEqual({
      message: "Something went wrong and nothing was saved. Try again.",
      unexpected: true,
    });
    expect(employmentSaveFailure(new Error("network down")).unexpected).toBe(
      true
    );
  });
});
