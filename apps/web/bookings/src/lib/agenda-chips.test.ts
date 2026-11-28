import { describe, expect, it } from "vitest";
import {
  ACCEPTED_AWAITING_VIEW,
  acceptedAwaitingPayment,
  agendaChips,
  agendaDepositView,
  businessDepositDueView,
  paysAfterYouAccept,
} from "./studio-view";

const ROW = {
  currency: "XCD",
  deposit_minor: 0,
  deposit_received_at: null,
  deposit_to_business_minor: 0,
  hold_expires_soon: false,
  status: "pending" as const,
};

describe("agendaChips", () => {
  it("shows nothing for a row with no deposit and no hold warning", () => {
    expect(agendaChips(ROW)).toEqual([]);
  });

  it("shows Expires soon when the hold is about to end", () => {
    expect(
      agendaChips({
        ...ROW,
        hold_expires_soon: true,
        status: "pending_payment",
      })
    ).toEqual([{ kind: "expires_soon" }]);
  });

  it("puts Expires soon before the deposit chip", () => {
    const booking = {
      ...ROW,
      deposit_minor: 2500,
      hold_expires_soon: true,
      status: "pending_payment" as const,
    };
    const chips = agendaChips(booking);
    expect(chips[0]).toEqual({ kind: "expires_soon" });
    expect(chips[1]).toEqual({
      kind: "deposit",
      view: agendaDepositView(booking),
    });
  });

  it("replaces the generic deposit chip with Deposit due to you", () => {
    const booking = {
      ...ROW,
      deposit_minor: 5000,
      deposit_to_business_minor: 5000,
      status: "confirmed" as const,
    };
    expect(agendaChips(booking)).toEqual([
      { kind: "deposit", view: businessDepositDueView(booking) },
    ]);
    expect(agendaChips(booking)).toHaveLength(1);
  });

  it("shows Deposit received once a business deposit is recorded", () => {
    const booking = {
      ...ROW,
      deposit_minor: 5000,
      deposit_received_at: "2026-11-26T10:00:00Z",
      deposit_to_business_minor: 5000,
      status: "confirmed" as const,
    };
    expect(agendaChips(booking)).toEqual([
      {
        kind: "deposit",
        view: { label: "Deposit received", tone: "success" },
      },
    ]);
  });

  it("shows no chip on a cancelled business-collected deposit with nothing received", () => {
    const business = {
      ...ROW,
      deposit_minor: 0,
      deposit_to_business_minor: 5000,
      status: "cancelled" as const,
    };
    expect(agendaChips(business)).toEqual([]);
  });

  it("shows on a no-show exactly what dev shows: nothing for a business-only deposit", () => {
    // dev: businessDepositDue excludes no_show and deposit_minor is 0, so no chip.
    const business = {
      ...ROW,
      deposit_minor: 0,
      deposit_to_business_minor: 5000,
      status: "no_show" as const,
    };
    expect(agendaChips(business)).toEqual([]);
  });

  it("keeps the no-show online amount chip exactly as on dev", () => {
    const online = {
      ...ROW,
      deposit_minor: 4500,
      status: "no_show" as const,
    };
    expect(agendaChips(online)).toEqual([
      { kind: "deposit", view: { label: "Deposit EC$45", tone: "neutral" } },
    ]);
  });

  it("shows no chip on a cancelled row with a deposit amount but nothing taken", () => {
    // A never-paid online deposit on a cancelled booking: no payment chip.
    const unpaid = {
      ...ROW,
      deposit_minor: 4500,
      status: "cancelled" as const,
    };
    expect(agendaChips(unpaid)).toEqual([]);
    expect(
      agendaChips({
        ...unpaid,
        deposit_minor: 5000,
        deposit_to_business_minor: 5000,
      })
    ).toEqual([]);
  });

  it("keeps the neutral amount on a no-show online deposit nothing was taken for", () => {
    const pay = {
      ...ROW,
      deposit_minor: 4500,
      payment_kind: "payment" as const,
      status: "no_show" as const,
    };
    expect(agendaChips(pay)).toEqual([
      { kind: "deposit", view: { label: "Payment EC$45", tone: "neutral" } },
    ]);
  });

  it("says the money was taken and not refunded, not that a refund is owed, on a cancelled booking", () => {
    const held = {
      ...ROW,
      deposit_minor: 4500,
      deposit_captured_minor: 4500,
      deposit_refunded_minor: 0,
      status: "cancelled" as const,
    };
    expect(agendaChips(held)).toEqual([
      {
        kind: "deposit",
        view: { label: "EC$45 taken, not refunded", tone: "warning" },
      },
    ]);
  });

  it("shows Refunded once a cancelled booking's captured deposit is handed back in full", () => {
    const refunded = {
      ...ROW,
      deposit_minor: 4500,
      deposit_captured_minor: 4500,
      deposit_refunded_minor: 4500,
      status: "cancelled" as const,
    };
    expect(agendaChips(refunded)).toEqual([
      { kind: "deposit", view: { label: "Refunded", tone: "info" } },
    ]);
  });

  it("shows how much went back after a partial refund", () => {
    const partial = {
      ...ROW,
      deposit_minor: 4500,
      deposit_captured_minor: 4500,
      deposit_refunded_minor: 2000,
      status: "cancelled" as const,
    };
    expect(agendaChips(partial)).toEqual([
      {
        kind: "deposit",
        view: { label: "EC$20 of EC$45 refunded", tone: "warning" },
      },
    ]);
  });

  it("says the same on a no-show, whose deposit the business keeps", () => {
    const noShow = {
      ...ROW,
      deposit_minor: 4500,
      deposit_captured_minor: 4500,
      status: "no_show" as const,
    };
    expect(agendaChips(noShow)).toEqual([
      {
        kind: "deposit",
        view: { label: "EC$45 taken, not refunded", tone: "warning" },
      },
    ]);
  });

  it("shows no chip on a cancelled booking that owes nothing", () => {
    expect(agendaChips({ ...ROW, status: "cancelled" as const })).toEqual([]);
  });

  it("shows Payment received for a payment-kind booking that was received", () => {
    const booking = {
      ...ROW,
      deposit_minor: 4500,
      deposit_received_at: "2026-11-26T10:00:00Z",
      payment_kind: "payment" as const,
      status: "cancelled" as const,
    };
    expect(agendaChips(booking)).toEqual([
      { kind: "deposit", view: { label: "Payment received", tone: "success" } },
    ]);
  });

  it("keeps the received chip on a cancelled booking where money was received", () => {
    const booking = {
      ...ROW,
      deposit_minor: 4500,
      deposit_received_at: "2026-11-26T10:00:00Z",
      status: "cancelled" as const,
    };
    expect(agendaChips(booking)).toEqual([
      {
        kind: "deposit",
        view: { label: "Deposit received", tone: "success" },
      },
    ]);
  });

  it("keeps an active booking's amount chip unchanged", () => {
    const booking = {
      ...ROW,
      deposit_minor: 4500,
      status: "confirmed" as const,
    };
    expect(agendaChips(booking)).toEqual([
      { kind: "deposit", view: agendaDepositView(booking) },
    ]);
    expect(agendaChips(booking)[0]).toEqual({
      kind: "deposit",
      view: { label: "Deposit EC$45", tone: "neutral" },
    });
  });

  it("leaves an online deposit as it was", () => {
    const booking = {
      ...ROW,
      deposit_minor: 2500,
      status: "pending_payment" as const,
    };
    expect(agendaChips(booking)).toEqual([
      { kind: "deposit", view: agendaDepositView(booking) },
    ]);
  });
});

