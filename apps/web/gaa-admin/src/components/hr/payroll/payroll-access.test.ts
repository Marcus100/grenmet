import { describe, expect, it } from "vitest";
import { payrollAccess } from "./payroll-access";

describe("payrollAccess", () => {
  it("grants organisation-wide keys only from the all-scope list", () => {
    const access = payrollAccess(
      ["hr.payroll.read.amounts"],
      ["hr.payroll.rates.manage"]
    );
    expect(access.canReadAmounts).toBe(true);
    expect(access.canManageRates).toBe(false);
  });

  it("reads self-service from any held key", () => {
    expect(
      payrollAccess([], ["hr.payroll.read.self"]).canReadSelf
    ).toBe(true);
    expect(payrollAccess([], []).canReadSelf).toBe(false);
  });
});
