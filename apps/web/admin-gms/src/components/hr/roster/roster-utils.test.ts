import type {
  RosterPeriodPublic,
  ShiftCatalogPublic,
} from "@grenmet/api-client";
import { describe, expect, it } from "vitest";
import {
  buildCycleCodes,
  cellKey,
  findPeriodForMonth,
  initialName,
  isoDate,
  legendLabel,
  monthRange,
  nextCode,
} from "./roster-utils";

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

  it("builds initial-dot names", () => {
    expect(initialName("Gerad", "Tamar")).toBe("G. Tamar");
    expect(initialName("", "Tamar")).toBe("Tamar");
  });

  it("builds stable cell keys", () => {
    expect(cellKey("u1", "2026-07-01")).toBe("u1|2026-07-01");
  });
});