describe("agendaChips for a request paid after you accept", () => {
  const REQUEST = {
    ...ROW,
    deposit_minor: 5000,
    pay_after_acceptance: true,
    status: "pending" as const,
  };
  const ACCEPTED = {
    ...REQUEST,
    accepted_at: "2026-11-26T15:00:00Z",
    status: "pending_payment" as const,
  };

  it("says the amount follows your acceptance while it needs confirming", () => {
    expect(paysAfterYouAccept(REQUEST)).toBe(true);
    expect(agendaChips(REQUEST)).toEqual([
      {
        kind: "deposit",
        view: { label: "Deposit EC$50 after you accept", tone: "neutral" },
      },
    ]);
  });

  it("says Accepted, awaiting payment once you accepted", () => {
    expect(acceptedAwaitingPayment(ACCEPTED)).toBe(true);
    expect(ACCEPTED_AWAITING_VIEW).toEqual({
      label: "Accepted, awaiting payment",
      tone: "warning",
    });
    expect(agendaChips(ACCEPTED)).toEqual([
      { kind: "deposit", view: ACCEPTED_AWAITING_VIEW },
    ]);
  });

  it("keeps Expires soon first when the customer is running out of time", () => {
    expect(agendaChips({ ...ACCEPTED, hold_expires_soon: true })).toEqual([
      { kind: "expires_soon" },
      { kind: "deposit", view: ACCEPTED_AWAITING_VIEW },
    ]);
  });

  it("is the usual deposit chip once paid, and for a payment at booking", () => {
    const confirmed = { ...ACCEPTED, status: "confirmed" as const };
    expect(agendaChips(confirmed)).toEqual([
      { kind: "deposit", view: agendaDepositView(confirmed) },
    ]);
    const atBooking = {
      ...ACCEPTED,
      accepted_at: null,
      pay_after_acceptance: false,
    };
    expect(acceptedAwaitingPayment(atBooking)).toBe(false);
    expect(agendaChips(atBooking)).toEqual([
      { kind: "deposit", view: agendaDepositView(atBooking) },
    ]);
  });
});

describe("agendaChips for a request whose deposit is paid to the business", () => {
  it("says the deposit follows your acceptance, not that it is due", () => {
    const request = {
      ...ROW,
      deposit_to_business_minor: 5000,
      status: "pending" as const,
    };
    expect(agendaChips(request)).toEqual([
      {
        kind: "deposit",
        view: {
          label: "Deposit EC$50 to you after you accept",
          tone: "neutral",
        },
      },
    ]);
    const accepted = { ...request, status: "confirmed" as const };
    expect(agendaChips(accepted)).toEqual([
      { kind: "deposit", view: businessDepositDueView(accepted) },
    ]);
  });
});
