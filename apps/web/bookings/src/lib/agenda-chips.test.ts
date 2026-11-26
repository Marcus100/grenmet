import { describe, expect, it } from "vitest";
import {
  agendaChips,
  agendaDepositView,
  businessDepositDueView,
} from "./studio-view";

const DUE = /due/u;
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

  it("falls back to the existing deposit chip for a cancelled business deposit", () => {
    const booking = {
      ...ROW,
      deposit_minor: 5000,
      deposit_to_business_minor: 5000,
      status: "cancelled" as const,
    };
    const chips = agendaChips(booking);
    expect(chips).toEqual([
      { kind: "deposit", view: agendaDepositView(booking) },
    ]);
    const [chip] = chips;
    expect(chip?.kind === "deposit" && chip.view.label).not.toMatch(DUE);
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
