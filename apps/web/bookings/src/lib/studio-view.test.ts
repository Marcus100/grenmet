import { describe, expect, it } from "vitest";
import {
  agendaDepositView,
  daysIn,
  depositState,
  eventLabel,
  isDay,
  parseRange,
  weekStart,
} from "./studio-view";

describe("agenda ranges", () => {
  it("starts the week on Monday", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });

  it("defaults to today's day view and ignores bad dates", () => {
    expect(parseRange({}, "2026-10-21")).toEqual({
      view: "day",
      day: "2026-10-21",
      from: "2026-10-21",
      to: "2026-10-21",
    });
    expect(parseRange({ date: "2026-02-30" }, "2026-10-21").day).toBe(
      "2026-10-21"
    );
    expect(isDay("2026-13-01")).toBe(false);
  });

  it("covers seven days for a week, month and year boundaries included", () => {
    const range = parseRange(
      { view: "week", date: "2026-12-31" },
      "2026-10-21"
    );
    expect(range.from).toBe("2026-12-28");
    expect(range.to).toBe("2027-01-03");
    expect(daysIn(range)).toHaveLength(7);
  });
});

describe("deposit state", () => {
  const base = {
    deposit_minor: 2500,
    deposit_captured_minor: 0,
    deposit_refunded_minor: 0,
  };

  it("derives none, due, paid and refunded from the amounts", () => {
    expect(depositState({ ...base, deposit_minor: 0 })).toBe("none");
    expect(depositState(base)).toBe("due");
    expect(depositState({ ...base, deposit_captured_minor: 2500 })).toBe(
      "paid"
    );
    expect(
      depositState({
        ...base,
        deposit_captured_minor: 2500,
        deposit_refunded_minor: 2500,
      })
    ).toBe("refunded");
  });

  it("only claims what the agenda list knows", () => {
    expect(
      agendaDepositView({ deposit_minor: 2500, status: "pending_payment" })
        .label
    ).toBe("Deposit due");
    expect(
      agendaDepositView({ deposit_minor: 2500, status: "confirmed" }).label
    ).toBe("Deposit $25");
  });
});

describe("eventLabel", () => {
  it("words a transition and a first event", () => {
    expect(eventLabel(null, "pending")).toBe("Created as Pending");
    expect(eventLabel("pending", "cancelled")).toBe("Pending to Cancelled");
  });
});
