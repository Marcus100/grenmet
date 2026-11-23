import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveProfileAction: vi.fn(),
}));

import { DepositRuleForm, previewSentence } from "./deposit-rule-form";

const SWITCH = /Require a deposit/u;
const TO_100 = /1 to 100/u;
const COLLECTED = /Deposits are collected online only/u;
const ADD_PRICED = /Add a priced service/u;
const OFF = /Off: bookings take a deposit/u;
const PERCENT = /Deposit percentage/u;
const AMOUNT = /Deposit amount/u;
const PREVIEW = "deposit-preview";
const EXAMPLE = { name: "Classic full set", priceMinor: 21_000 };

function profile(
  overrides: Partial<BookingProfilePublic> = {}
): BookingProfilePublic {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "org-1",
    public_slug: "salon",
    display_name: "Salon",
    enabled: true,
    timezone: "America/Grenada",
    currency: "XCD",
    slot_step_min: 30,
    lead_time_min: 120,
    horizon_days: 60,
    cancel_cutoff_hours: 6,
    requires_confirmation: false,
    listed: false,
    payment_at_booking: "deposit",
    deposit_mode: "none",
    deposit_percent: null,
    deposit_fixed_minor: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  } as BookingProfilePublic;
}

function renderForm(
  overrides: Partial<BookingProfilePublic> = {},
  extra: Partial<{
    example: typeof EXAMPLE | null;
    depositsAvailable: boolean;
  }> = {}
) {
  return render(
    <DepositRuleForm
      currency="XCD"
      depositsAvailable={extra.depositsAvailable ?? true}
      example={extra.example === undefined ? EXAMPLE : extra.example}
      orgSlug="salon"
      profile={profile(overrides)}
    />
  );
}

describe("DepositRuleForm", () => {
  it("is off by default and asks for nothing until it is switched on", () => {
    renderForm();
    const toggle = screen.getByRole("switch", { name: SWITCH });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText(PERCENT)).toBeNull();
    expect(screen.queryByLabelText(AMOUNT)).toBeNull();
    expect(screen.getByText(OFF)).toBeTruthy();
  });

  it("shows the percentage and the preview once switched on", () => {
    renderForm();
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
    // No percentage is stored yet, so the rule is not complete.
    expect(screen.getByRole("alert").textContent).toMatch(TO_100);
    fireEvent.change(screen.getByLabelText(PERCENT), {
      target: { value: "50" },
    });
    expect(screen.getByTestId(PREVIEW).textContent).toBe(
      "Classic full set (EC$210): a deposit of EC$105 is paid online, and the remaining EC$105 is paid at the salon. Cancel at least 6 hours before to get your deposit back."
    );
  });

  it("gives the stored percentage rule and its preview", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
    expect(screen.getByLabelText(PERCENT)).toHaveProperty("value", "50");
    expect(screen.getByTestId(PREVIEW).textContent).toContain(
      "a deposit of EC$105 is paid online"
    );
  });

  it("takes a fixed amount and caps the preview at the price", () => {
    renderForm({ deposit_mode: "fixed", deposit_fixed_minor: 30_000 });
    expect(screen.getByLabelText(AMOUNT)).toHaveProperty("value", "300");
    expect(screen.getByTestId(PREVIEW).textContent).toBe(
      "Classic full set (EC$210): the full price is paid online to hold the booking."
    );
  });

  it("refuses an incomplete amount with a message, not a save", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    fireEvent.change(screen.getByLabelText(PERCENT), {
      target: { value: "150" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(TO_100);
  });

  it("says deposits are collected online only when the business has payments", () => {
    renderForm(
      { deposit_mode: "percent", deposit_percent: 50 },
      { depositsAvailable: false }
    );
    expect(screen.getByText(COLLECTED)).toBeTruthy();
  });

  it("asks for a priced service when there is none to preview", () => {
    renderForm(
      { deposit_mode: "percent", deposit_percent: 50 },
      { example: null }
    );
    expect(screen.getByText(ADD_PRICED)).toBeTruthy();
  });

  it("takes the cancellation hours from the business, not a fixed 24", () => {
    renderForm(
      { deposit_mode: "percent", deposit_percent: 50, cancel_cutoff_hours: 48 },
      { depositsAvailable: true }
    );
    expect(screen.getByTestId(PREVIEW).textContent).toContain(
      "Cancel at least 48 hours before to get your deposit back."
    );
    expect(screen.getByTestId(PREVIEW).textContent).not.toContain("24 hours");
  });
});

describe("previewSentence", () => {
  it("says a switched-off or zero rule leaves the booking without a deposit", () => {
    expect(
      previewSentence(
        EXAMPLE,
        {
          deposit_mode: "none",
          deposit_percent: null,
          deposit_fixed_minor: null,
        },
        "XCD",
        6
      )
    ).toBe("Classic full set (EC$210) is booked without a deposit.");
  });
});
