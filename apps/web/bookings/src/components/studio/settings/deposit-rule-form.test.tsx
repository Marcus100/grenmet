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
const MONEY_RULE = /at most two decimal places/u;
const NO_DEPOSIT = /booked without a deposit/u;
const FIXED_CHOICE = /A fixed amount/u;
const PERCENT = /Deposit percentage/u;
const AMOUNT = /Deposit amount/u;
const PREVIEW = "deposit-preview";
const EXAMPLE = {
  name: "Classic full set",
  priceMinor: 21_000,
  ownDepositMinor: 0,
};
const OWN_DEPOSIT = { ...EXAMPLE, ownDepositMinor: 4000 };

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

const TOUCH_RE_1 = /Deposit amount \(EC\$\)/u;
const TOUCH_RE_2 = /\(XCD\)/u;
const TOUCH_RE_3 = /-hint/u;
const TOUCH_RE_4 = /The amount in EC\$/u;
const TOUCH_RE_5 = /text-base/u;
const TOUCH_RE_6 = /A service's own deposit always wins over this rule/u;
const TOUCH_RE_7 = /edit that service under Services/u;
const TOUCH_RE_8 = /pays at the salon/u;

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

  it("refuses an incomplete amount with a message, and shows no preview", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    fireEvent.change(screen.getByLabelText(PERCENT), {
      target: { value: "150" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(TO_100);
    expect(screen.queryByTestId(PREVIEW)).toBeNull();
    expect(screen.queryByText(NO_DEPOSIT)).toBeNull();
  });

  it("parses a typed amount with the shared money rules", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    fireEvent.click(screen.getByLabelText(FIXED_CHOICE));
    fireEvent.change(screen.getByLabelText(AMOUNT), {
      target: { value: "12.345" },
    });
    expect(screen.getByRole("alert").textContent).toMatch(MONEY_RULE);
    fireEvent.change(screen.getByLabelText(AMOUNT), {
      target: { value: "0.5" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId(PREVIEW).textContent).toContain("EC$0.50");
  });

  it("says a service's own deposit applies instead of the rule", () => {
    renderForm(
      { deposit_mode: "percent", deposit_percent: 50 },
      { example: OWN_DEPOSIT }
    );
    expect(screen.getByTestId(PREVIEW).textContent).toBe(
      "Classic full set (EC$210) has its own deposit of EC$40, which applies instead of this rule. Cancel at least 6 hours before to get your deposit back."
    );
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

describe("DepositRuleForm touch and accessibility", () => {
  it("labels the amount in EC$, the same word as the preview", () => {
    renderForm({ deposit_mode: "fixed", deposit_fixed_minor: 30_000 });
    expect(screen.getByLabelText(TOUCH_RE_1)).toHaveProperty("value", "300");
    expect(screen.queryByText(TOUCH_RE_2)).toBeNull();
  });

  it("gives the percentage and amount a placeholder and a linked hint", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    const percent = screen.getByLabelText(PERCENT);
    expect(percent).toHaveAttribute("placeholder", "25");
    expect(percent.getAttribute("aria-describedby")).toMatch(TOUCH_RE_3);
    fireEvent.click(screen.getByLabelText(FIXED_CHOICE));
    const amount = screen.getByLabelText(AMOUNT);
    expect(amount).toHaveAttribute("placeholder", "50.00");
    expect(screen.getByText(TOUCH_RE_4)).toBeTruthy();
  });

  it("marks an invalid input and points it at the error", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    const percent = screen.getByLabelText(PERCENT);
    expect(percent).not.toHaveAttribute("aria-invalid");
    fireEvent.change(percent, { target: { value: "150" } });
    expect(percent).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert.id).toBeTruthy();
    expect(percent.getAttribute("aria-describedby")).toContain(alert.id);
    expect(alert.className).toMatch(TOUCH_RE_5);
  });

  it("says a service's own deposit wins and where to change it", () => {
    renderForm({ deposit_mode: "percent", deposit_percent: 50 });
    expect(screen.getByText(TOUCH_RE_6)).toBeTruthy();
    expect(screen.getByText(TOUCH_RE_7)).toBeTruthy();
  });

  it("says the booking is paid at the salon when no payment route exists", () => {
    renderForm(
      { deposit_mode: "percent", deposit_percent: 50 },
      { depositsAvailable: false }
    );
    expect(screen.getByTestId(PREVIEW).textContent).toBe(
      "Classic full set (EC$210) is paid at the salon: online deposits need this business to have online payments switched on."
    );
    expect(screen.getByText(COLLECTED).textContent).toMatch(TOUCH_RE_8);
  });
});

describe("previewSentence without a payment route", () => {
  it("does not promise an online deposit or a refund", () => {
    expect(
      previewSentence(
        { name: "Facial", priceMinor: 9000, ownDepositMinor: 2500 },
        {
          deposit_mode: "percent",
          deposit_percent: 50,
          deposit_fixed_minor: null,
        },
        "XCD",
        6,
        false
      )
    ).toBe(
      "Facial (EC$90) is paid at the salon: online deposits need this business to have online payments switched on."
    );
  });
});

describe("previewSentence own deposit", () => {
  it("names the service's own deposit and not the rule when it is set", () => {
    expect(
      previewSentence(
        { name: "Facial", priceMinor: 9000, ownDepositMinor: 2500 },
        {
          deposit_mode: "percent",
          deposit_percent: 50,
          deposit_fixed_minor: null,
        },
        "XCD",
        undefined
      )
    ).toBe(
      "Facial (EC$90) has its own deposit of EC$25, which applies instead of this rule."
    );
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

const NON_REFUNDABLE = /Non-refundable deposit/u;
const KEPT_IF_CANCELLED = /a paid deposit is kept if the booking is cancelled/u;
const DECLINE_REFUNDED = /A booking you decline/u;
const MIN_PRICE = /Lowest service price that takes a deposit \(EC\$\)/u;
const MIN_OVER_PRICE = /below the lowest price for a deposit/u;
const NON_REFUNDABLE_SENTENCE =
  /Your deposit is non-refundable once your booking is confirmed\. You can move your booking up to 6 hours before; it stays with your booking\./u;

describe("DepositRuleForm deposit options", () => {
  it("shows the non-refundable switch off by default, with a plain explanation", () => {
    renderForm();
    const toggle = screen.getByLabelText(NON_REFUNDABLE);
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(KEPT_IF_CANCELLED)).toBeTruthy();
    expect(screen.getByText(DECLINE_REFUNDED)).toBeTruthy();
  });

  it("shows the switch on for a stored non-refundable deposit", () => {
    renderForm({
      deposit_non_refundable: true,
    } as Partial<BookingProfilePublic>);
    expect(
      (screen.getByLabelText(NON_REFUNDABLE) as HTMLInputElement).checked
    ).toBe(true);
  });

  it("asks for the lowest price in EC$ once the rule is on", () => {
    renderForm({ deposit_mode: "fixed", deposit_fixed_minor: 4000 });
    expect(screen.getByLabelText(MIN_PRICE)).toBeTruthy();
  });

  it("previews the non-refundable promise in place of the refund promise", () => {
    expect(
      previewSentence(
        EXAMPLE,
        {
          deposit_mode: "fixed",
          deposit_percent: null,
          deposit_fixed_minor: 4000,
        },
        "XCD",
        6,
        true,
        true
      )
    ).toMatch(NON_REFUNDABLE_SENTENCE);
  });

  it("says a service below the lowest price takes no deposit, and why", () => {
    const cheap = { ...EXAMPLE, priceMinor: 1500 };
    const sentence = previewSentence(
      cheap,
      {
        deposit_mode: "fixed",
        deposit_percent: null,
        deposit_fixed_minor: 4000,
        deposit_min_price_minor: 5000,
      },
      "XCD",
      6
    );
    expect(sentence).toMatch(NO_DEPOSIT);
    expect(sentence).toMatch(MIN_OVER_PRICE);
  });
});
