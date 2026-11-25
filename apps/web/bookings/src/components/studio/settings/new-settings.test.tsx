import type {
  BookingProfilePublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveProfileAction: vi.fn(),
  saveServiceAction: vi.fn(),
}));

import { BookingPolicyForm } from "./booking-policy-form";
import { DepositRuleForm } from "./deposit-rule-form";
import { PaymentsForm } from "./payments-form";
import { PaymentsPanel } from "./payments-panel";
import { ServiceForm } from "./service-form";
import { PaymentsSummary } from "./settings-sections";

const ONLINE = "Online, by card at booking";
const BUSINESS = "Paid to me directly (bank transfer, PayPal, cash)";
const INSTRUCTIONS = "Payment instructions";
const FULL_PRICE_CHOICE = /Full price, paid online by card/u;
const SAVE_PAYMENTS = "Save payment choice";
const SAVE_POLICY = "Save booking policy";
const OVER_500 = /Shorten the instructions to 500 characters/u;
const NO_INSTRUCTIONS = /Add instructions so customers know/u;
const COLLECTS_NOTHING = /Barrels collects nothing/u;
const FEE = /^Late fee \(EC\$\)/u;
const GRACE = "Grace period (minutes)";
const PREVIEW = "late-fee-preview";
const SAVE_NOTE = /Save the payment choice above to update this section/u;
const ALSO_OFF_HINT =
  /They will not see it as an extra until you switch add-ons on/u;
const ONLINE_ONLY = /Deposits are collected online only/u;
const TICK_NONE = /Tick none to offer it with every main service/u;
const PAID_DIRECT = /Paid to you directly by the customer/u;
const KEPT = /the deposit is kept if the customer cancels/u;
const NEVER_HOLDS = /Barrels never holds this money/u;
const IS_ADD_ON = "This is an add-on";
const ALSO_ADD_ON = "Also offer as an add-on";
const EVERY_MAIN = /offered with every main service/u;

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
    cancel_cutoff_hours: 6,
    payment_at_booking: "deposit",
    deposit_mode: "percent",
    deposit_percent: 25,
    deposit_fixed_minor: null,
    ...overrides,
  } as BookingProfilePublic;
}

function service(
  overrides: Partial<BookingServicePublic> = {}
): BookingServicePublic {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Lash tint",
    category: null,
    description: null,
    duration_min: 15,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 1000,
    deposit_minor: 0,
    active: true,
    sort_order: 0,
    is_add_on: false,
    add_on_categories: [],
    ...overrides,
  } as BookingServicePublic;
}

function renderPayments(overrides: Partial<BookingProfilePublic> = {}) {
  render(
    <PaymentsForm
      cardPaymentsAvailable
      orgSlug="salon"
      profile={profile(overrides)}
    />
  );
}

