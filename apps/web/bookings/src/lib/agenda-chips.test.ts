import { describe, expect, it } from "vitest";
import {
  agendaChips,
  agendaDepositView,
  businessDepositDueView,
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

  it("keeps the online amount on a cancelled row that somehow has both amounts", () => {
    // The API never writes both (one is set by the collection mode), so this is
    // not a valid state; if it arrives, the online amount (card money may be
    // captured) is shown rather than hidden.
    const both = {
      ...ROW,
      deposit_minor: 5000,
      deposit_to_business_minor: 5000,
      status: "cancelled" as const,
    };
    expect(agendaChips(both)).toEqual([
      { kind: "deposit", view: { label: "Deposit EC$50", tone: "neutral" } },
    ]);
  });

  it("keeps the neutral amount on a cancelled online deposit (captured state unknown)", () => {
    const online = {
      ...ROW,
      deposit_minor: 4500,
      status: "cancelled" as const,
    };
    expect(agendaChips(online)).toEqual([
      { kind: "deposit", view: { label: "Deposit EC$45", tone: "neutral" } },
    ]);
    const pay = {
      ...online,
      payment_kind: "payment" as const,
      status: "no_show" as const,
    };
    expect(agendaChips(pay)).toEqual([
      { kind: "deposit", view: { label: "Payment EC$45", tone: "neutral" } },
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
