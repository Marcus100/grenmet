import type { BookingStatus } from "@barrelsgd/api-client";
import { formatDateTime } from "@barrelsgd/bookings-web/lib/booking-format";
import { describe, expect, it } from "vitest";
import {
  agendaDepositView,
  availableActions,
  businessDepositView,
  canManageBookings,
  canMarkDepositReceived,
  daysIn,
  depositState,
  depositView,
  eventLabel,
  isDay,
  localTime,
  localWhenNow,
  parseLocalWhen,
  parseRange,
  rotatesKey,
  showsAgendaDeposit,
  statusView,
  type TimelineEvent,
  timelineEntries,
  timelineEntry,
  todayIn,
  weekStart,
  zonedToUtcIso,
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
      agendaDepositView({
        currency: "XCD",
        deposit_minor: 2500,
        status: "pending_payment",
      }).label
    ).toBe("Deposit due");
    expect(
      agendaDepositView({
        currency: "XCD",
        deposit_minor: 2500,
        status: "confirmed",
      }).label
    ).toBe("Deposit EC$25");
  });
});

describe("deposit or payment wording", () => {
  it("says Payment when the booking asked for the full price", () => {
    expect(statusView("pending_payment").label).toBe("Awaiting deposit");
    expect(statusView("pending_payment", "payment").label).toBe(
      "Awaiting payment"
    );
    expect(depositView("paid", "payment").label).toBe("Payment paid");
    expect(depositView("refunded", "payment").label).toBe("Payment refunded");
    expect(depositView("refunded").label).toBe("Deposit refunded");
    expect(eventLabel("pending_payment", "confirmed", "payment")).toBe(
      "Awaiting payment to Confirmed"
    );
    expect(
      agendaDepositView({
        currency: "XCD",
        deposit_minor: 2500,
        payment_kind: "payment",
        status: "confirmed",
      }).label
    ).toBe("Payment EC$25");
  });
});

describe("booking actions", () => {
  it("lets owners and admins act, not members", () => {
    expect(canManageBookings("owner")).toBe(true);
    expect(canManageBookings("admin")).toBe(true);
    expect(canManageBookings("member")).toBe(false);
  });

  it("follows the API's transitions and the start time", () => {
    expect(availableActions("pending_payment", true)).toEqual(["cancel"]);
    expect(availableActions("pending", false)).toEqual([
      "confirm",
      "reschedule",
      "decline",
      "cancel",
    ]);
    expect(availableActions("confirmed", false)).toEqual([
      "reschedule",
      "cancel",
    ]);
    expect(availableActions("confirmed", true)).toEqual([
      "complete",
      "no_show",
      "cancel",
    ]);
    for (const status of ["cancelled", "no_show", "completed"] as const) {
      expect(availableActions(status, true)).toEqual([]);
    }
  });
});

describe("eventLabel", () => {
  it("words a transition and a first event", () => {
    expect(eventLabel(null, "pending")).toBe("Created as Pending");
    expect(eventLabel("pending", "cancelled")).toBe("Pending to Cancelled");
  });
});

describe("business timezone", () => {
  const instant = new Date("2026-10-22T02:30:00Z");

  it("reads today on the business's calendar", () => {
    expect(todayIn("America/Grenada", instant)).toBe("2026-10-21");
    expect(todayIn("Pacific/Auckland", instant)).toBe("2026-10-22");
  });

  it("turns a wall-clock time in the zone into UTC", () => {
    expect(zonedToUtcIso("2026-10-21", "14:00", "America/Grenada")).toBe(
      "2026-10-21T18:00:00.000Z"
    );
    expect(zonedToUtcIso("2026-10-21", "23:30", "America/Grenada")).toBe(
      "2026-10-22T03:30:00.000Z"
    );
    // Daylight saving: New York is UTC-4 in July and UTC-5 in January.
    expect(zonedToUtcIso("2026-07-01", "09:00", "America/New_York")).toBe(
      "2026-07-01T13:00:00.000Z"
    );
    expect(zonedToUtcIso("2026-01-15", "09:00", "America/New_York")).toBe(
      "2026-01-15T14:00:00.000Z"
    );
  });
});

describe("idempotency key rotation", () => {
  it("keeps the key only after a timeout or server fault", () => {
    expect(rotatesKey("unavailable")).toBe(false);
    for (const kind of ["invalid", "conflict", "forbidden", "not_found"]) {
      expect(rotatesKey(kind)).toBe(true);
    }
  });
});

describe("localTime", () => {
  it("reads an instant on the business's clock, in 24 hours", () => {
    expect(localTime("2027-01-05T13:30:00Z", "America/Grenada")).toBe("09:30");
    expect(localTime("2027-01-05T02:05:00Z", "America/Grenada")).toBe("22:05");
    expect(localTime("2027-01-05T04:00:00Z", "America/Grenada")).toBe("00:00");
  });
});

