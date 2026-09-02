import { money } from "@/domain/money";
import type {
  ChannelSales,
  EventRecord,
  NextAction,
  OperationalRecord,
  ReadinessCheck,
  SettlementDeduction,
} from "@/domain/types";

/**
 * Demo data for the organiser console.
 *
 * This stands in for the database until the Events schema lands. Keep it
 * internally consistent — the dashboard derives totals from these rows, so an
 * inconsistent fixture shows up as an inconsistent screen.
 */

export const DEMO_EVENT_ID = "evt_feel_free_sunset";

export const demoEvent: EventRecord = {
  id: DEMO_EVENT_ID,
  name: "Feel Free: Sunset",
  status: "on-sale",
  startsAt: "2026-08-15T16:00:00-04:00",
  venue: "Grenada National Stadium",
  capacity: 1200,
  isDemo: true,
};

export const demoChannelSales: readonly ChannelSales[] = [
  {
    channel: "online",
    label: "Online checkout",
    orders: 436,
    tickets: 626,
    gross: money(1_647_000, "XCD"),
    reconciliation: "reconciled",
  },
  {
    channel: "outlet",
    label: "Agent allocation",
    orders: 62,
    tickets: 78,
    gross: money(195_000, "XCD"),
    reconciliation: "needs-count",
  },
  {
    channel: "complimentary",
    label: "Complimentary",
    orders: 18,
    tickets: 38,
    gross: money(0, "XCD"),
    reconciliation: "recorded",
  },
];

export const demoSettlementDeductions: readonly SettlementDeduction[] = [
  { label: "Refunds", amount: money(24_000, "XCD") },
  { label: "Provider fees", amount: money(89_580, "XCD") },
  { label: "Barrels fee", amount: money(40_000, "XCD") },
];

export const demoReadinessChecks: readonly ReadinessCheck[] = [
  {
    id: "inventory",
    title: "Event and inventory",
    detail: "Published with three ticket types and a recorded capacity.",
    state: "complete",
  },
  {
    id: "guest-journey",
    title: "Guest journey",
    detail: "Checkout, confirmation and admission credential tested.",
    state: "complete",
  },
  {
    id: "door",
    title: "Door operation",
    detail: "Offline device rehearsal and fallback roster still required.",
    state: "attention",
  },
  {
    id: "settlement",
    title: "Settlement",
    detail: "Payout account and organiser acceptance contact are incomplete.",
    state: "attention",
  },
];

export const demoNextActions: readonly NextAction[] = [
  {
    id: "payout-account",
    title: "Connect payout account",
    detail: "Required before the first settlement can be released.",
    priority: "required",
    statusLabel: "Required",
  },
  {
    id: "agent-inventory",
    title: "Confirm agent inventory",
    detail: "Two allocations have not submitted a final sold count.",
    priority: "attention",
    statusLabel: "Attention",
  },
  {
    id: "door-plan",
    title: "Download the door plan",
    detail: "Prepare two scanning devices for degraded connectivity.",
    priority: "scheduled",
    statusLabel: "Due Friday",
  },
];

export const demoOperationalRecord: OperationalRecord = {
  lastPaymentLabel: "12 minutes ago",
  lastPaymentChannel: "Online",
  openExceptions: 2,
  openExceptionsDetail: "Agent count and payout setup",
};

export const demoReadinessPercent = 72;
export const demoSalesTrendLabel = "+12.4% this week";
export const demoCountdownLabel = "The event is 17 days away.";
