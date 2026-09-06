import type {
  DepartmentMemberPublic,
  GradePublic,
  RosterPeriodPublic,
  ShiftCatalogPublic,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  buildCycleCodes,
  cellKey,
  findPeriodForMonth,
  groupByGrade,
  isoDate,
  legendLabel,
  markShiftRuns,
  monthRange,
  nextCode,
  workShiftCodes,
} from "./roster-utils";

function member(
  userId: string,
  grade: GradePublic | null
): DepartmentMemberPublic {
  return {
    user_id: userId,
    username: userId,
    first_name: "Test",
    last_name: userId,
    full_name: `Test ${userId}`,
    roster_name: null,
    employee_number: `GMS-${userId}`,
    position: grade?.label ?? null,
    grade,
    employment_status: "ACTIVE",
  };
}

function shift(overrides: Partial<ShiftCatalogPublic>): ShiftCatalogPublic {
  return {
    code: "M",
    label: "Morning",
    category: "WORK",
    start_time: null,
    end_time: null,
    ends_next_day: false,
    counts_as_work_hours: true,
    needs_reason: false,
    needs_approval: false,
    is_active: true,
    ...overrides,
  };
}

function period(overrides: Partial<RosterPeriodPublic>): RosterPeriodPublic {
  return {
    id: "p1",
    department_id: "dept_met",
    period_start: "2026-07-01",
    period_end: "2026-07-31",
    status: "DRAFT",
    created_by_user_id: "u1",
    created_at: "2026-06-25T12:00:00+0000",
    updated_at: "2026-06-25T12:00:00+0000",
    ...overrides,
  };
}

describe("monthRange / isoDate", () => {
  it("computes the full range of July 2026", () => {
    expect(monthRange(new Date(2026, 6, 1))).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });

  it("handles February in a non-leap year", () => {
    expect(monthRange(new Date(2026, 1, 1)).end).toBe("2026-02-28");
  });

  it("pads single-digit months and days", () => {
    expect(isoDate(2026, 0, 5)).toBe("2026-01-05");
  });
});

describe("findPeriodForMonth", () => {
  it("prefers the exact month period", () => {
    const exact = period({ id: "exact" });
    const overlapping = period({
      id: "overlap",
      period_start: "2026-06-15",
      period_end: "2026-07-15",
    });
    expect(
      findPeriodForMonth([overlapping, exact], new Date(2026, 6, 1))?.id
    ).toBe("exact");
  });

  it("falls back to an overlapping period", () => {
    const overlapping = period({
      id: "overlap",
      period_start: "2026-06-15",
      period_end: "2026-07-15",
    });
    expect(findPeriodForMonth([overlapping], new Date(2026, 6, 1))?.id).toBe(
      "overlap"
    );
  });

  it("returns undefined when nothing covers the month", () => {
    expect(
      findPeriodForMonth([period({})], new Date(2026, 8, 1))
    ).toBeUndefined();
  });
});

describe("buildCycleCodes / nextCode", () => {
  it("orders codes by the printed-roster convention and skips inactive", () => {
    const catalog = [
      shift({ code: "L" }),
      shift({ code: "M" }),
      shift({ code: "N" }),
      shift({ code: "X", is_active: false }),
    ];
    expect(buildCycleCodes(catalog)).toEqual(["M", "N", "L"]);
  });

  it("appends unknown codes at the end", () => {
    const catalog = [shift({ code: "M" }), shift({ code: "Q" })];
    expect(buildCycleCodes(catalog)).toEqual(["M", "Q"]);
  });

  it("cycles from empty to first and wraps around", () => {
    const codes = ["M", "E"];
    expect(nextCode(codes, "")).toBe("M");
    expect(nextCode(codes, "M")).toBe("E");
    expect(nextCode(codes, "E")).toBe("M");
  });
});

describe("labels", () => {
  it("formats work shifts like the printed legend", () => {
    expect(legendLabel(shift({ start_time: "05:30", end_time: "14:00" }))).toBe(
      "0530–1400 hrs"
    );
  });

  it("uses the label for codes without times", () => {
    expect(legendLabel(shift({ code: "V", label: "Vacation" }))).toBe(
      "Vacation"
    );
  });

  it("groups members into the grade bands the roster prints", () => {
    const groups = groupByGrade([
      member("tamar", { code: "MANAGER", label: "Manager", rank: 1 }),
      member("cyrus", {
        code: "SENIOR_TECH",
        label: "Senior Level Technician",
        rank: 3,
      }),
      member("frank", {
        code: "SENIOR_TECH",
        label: "Senior Level Technician",
        rank: 3,
      }),
    ]);

    expect(groups.map((g) => g.label)).toEqual([
      "Manager",
      "Senior Level Technician",
    ]);
    expect(groups[1].members).toHaveLength(2);
  });

  it("keeps ungraded members in one trailing unlabelled group", () => {
    const groups = groupByGrade([
      member("tamar", { code: "MANAGER", label: "Manager", rank: 1 }),
      member("nobody", null),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[1].label).toBeNull();
    expect(groups[1].members.map((m) => m.user_id)).toEqual(["nobody"]);
  });

  it("builds stable cell keys", () => {
    expect(cellKey("u1", "2026-07-01")).toBe("u1|2026-07-01");
  });
});

describe("workShiftCodes", () => {
  it("keeps only WORK-category codes", () => {
    const codes = workShiftCodes([
      shift({ code: "M", category: "WORK" }),
      shift({ code: "N", category: "WORK" }),
      shift({ code: "O", category: "OFF" }),
      shift({ code: "V", category: "LEAVE" }),
    ]);
    expect([...codes].sort()).toEqual(["M", "N"]);
  });
});

describe("markShiftRuns", () => {
  const work = new Set(["M", "D", "E", "N"]);

  it("marks a run of two or more identical work shifts", () => {
    expect(markShiftRuns(["N", "N", "N", "O"], work)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("leaves a lone work shift unmarked", () => {
    expect(markShiftRuns(["M", "E", "N"], work)).toEqual([false, false, false]);
  });

  it("does not mark runs of off duty or leave, which carry their own treatment", () => {
    expect(markShiftRuns(["O", "O", "O"], work)).toEqual([false, false, false]);
    expect(markShiftRuns(["V", "V", "V"], work)).toEqual([false, false, false]);
  });

  it("never joins a run across a blank, unrostered day", () => {
    expect(markShiftRuns(["N", "", "N"], work)).toEqual([false, false, false]);
    expect(markShiftRuns(["", "", ""], work)).toEqual([false, false, false]);
  });

  it("marks each run independently across the month", () => {
    expect(markShiftRuns(["M", "M", "O", "E", "E", "E"], work)).toEqual([
      true,
      true,
      false,
      true,
      true,
      true,
    ]);
  });

  it("returns one flag per day, including an empty month", () => {
    expect(markShiftRuns([], work)).toEqual([]);
    expect(markShiftRuns(["M", "M"], new Set())).toEqual([false, false]);
  });
});