describe("deposit paid to the business, received (#1869)", () => {
  const RECEIVED = "2027-01-05T10:00:00.000Z";

  it("shows the agenda deposit as received, never as due, and shows a cancelled booking only when received", () => {
    const base = { currency: "XCD", deposit_minor: 0 };
    expect(
      agendaDepositView({
        ...base,
        deposit_received_at: RECEIVED,
        status: "confirmed",
      }).label
    ).toBe("Deposit received");
    expect(
      agendaDepositView({
        ...base,
        deposit_received_at: null,
        status: "pending",
      }).label
    ).not.toBe("Deposit due");
    expect(
      agendaDepositView({
        ...base,
        deposit_minor: 2500,
        deposit_received_at: RECEIVED,
        status: "cancelled",
      }).label
    ).toBe("Deposit received");
    expect(
      showsAgendaDeposit({
        deposit_minor: 0,
        deposit_received_at: RECEIVED,
        status: "cancelled",
      })
    ).toBe(true);
    expect(
      showsAgendaDeposit({
        deposit_minor: 0,
        deposit_to_business_minor: 2500,
        status: "cancelled",
      })
    ).toBe(false);
  });

  it("shows an agenda deposit only when it has an amount or is received", () => {
    expect(showsAgendaDeposit({ deposit_minor: 0, status: "pending" })).toBe(
      false
    );
    expect(showsAgendaDeposit({ deposit_minor: 2500, status: "pending" })).toBe(
      true
    );
    expect(
      showsAgendaDeposit({
        deposit_minor: 0,
        deposit_received_at: RECEIVED,
        status: "completed",
      })
    ).toBe(true);
  });

  it("badges received, due, cancelled and other states on the detail page", () => {
    expect(
      businessDepositView({
        deposit_received_at: RECEIVED,
        status: "confirmed",
      }).label
    ).toBe("Deposit received");
    expect(
      businessDepositView({ deposit_received_at: null, status: "confirmed" })
        .label
    ).toBe("Deposit due");
    expect(
      businessDepositView({ deposit_received_at: null, status: "cancelled" })
    ).toEqual({ label: "Deposit cancelled", tone: "neutral" });
    expect(
      businessDepositView({ deposit_received_at: null, status: "no_show" })
        .label
    ).toBe("Deposit not received");
  });

  it("offers a receipt only for an open business deposit not yet received", () => {
    const open = {
      deposit_to_business_minor: 5300,
      status: "pending" as const,
    };
    expect(canMarkDepositReceived(open)).toBe(true);
    expect(
      canMarkDepositReceived({ ...open, status: "completed" as const })
    ).toBe(true);
    expect(
      canMarkDepositReceived({ ...open, status: "cancelled" as const })
    ).toBe(false);
    expect(
      canMarkDepositReceived({ ...open, status: "no_show" as const })
    ).toBe(false);
    expect(
      canMarkDepositReceived({ ...open, deposit_to_business_minor: 0 })
    ).toBe(false);
    expect(
      canMarkDepositReceived({ ...open, deposit_received_at: RECEIVED })
    ).toBe(false);
  });

  it("reads the local time of a receipt and gives the latest allowed value", () => {
    expect(parseLocalWhen("2027-01-05T09:30")).toEqual({
      day: "2027-01-05",
      time: "09:30",
    });
    expect(parseLocalWhen("2027-02-30T09:30")).toBeNull();
    expect(parseLocalWhen("2027-01-05 09:30")).toBeNull();
    expect(
      localWhenNow("America/Grenada", new Date("2027-01-05T13:45:20Z"))
    ).toBe("2027-01-05T09:45");
  });
});

const ZONE = "America/Grenada";
const AT = "2026-11-18T12:00:00Z";

function event(
  status: [BookingStatus | null, BookingStatus],
  note: string | null
): TimelineEvent {
  return { from_status: status[0], to_status: status[1], note, created_at: AT };
}

