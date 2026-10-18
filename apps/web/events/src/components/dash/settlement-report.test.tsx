import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Settlement } from "@/domain/types";
import { SettlementReport } from "./settlement-report";

const DANA_TILL = /Dana's till counted/;
const NOTHING_TO_RECONCILE = /Nothing to reconcile/;

const counts = {
  issued: 4,
  claimed: 4,
  admitted: 1,
  waiting: 3,
  cancelled: 0,
  refunded: 0,
  valueMinor: 10_000,
};

const report: Settlement = {
  listingId: "evt",
  title: "Fete",
  startsAt: "2026-10-30T22:00:00Z",
  endsAt: "2026-10-31T03:00:00Z",
  status: "published",
  currency: "XCD",
  generatedAt: "2026-10-31T04:00:00Z",
  totals: counts,
  channels: [
    {
      ...counts,
      issued: 0,
      claimed: 0,
      admitted: 0,
      waiting: 0,
      valueMinor: 0,
      channel: "online",
      collectedMinor: 0,
      refundedMinor: 0,
    },
    {
      ...counts,
      channel: "outlet_cash",
      collectedMinor: 10_000,
      refundedMinor: 0,
    },
  ],
  tiers: [],
  tills: [
    {
      id: "till",
      staffName: "Dana",
      day: "2026-10-30",
      status: "closed",
      openingFloatMinor: 10_000,
      openedAt: "2026-10-30T20:00:00Z",
      closedAt: "2026-10-31T03:30:00Z",
      salesCount: 2,
      ticketsSold: 4,
      collectedMinor: 10_000,
      cashRefundsMinor: 0,
      expectedMinor: 20_000,
      countedMinor: 19_500,
      differenceMinor: -500,
      closeNote: null,
    },
  ],
  cash: {
    collectedMinor: 10_000,
    cashRefundsMinor: 0,
    netSalesMinor: 10_000,
    expectedMinor: 20_000,
    countedMinor: 19_500,
    differenceMinor: -500,
    openTills: 0,
    closedTills: 1,
  },
  discrepancies: [
    {
      kind: "till_short",
      message: "Dana's till counted EC$195.00 but expected EC$200.00",
      tillId: "till",
      amountMinor: -500,
    },
  ],
};

describe("SettlementReport", () => {
  it("lists the mismatch and shows expected against counted", () => {
    render(<SettlementReport report={report} />);
    expect(screen.getByText(DANA_TILL)).toBeInTheDocument();
    expect(screen.getByText("Outlet cash")).toBeInTheDocument();
    expect(screen.getAllByText("$200.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("−$5.00").length).toBeGreaterThan(0);
  });

  it("says so when nothing needs reconciling", () => {
    render(<SettlementReport report={{ ...report, discrepancies: [] }} />);
    expect(screen.getByText(NOTHING_TO_RECONCILE)).toBeInTheDocument();
  });
});
