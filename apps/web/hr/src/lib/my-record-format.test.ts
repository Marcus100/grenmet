import { describe, expect, it } from "vitest";
import {
  codeLabel,
  employmentTypeLabel,
  formatRecordDate,
  leaveBalanceWords,
} from "@/lib/my-record-format";

describe("my record wording", () => {
  it("turns leave codes into plain words and keeps unknown codes visible", () => {
    expect(codeLabel("VACATION")).toBe("Vacation");
    expect(codeLabel("PROFESSIONAL_APPOINTMENT")).toBe(
      "Professional appointment"
    );
  });

  it("states balances in days, singular for one", () => {
    expect(leaveBalanceWords("1")).toBe("1 day");
    expect(leaveBalanceWords("12")).toBe("12 days");
    expect(leaveBalanceWords("0")).toBe("0 days");
    expect(leaveBalanceWords("12.50")).toBe("12.50 days");
  });

  it("formats calendar dates in words without a time-zone shift", () => {
    expect(formatRecordDate("2024-03-01")).toBe("1 March 2024");
    expect(formatRecordDate("2026-12-31")).toBe("31 December 2026");
  });

  it("names employment types and says not set when there is none", () => {
    expect(employmentTypeLabel("PART_TIME")).toBe("Part time");
    expect(employmentTypeLabel(null)).toBe("Not set");
    expect(employmentTypeLabel(undefined)).toBe("Not set");
  });
});