describe("deposit collection choice", () => {
  it("defaults to online, with no instructions box and the card choice on the page", () => {
    renderPayments();
    expect(screen.getByRole("radio", { name: ONLINE })).toBeChecked();
    expect(screen.queryByLabelText(INSTRUCTIONS)).toBeNull();
    expect(
      screen.getByRole("radio", { name: FULL_PRICE_CHOICE })
    ).toBeVisible();
  });

  it("shows the instructions box, the plain explanation and hides the card choice in business mode", () => {
    renderPayments();
    fireEvent.click(screen.getByRole("radio", { name: BUSINESS }));
    expect(screen.getByLabelText(INSTRUCTIONS)).toBeVisible();
    expect(screen.getByText(COLLECTS_NOTHING)).toBeVisible();
    expect(screen.queryByRole("radio", { name: FULL_PRICE_CHOICE })).toBeNull();
  });

  it("starts in business mode with the stored instructions and a live count", () => {
    renderPayments({
      deposit_collection: "business",
      deposit_instructions: "Send to 1234",
    });
    const box = screen.getByLabelText(INSTRUCTIONS);
    expect(box).toHaveValue("Send to 1234");
    expect(screen.getByText("12 of 500 characters")).toBeVisible();
    fireEvent.change(box, { target: { value: "Send to 1234 please" } });
    expect(screen.getByText("19 of 500 characters")).toBeVisible();
    expect(box.getAttribute("aria-describedby")).toContain(
      "deposit-instructions-count"
    );
  });

  it("asks for instructions when the box is empty but still lets the form save", () => {
    renderPayments({ deposit_collection: "business" });
    expect(screen.getByText(NO_INSTRUCTIONS)).toBeVisible();
    expect(screen.getByText("0 of 500 characters")).toBeVisible();
  });

  it("flags more than 500 characters next to the box and blocks Save", () => {
    renderPayments({ deposit_collection: "business" });
    const box = screen.getByLabelText(INSTRUCTIONS);
    fireEvent.change(box, { target: { value: "a".repeat(501) } });
    expect(screen.getByRole("alert")).toHaveTextContent(OVER_500);
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box.getAttribute("aria-describedby")).toContain(
      "deposit-instructions-error"
    );
    expect(screen.getByRole("button", { name: SAVE_PAYMENTS })).toBeDisabled();
    fireEvent.change(box, { target: { value: "a".repeat(500) } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not block Save for an over-long box once the choice is online again", () => {
    renderPayments({ deposit_collection: "business" });
    fireEvent.change(screen.getByLabelText(INSTRUCTIONS), {
      target: { value: "a".repeat(501) },
    });
    fireEvent.click(screen.getByRole("radio", { name: ONLINE }));
    expect(screen.queryByLabelText(INSTRUCTIONS)).toBeNull();
  });
});

describe("deposit rule without the payments entitlement", () => {
  const example = { name: "Full set", priceMinor: 20_000, ownDepositMinor: 0 };

  function renderRule(collection: "online" | "business") {
    render(
      <DepositRuleForm
        collection={collection}
        currency="XCD"
        depositsAvailable={false}
        example={example}
        orgSlug="salon"
        profile={profile()}
      />
    );
  }

  it("is usable in business mode: no online-payments warning and a paid-to-you preview", () => {
    renderRule("business");
    expect(screen.queryByText(ONLINE_ONLY)).toBeNull();
    expect(screen.getByTestId("deposit-preview")).toHaveTextContent(
      "a deposit of EC$50 is paid to you directly, and the remaining EC$150 is paid at the salon."
    );
    expect(
      screen.getByRole("button", { name: "Save deposit rule" })
    ).toBeEnabled();
  });

  it("keeps the old warning online without the entitlement", () => {
    renderRule("online");
    expect(screen.getByText(ONLINE_ONLY)).toBeVisible();
  });
});

describe("late fee fields", () => {
  function renderPolicy(overrides: Partial<BookingProfilePublic> = {}) {
    render(
      <BookingPolicyForm
        currency="XCD"
        orgSlug="salon"
        profile={profile(overrides)}
      />
    );
  }

  it("blank fee: no late fee and a plain preview", () => {
    renderPolicy();
    expect(screen.getByLabelText(FEE)).toHaveValue("");
    expect(screen.getByTestId(PREVIEW)).toHaveTextContent(
      "Customers see no late fee."
    );
  });

  it("zero fee counts as no late fee", () => {
    renderPolicy();
    fireEvent.change(screen.getByLabelText(FEE), { target: { value: "0" } });
    expect(screen.getByTestId(PREVIEW)).toHaveTextContent(
      "Customers see no late fee."
    );
  });

  it("previews the sentence customers read, with EC$ and the grace period", () => {
    renderPolicy({ late_fee_minor: 2000, late_grace_min: 15 });
    expect(screen.getByLabelText(FEE)).toHaveValue("20");
    expect(screen.getByLabelText(GRACE)).toHaveValue("15");
    expect(screen.getByTestId(PREVIEW)).toHaveTextContent(
      "Customers will see: Arriving more than 15 minutes late adds a late fee of EC$20."
    );
    fireEvent.change(screen.getByLabelText(GRACE), { target: { value: "0" } });
    expect(screen.getByTestId(PREVIEW)).toHaveTextContent(
      "Arriving late adds a late fee of EC$20."
    );
    fireEvent.change(screen.getByLabelText(GRACE), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(FEE), { target: { value: "7.5" } });
    expect(screen.getByTestId(PREVIEW)).toHaveTextContent(
      "Arriving more than 1 minute late adds a late fee of EC$7.50."
    );
  });

  it("shows the error next to the field, ties it with aria-describedby and blocks Save", () => {
    renderPolicy({ late_fee_minor: 2000, late_grace_min: 15 });
    fireEvent.change(screen.getByLabelText(GRACE), {
      target: { value: "241" },
    });
    const grace = screen.getByLabelText(GRACE);
    expect(grace).toHaveAttribute("aria-invalid", "true");
    expect(grace.getAttribute("aria-describedby")).toContain(
      "late-grace-error"
    );
    expect(
      screen.getByText("Enter whole minutes from 0 to 240.")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: SAVE_POLICY })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(FEE), { target: { value: "abc" } });
    expect(screen.getByLabelText(FEE)).toHaveAttribute("aria-invalid", "true");
  });
});

describe("service add-on switches", () => {
  function renderService(overrides: Partial<BookingServicePublic> = {}) {
    render(
      <ServiceForm
        addOnCategories={["Lashes", "Brows"]}
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        service={service(overrides)}
      />
    );
  }

  it("starts with both off and no category picker", () => {
    renderService();
    expect(
      screen.getByRole("checkbox", { name: ALSO_ADD_ON })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: IS_ADD_ON })).not.toBeChecked();
    expect(screen.queryByText("Offer it with these categories")).toBeNull();
  });

  it("also-add-on shows the category picker and says empty means every main service", () => {
    renderService({ also_add_on: true, add_on_categories: ["Lashes"] });
    expect(screen.getByRole("checkbox", { name: ALSO_ADD_ON })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Lashes" })).toBeChecked();
    expect(screen.getByText(TICK_NONE)).toBeVisible();
  });

  it("turning one on turns the other off, both ways", () => {
    renderService({ also_add_on: true });
    const only = screen.getByRole("checkbox", { name: IS_ADD_ON });
    const also = screen.getByRole("checkbox", { name: ALSO_ADD_ON });
    fireEvent.click(only);
    expect(only).toBeChecked();
    expect(also).not.toBeChecked();
    fireEvent.click(also);
    expect(also).toBeChecked();
    expect(only).not.toBeChecked();
    fireEvent.click(also);
    expect(also).not.toBeChecked();
    expect(only).not.toBeChecked();
  });

  it("shows a stored service with both flags as add-on only", () => {
    renderService({ is_add_on: true, also_add_on: true });
    expect(screen.getByRole("checkbox", { name: IS_ADD_ON })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: ALSO_ADD_ON })
    ).not.toBeChecked();
  });

  it("says every main service when there are no categories to follow", () => {
    render(
      <ServiceForm
        addOnCategories={[]}
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: ALSO_ADD_ON }));
    expect(screen.getByText(EVERY_MAIN)).toBeVisible();
  });

  it("describes the deposit field as paid to the business in business mode", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositCollection="business"
        depositsAvailable={false}
        orgSlug="salon"
      />
    );
    expect(screen.getByText(PAID_DIRECT)).toBeVisible();
  });
});

