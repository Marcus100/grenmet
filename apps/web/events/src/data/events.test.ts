import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import type { ChannelSales } from "@/domain/types";
import {
  DEMO_EVENT_ID,
  getEventDashboard,
  previewSettlement,
  totalSales,
} from "./events";

function channel(overrides: Partial<ChannelSales> = {}): ChannelSales {
  return {
    channel: "online",
    label: "Online checkout",
    orders: 10,
    tickets: 12,
    gross: money(10_000, "XCD"),
    reconciliation: "reconciled",
    ...overrides,
  };
}

describe("totalSales", () => {
  it("adds one ledger across every sales channel", () => {
    const totals = totalSales([
      channel({ orders: 10, tickets: 12, gross: money(10_000, "XCD") }),
      channel({
        channel: "door",
        orders: 3,
        tickets: 3,
        gross: money(1550, "XCD"),
      }),
    ]);

    expect(totals.orders).toBe(13);
    expect(totals.tickets).toBe(15);
    expect(totals.gross).toEqual(money(11_550, "XCD"));
  });

  it("returns a zero total when no channel has sold", () => {
    expect(totalSales([])).toEqual({
      orders: 0,
      tickets: 0,
      gross: money(0, "XCD"),
    });
  });
});

describe("previewSettlement", () => {
  it("derives net from gross less every deduction", () => {
    const preview = previewSettlement(money(1_842_000, "XCD"), [
      { label: "Refunds", amount: money(24_000, "XCD") },
      { label: "Provider fees", amount: money(89_580, "XCD") },
      { label: "Barrels fee", amount: money(40_000, "XCD") },
    ]);

    expect(preview.net).toEqual(money(1_688_420, "XCD"));
  });

  it("leaves net equal to gross when nothing is deducted", () => {
    const preview = previewSettlement(money(50_000, "XCD"), []);

    expect(preview.net).toEqual(preview.gross);
  });
});

describe("getEventDashboard", () => {
  it("returns totals that agree with the channel rows", async () => {
    const dashboard = await getEventDashboard(DEMO_EVENT_ID);

    expect(dashboard).not.toBeNull();
    if (!dashboard) {
      return;
    }

    expect(dashboard.totals).toEqual(totalSales(dashboard.channels));
    expect(dashboard.settlement.gross).toEqual(dashboard.totals.gross);
  });

  it("returns null for an event it does not hold", async () => {
    expect(await getEventDashboard("evt_missing")).toBeNull();
  });
});
