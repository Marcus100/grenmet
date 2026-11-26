import { describe, expect, it } from "vitest";
import { businessDepositDue, businessDepositDueView } from "./studio-view";

const DUE_LABEL = /^Deposit due EC\$50 to you$/u;
const OWED = {
  currency: "XCD",
  deposit_received_at: null,
  deposit_to_business_minor: 5000,
  status: "confirmed" as const,
};

describe("businessDepositDue", () => {
  it("is due while a confirmed or pending booking has not had its deposit received", () => {
    expect(businessDepositDue(OWED)).toBe(true);
    expect(businessDepositDue({ ...OWED, status: "pending" })).toBe(true);
  });

  it("is not due once the deposit is recorded as received", () => {
    expect(
      businessDepositDue({
        ...OWED,
        deposit_received_at: "2026-11-26T10:00:00Z",
      })
    ).toBe(false);
  });

  it("is never due on a cancelled booking", () => {
    expect(businessDepositDue({ ...OWED, status: "cancelled" })).toBe(false);
  });

  it("is not due when nothing is owed to the business", () => {
    expect(businessDepositDue({ ...OWED, deposit_to_business_minor: 0 })).toBe(
      false
    );
    expect(
      businessDepositDue({ ...OWED, deposit_to_business_minor: undefined })
    ).toBe(false);
  });
});

describe("businessDepositDueView", () => {
  it("names the amount due to the business", () => {
    const view = businessDepositDueView(OWED);
    expect(view.label).toMatch(DUE_LABEL);
    expect(view.tone).toBe("warning");
  });
});