describe("non-refundable wording", () => {
  const example = { name: "Full set", priceMinor: 20_000, ownDepositMinor: 0 };
  function renderRule(collection: "online" | "business") {
    render(
      <DepositRuleForm
        collection={collection}
        currency="XCD"
        depositsAvailable
        example={example}
        orgSlug="salon"
        profile={profile()}
      />
    );
  }

  it("online keeps the refund wording", () => {
    renderRule("online");
    expect(screen.getByText(KEPT)).toBeVisible();
  });

  it("paid to me says Barrels never holds the money and any refund is the business's own", () => {
    renderRule("business");
    expect(screen.getByText(NEVER_HOLDS)).toBeVisible();
    expect(screen.queryByText(KEPT)).toBeNull();
  });
});

describe("read-only payments summary", () => {
  it("shows online collection, the card choice and no late fee", () => {
    render(<PaymentsSummary currency="XCD" profile={profile()} />);
    expect(screen.getByText("Online, by card at booking")).toBeVisible();
    expect(screen.getByText("Service deposit")).toBeVisible();
    expect(screen.getByText("None")).toBeVisible();
  });

  it("shows paid-to-me, the instructions and the late fee with its grace", () => {
    render(
      <PaymentsSummary
        currency="XCD"
        profile={profile({
          deposit_collection: "business",
          deposit_instructions: "Send to 1234",
          late_fee_minor: 2000,
          late_grace_min: 15,
        })}
      />
    );
    expect(screen.getByText("Paid to the business directly")).toBeVisible();
    expect(screen.getByText("Send to 1234")).toBeVisible();
    expect(
      screen.getByText(
        "Arriving more than 15 minutes late adds a late fee of EC$20."
      )
    ).toBeVisible();
  });

  it("says none yet when paid-to-me has no instructions", () => {
    render(
      <PaymentsSummary
        currency="XCD"
        profile={profile({ deposit_collection: "business" })}
      />
    );
    expect(screen.getByText("None yet")).toBeVisible();
  });
});

describe("deposit rule follows the saved choice", () => {
  const example = { name: "Full set", priceMinor: 20_000, ownDepositMinor: 0 };

  function renderPanel(overrides: Partial<BookingProfilePublic> = {}) {
    render(
      <PaymentsPanel
        cardPaymentsAvailable
        currency="XCD"
        depositsAvailable={false}
        example={example}
        orgSlug="salon"
        profile={profile(overrides)}
      />
    );
  }

  it("shows no note while the radio matches the saved choice", () => {
    renderPanel();
    expect(screen.queryByText(SAVE_NOTE)).toBeNull();
  });

  it("says to save when the radio differs, and the note goes when it matches again", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: BUSINESS }));
    expect(screen.getByText(SAVE_NOTE)).toBeVisible();
    // The rule below still follows the saved (online) choice.
    expect(screen.getByText(ONLINE_ONLY)).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: ONLINE }));
    expect(screen.queryByText(SAVE_NOTE)).toBeNull();
  });

  it("also notes the other direction from a saved paid-to-me choice", () => {
    renderPanel({ deposit_collection: "business" });
    fireEvent.click(screen.getByRole("radio", { name: ONLINE }));
    expect(screen.getByText(SAVE_NOTE)).toBeVisible();
  });
});

describe("also-add-on hint", () => {
  it("says add-ons must be switched on when they are off", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    expect(screen.getByText(ALSO_OFF_HINT)).toBeVisible();
  });

  it("does not say it when add-ons are on", () => {
    render(
      <ServiceForm
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
      />
    );
    expect(screen.queryByText(ALSO_OFF_HINT)).toBeNull();
  });

  it("is a plain checkbox like the add-on-only box, with the hint attached", () => {
    render(
      <ServiceForm
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
      />
    );
    const box = screen.getByRole("checkbox", { name: ALSO_ADD_ON });
    expect(box).not.toHaveAttribute("role");
    expect(box).not.toHaveAttribute("aria-checked");
    expect(box.getAttribute("aria-describedby")).toContain("also-hint");
  });
});
