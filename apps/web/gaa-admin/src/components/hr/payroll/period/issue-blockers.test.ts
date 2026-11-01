import type {
  DeductionLinePublic,
  EmployeePaySummary,
  PaySummaryPublic,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { issueBlockers } from "./issue-blockers";

const TAX_LINE: DeductionLinePublic = {
  category: "INCOME_TAX",
  code: "PAYE",
  name: "PAYE",
  base_minor: 100_000,
  employee_minor: 10_000,
  employer_minor: 0,
  rule_state: "CONFIRMED",
};

const EMPLOYEE: EmployeePaySummary = {
  user_id: "u1",
  employee_name: "Synthetic Person",
  gross_minor: 300_000,
  unpriced_line_count: 0,
  deductions: [TAX_LINE],
  employee_deductions_minor: 10_000,
  employer_contributions_minor: 0,
  net_minor: 290_000,
  shortfall_minor: 0,
};

function summary(overrides: Partial<PaySummaryPublic> = {}): PaySummaryPublic {
  return {
    period_id: "p1",
    currency: "XCD",
    provisional_figures: false,
    label: null,
    blocking_tables: [],
    issue_approved_at: null,
    employees: [EMPLOYEE],
    ...overrides,
  };
}

const READY = { status: "APPROVED", preparedByCaller: false, canApprove: true };

describe("issueBlockers", () => {
  it("has no blockers for an approved, clean period", () => {
    expect(issueBlockers({ ...READY, summary: summary() })).toEqual([]);
  });

  it("lists each provisional table with who can confirm it", () => {
    const [blocker] = issueBlockers({
      ...READY,
      summary: summary({ blocking_tables: ["NIS"], provisional_figures: true }),
    });
    expect(blocker?.message).toBe("The NIS table is still provisional.");
    expect(blocker?.whoCanFix).toContain("Tax and deductions");
  });

  it("stops issue for a period not yet approved", () => {
    const blockers = issueBlockers({
      ...READY,
      status: "OPEN",
      summary: summary(),
    });
    expect(blockers[0]?.message).toBe(
      "The period's quantities are not approved yet."
    );
    expect(blockers[0]?.whoCanFix).toContain("preparer submits");
  });

  it("names the preparer who cannot approve their own period", () => {
    const blockers = issueBlockers({
      ...READY,
      preparedByCaller: true,
      summary: summary(),
    });
    expect(blockers.map((item) => item.message)).toContain(
      "You prepared this period, so you cannot approve it for issue."
    );
  });

  it("counts unpriced lines and shortfalls", () => {
    const blockers = issueBlockers({
      ...READY,
      summary: summary({
        employees: [
          { ...EMPLOYEE, unpriced_line_count: 2, shortfall_minor: 500 },
        ],
      }),
    });
    const messages = blockers.map((item) => item.message);
    expect(messages).toContain("2 pay lines have no rate.");
    expect(messages).toContain(
      "Deductions are more than gross pay for 1 employee."
    );
  });

  it("reports a missing statutory deduction", () => {
    const blockers = issueBlockers({
      ...READY,
      summary: summary({
        employees: [{ ...EMPLOYEE, deductions: [] }],
      }),
    });
    expect(blockers.map((item) => item.message)).toContain(
      "No income tax or social insurance was calculated for this period."
    );
  });

  it("explains a missing approval permission", () => {
    const blockers = issueBlockers({
      ...READY,
      canApprove: false,
      summary: summary(),
    });
    expect(blockers[0]?.message).toContain("approval permission");
  });
});