describe("timelineEntry", () => {
  const same = (note: string | null, status: BookingStatus = "confirmed") =>
    timelineEntry(event([status, status], note), { zone: ZONE });

  it("titles a real status change as from and to, with its note", () => {
    expect(
      timelineEntry(
        event(["pending", "confirmed"], "Confirmed by the business"),
        { zone: ZONE }
      )
    ).toEqual({
      title: "Pending to Confirmed",
      detail: "Confirmed by the business",
    });
    expect(
      timelineEntry(event([null, "pending"], null), { zone: ZONE })
    ).toEqual({ title: "Created as Pending", detail: null });
  });

  it("titles a deposit marked received by what happened, keeping the method", () => {
    expect(same("Deposit received by cash")).toEqual({
      title: "Deposit received",
      detail: "By cash",
    });
    expect(same("Deposit received by bank transfer", "pending")).toEqual({
      title: "Deposit received",
      detail: "By bank transfer",
    });
  });

  it("titles an undone deposit receipt as marked not received", () => {
    expect(same("Deposit receipt undone")).toEqual({
      title: "Deposit marked not received",
      detail: null,
    });
  });

  it("titles a reschedule Time changed, with both times in the business's zone and who", () => {
    // 14:00Z and 18:30Z are 10:00 and 14:30 in Grenada (UTC-4).
    expect(
      timelineEntry(
        event(
          ["confirmed", "confirmed"],
          "Rescheduled from 2026-11-20T14:00Z by the business"
        ),
        { zone: ZONE, newStart: "2026-11-21T18:30:00Z" }
      )
    ).toEqual({
      title: "Time changed",
      detail: `From ${formatDateTime("2026-11-20T14:00:00Z", ZONE)} to ${formatDateTime("2026-11-21T18:30:00Z", ZONE)}, by the business`,
    });
    const byCustomer = same("Rescheduled from 2026-11-20T14:00Z by customer");
    expect(byCustomer.title).toBe("Time changed");
    expect(byCustomer.detail).toBe(
      `From ${formatDateTime("2026-11-20T14:00:00Z", ZONE)}, by the customer`
    );
    expect(byCustomer.detail).not.toContain("2026-11-20T");
    expect(byCustomer.detail).toContain("10:00");
  });

  it("shows a reschedule note it cannot read as the detail, not the title", () => {
    for (const note of [
      "Rescheduled from yesterday by the business",
      "Rescheduled from 2026-13-45T99:99Z by the business",
      "Rescheduled from 2026-11-20T14:00Z by someone else",
    ]) {
      expect(same(note)).toEqual({ title: "Booking updated", detail: note });
    }
  });

  it("titles a refund note Refund", () => {
    for (const note of [
      "Deposit refunded",
      "Payment refund queued",
      "Deposit refund failed; refund it by hand",
    ]) {
      expect(same(note, "cancelled")).toEqual({
        title: "Refund",
        detail: note,
      });
    }
  });

  it("titles other money notes on a cancelled booking Cancellation note", () => {
    for (const note of ["Deposit kept", "Unpaid payment cancelled"]) {
      expect(same(note, "cancelled")).toEqual({
        title: "Cancellation note",
        detail: note,
      });
    }
  });

  it("titles a payment recorded by hand by its noun", () => {
    expect(same("Deposit recorded by hand (cash)")).toEqual({
      title: "Deposit recorded",
      detail: "Deposit recorded by hand (cash)",
    });
    expect(same("Payment recorded by hand (bank_transfer)")).toEqual({
      title: "Payment recorded",
      detail: "Payment recorded by hand (bank_transfer)",
    });
  });

  it("shows anything else under Booking updated, never as a status change", () => {
    expect(same("Something new the API wrote")).toEqual({
      title: "Booking updated",
      detail: "Something new the API wrote",
    });
    expect(same(null)).toEqual({ title: "Booking updated", detail: null });
  });
});

describe("timelineEntries", () => {
  it("gives each reschedule the time it moved to", () => {
    const entries = timelineEntries(
      [
        event([null, "confirmed"], "Booked online"),
        event(
          ["confirmed", "confirmed"],
          "Rescheduled from 2026-11-20T14:00Z by customer"
        ),
        event(["confirmed", "confirmed"], "Deposit received by cash"),
        event(
          ["confirmed", "confirmed"],
          "Rescheduled from 2026-11-21T15:00Z by the business"
        ),
      ],
      { zone: ZONE, startsAt: "2026-11-22T16:00:00Z" }
    );
    expect(entries.map((entry) => entry.title)).toEqual([
      "Created as Confirmed",
      "Time changed",
      "Deposit received",
      "Time changed",
    ]);
    expect(entries[1]?.detail).toBe(
      `From ${formatDateTime("2026-11-20T14:00:00Z", ZONE)} to ${formatDateTime("2026-11-21T15:00:00Z", ZONE)}, by the customer`
    );
    expect(entries[3]?.detail).toBe(
      `From ${formatDateTime("2026-11-21T15:00:00Z", ZONE)} to ${formatDateTime("2026-11-22T16:00:00Z", ZONE)}, by the business`
    );
  });

  it("gives entries with the same time and status different keys", () => {
    const twice = event(["confirmed", "confirmed"], "Deposit received by cash");
    const rows = timelineEntries(
      [twice, twice, event([null, "pending"], null)],
      {
        zone: ZONE,
        startsAt: AT,
      }
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    expect(rows.map((row) => row.at)).toEqual([AT, AT, AT]);
  });
});
