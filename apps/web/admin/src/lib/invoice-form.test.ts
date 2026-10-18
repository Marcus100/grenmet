import { describe, expect, it } from "vitest";
import {
  dollarsToMinor,
  formatMinor,
  noticeFor,
  noticeForStatus,
  parseCustomer,
  parseDraft,
  parseId,
  parseIssueDate,
  parsePayment,
  parseVoidReason,
} from "@/lib/invoice-form";

const CUSTOMER = "0b7d6c0e-4a52-4f57-8a63-9d2e6c1f7a10";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("money", () => {
  it("converts dollars to minor units without floating point", () => {
    expect(dollarsToMinor("1250.5")).toBe(125_050);
    expect(dollarsToMinor("0.07")).toBe(7);
    expect(dollarsToMinor("19")).toBe(1900);
    expect(dollarsToMinor("1.005")).toBeUndefined();
    expect(dollarsToMinor("-3")).toBeUndefined();
    expect(dollarsToMinor("1e3")).toBeUndefined();
    expect(dollarsToMinor("")).toBeUndefined();
  });

  it("formats minor units with grouping and two decimals", () => {
    expect(formatMinor(123_456_789)).toBe("1,234,567.89");
    expect(formatMinor(5)).toBe("0.05");
    expect(formatMinor(-250)).toBe("-2.50");
  });
});

describe("parseDraft", () => {
  it("collects filled lines, skips empty rows and omits a blank rate", () => {
    const parsed = parseDraft(
      form({
        customer_id: CUSTOMER,
        notes: " Net 30 ",
        description_0: "Monitoring",
        quantity_0: "2.5",
        unit_price_0: "100.10",
        tax_rate_0: "",
        description_2: "Setup",
        quantity_2: "1",
        unit_price_2: "50",
        tax_rate_2: "0",
      })
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        customer_id: CUSTOMER,
        notes: "Net 30",
        lines: [
          {
            description: "Monitoring",
            quantity: 2.5,
            unit_price_minor: 10_010,
          },
          {
            description: "Setup",
            quantity: 1,
            unit_price_minor: 5000,
            tax_rate: 0,
          },
        ],
      },
    });
  });

  it("accepts a draft with no lines so it can be saved early", () => {
    const parsed = parseDraft(form({ customer_id: CUSTOMER }));
    expect(parsed).toEqual({
      ok: true,
      value: { customer_id: CUSTOMER, notes: null, lines: [] },
    });
  });

  it("rejects bad customers and half-filled or malformed lines", () => {
    expect(parseDraft(form({ customer_id: "nope" })).ok).toBe(false);
    const base = { customer_id: CUSTOMER, description_0: "x" };
    expect(parseDraft(form({ ...base, quantity_0: "1" })).ok).toBe(false);
    expect(
      parseDraft(form({ ...base, quantity_0: "0", unit_price_0: "1" })).ok
    ).toBe(false);
    expect(
      parseDraft(form({ ...base, quantity_0: "1.2345", unit_price_0: "1" })).ok
    ).toBe(false);
    expect(
      parseDraft(
        form({ ...base, quantity_0: "1", unit_price_0: "1", tax_rate_0: "101" })
      ).ok
    ).toBe(false);
  });
});

describe("other forms", () => {
  it("parses payments in minor units and refuses card or zero", () => {
    const ok = parsePayment(
      form({
        method: "cheque",
        amount: "40.00",
        paid_date: "2026-10-18",
        reference: " 1043 ",
      })
    );
    expect(ok).toEqual({
      ok: true,
      value: {
        method: "cheque",
        amount_minor: 4000,
        paid_date: "2026-10-18",
        reference: "1043",
      },
    });
    expect(
      parsePayment(
        form({ method: "card", amount: "1", paid_date: "2026-10-18" })
      ).ok
    ).toBe(false);
    expect(
      parsePayment(
        form({ method: "cash", amount: "0", paid_date: "2026-10-18" })
      ).ok
    ).toBe(false);
    expect(
      parsePayment(form({ method: "cash", amount: "1", paid_date: "18/10" })).ok
    ).toBe(false);
  });

  it("requires a void reason of 3 to 500 characters", () => {
    expect(parseVoidReason(form({ reason: "ab" })).ok).toBe(false);
    expect(parseVoidReason(form({ reason: "Wrong client" }))).toEqual({
      ok: true,
      value: "Wrong client",
    });
  });

  it("parses an optional issue date", () => {
    expect(parseIssueDate(form({}))).toEqual({ ok: true, value: undefined });
    expect(parseIssueDate(form({ issue_date: "2026-11-01" }))).toEqual({
      ok: true,
      value: "2026-11-01",
    });
    expect(parseIssueDate(form({ issue_date: "tomorrow" })).ok).toBe(false);
  });

  it("validates customers", () => {
    const ok = parseCustomer(
      form({ organisation_id: "org_0123", billing_email: "a@b.co" })
    );
    expect(ok.ok).toBe(true);
    expect(
      parseCustomer(form({ organisation_id: "org_1", billing_email: "nope" }))
        .ok
    ).toBe(false);
    expect(parseId("not-a-uuid")).toBeUndefined();
    expect(parseId(CUSTOMER)).toBe(CUSTOMER);
  });

  it("maps statuses to fixed notice codes", () => {
    expect(noticeForStatus(409)).toBe("conflict");
    expect(
      noticeForStatus(422, "Payment exceeds the outstanding balance")
    ).toBe("overpaid");
    expect(noticeForStatus(422, "other")).toBe("invalid");
    expect(noticeForStatus(500)).toBe("failed");
    expect(noticeFor("issued")?.tone).toBe("ok");
    expect(noticeFor("<script>")).toBeUndefined();
  });
});
