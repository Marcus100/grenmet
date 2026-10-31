import { describe, expect, it } from "vitest";
import {
  formatQuantity,
  isPayrollQuery,
  nextMonthStart,
  PERIOD_STATUS,
} from "./payroll-format";

describe("payroll formatting", () => {
  it("formats hours and counts", () => {
    expect(formatQuantity("7", "HOURS")).toBe("7.00 h");
    expect(formatQuantity("-8.00", "HOURS")).toBe("-8.00 h");
    expect(formatQuantity("1.00", "COUNT")).toBe("1");
  });

  it("suggests the next month's first day", () => {
    expect(nextMonthStart("2026-09-01")).toBe("2026-10-01");
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
  });

  it("labels every period status in words", () => {
    expect(PERIOD_STATUS.IN_REVIEW.label).toBe("Awaiting approval");
    expect(Object.keys(PERIOD_STATUS)).toHaveLength(5);
  });

  it("matches only payroll queries", () => {
    expect(isPayrollQuery([{ url: "/api/v1/hr/payroll/items" }])).toBe(true);
    expect(isPayrollQuery([{ url: "/api/v1/hr/leave" }])).toBe(false);
    expect(isPayrollQuery(["plain"])).toBe(false);
  });
});
