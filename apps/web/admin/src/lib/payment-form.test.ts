import { describe, expect, it } from "vitest";
import {
  formatXcd,
  parseDay,
  parseLedgerKind,
  parsePage,
  parsePayout,
  parsePeriod,
  paymentNoticeFor,
  paymentNoticeForStatus,
} from "@/lib/payment-form";

describe("formatXcd", () => {
  it("shows minor units as XCD with two decimals", () => {
    expect(formatXcd(125_050)).toBe("XCD 1,250.50");
    expect(formatXcd(5)).toBe("XCD 0.05");
    expect(formatXcd(-1200)).toBe("XCD -12.00");
  });
});

describe("parsePayout", () => {
  const good = {
    organisation_id: "org_1",
    amount: "1250.5",
    reference: "TT-1",
    note: " thanks ",
  };

  it("converts dollars to minor units by string parsing", () => {
    expect(parsePayout(good)).toEqual({
      ok: true,
      value: {
        organisationId: "org_1",
        amountMinor: 125_050,
        reference: "TT-1",
        note: "thanks",
      },
    });
  });

  it.each([
    ["zero", { ...good, amount: "0" }],
    ["three decimals", { ...good, amount: "1.234" }],
    ["negative", { ...good, amount: "-5" }],
    ["no reference", { ...good, reference: " " }],
    ["bad organisation", { ...good, organisation_id: "a b" }],
    ["missing", {}],
  ])("rejects %s", (_name, values) => {
    expect(parsePayout(values).ok).toBe(false);
  });
});

describe("filters and periods", () => {
  it("validates days and ordering, both ends inclusive", () => {
    expect(parseDay("2026-02-30")).toBeUndefined();
    expect(parsePeriod("2026-10-01", "2026-10-01").ok).toBe(true);
    expect(parsePeriod("2026-10-02", "2026-10-01").ok).toBe(false);
    expect(parsePeriod("2026-10-01", undefined).ok).toBe(false);
  });

  it("falls back for bad pages and kinds", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parseLedgerKind("payout")).toBe("payout");
    expect(parseLedgerKind("drop table")).toBeUndefined();
  });

  it("maps statuses and codes to fixed notices", () => {
    expect(paymentNoticeForStatus(409)).toBe("payout-too-large");
    expect(paymentNoticeForStatus(400)).toBe("payout-unknown");
    expect(paymentNoticeForStatus(503)).toBe("payout-failed");
    expect(paymentNoticeFor("payout-recorded")?.tone).toBe("ok");
    expect(paymentNoticeFor("<x>")).toBeUndefined();
  });
});
