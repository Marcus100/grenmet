import { subtractMoney, sumMoney } from "@/domain/money";
import type {
  ChannelSales,
  EventDashboard,
  SalesTotals,
  SettlementDeduction,
  SettlementPreview,
} from "@/domain/types";
import {
  DEMO_EVENT_ID,
  demoChannelSales,
  demoCountdownLabel,
  demoEvent,
  demoNextActions,
  demoOperationalRecord,
  demoReadinessChecks,
  demoReadinessPercent,
  demoSalesTrendLabel,
  demoSettlementDeductions,
} from "./fixtures";

/**
 * Data access for the organiser console.
 *
 * Every function is async so that swapping the fixture source for a database
 * does not change a single call site.
 */

export { DEMO_EVENT_ID } from "./fixtures";

/** Adds up one ledger across every sales channel. */
export function totalSales(channels: readonly ChannelSales[]): SalesTotals {
  return {
    orders: channels.reduce((total, row) => total + row.orders, 0),
    tickets: channels.reduce((total, row) => total + row.tickets, 0),
    gross: sumMoney(
      channels.map((row) => row.gross),
      "XCD"
    ),
  };
}

/** Net is always derived, never stored, so it cannot disagree with its parts. */
export function previewSettlement(
  gross: SalesTotals["gross"],
  deductions: readonly SettlementDeduction[]
): SettlementPreview {
  const net = deductions.reduce(
    (running, deduction) => subtractMoney(running, deduction.amount),
    gross
  );

  return { gross, deductions, net };
}

export async function getEventDashboard(
  eventId: string
): Promise<EventDashboard | null> {
  if (eventId !== DEMO_EVENT_ID) {
    return null;
  }

  const channels = demoChannelSales;
  const totals = totalSales(channels);

  return await Promise.resolve({
    event: demoEvent,
    channels,
    totals,
    settlement: previewSettlement(totals.gross, demoSettlementDeductions),
    readinessPercent: demoReadinessPercent,
    readinessChecks: demoReadinessChecks,
    actions: demoNextActions,
    operational: demoOperationalRecord,
    salesTrendLabel: demoSalesTrendLabel,
    countdownLabel: demoCountdownLabel,
  });
}
