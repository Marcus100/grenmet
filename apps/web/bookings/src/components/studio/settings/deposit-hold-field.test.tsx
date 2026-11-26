import type { BookingProfilePublic } from "@barrelsgd/api-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { saveProfileAction } from "@/app/studio/[orgSlug]/settings/actions";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveProfileAction: vi.fn(async () => ({ status: "idle" })),
}));

import { DepositHoldField } from "./deposit-hold-field";
import { DepositRuleForm } from "./deposit-rule-form";

const HOLD = /Hold a booking for its deposit/u;
const CARD_CAP = /Card payments online are kept at most 2 hours/u;
const DIRECT_NOTE = /does not apply when customers pay you directly/u;
const SAVE = "Save deposit rule";
const CHOICES = [
  "Default (30 minutes)",
  "30 minutes",
  "2 hours",
  "12 hours",
  "24 hours",
  "48 hours",
  "3 days",
  "7 days",
];

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
    deposit_hold_minutes: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  } as BookingProfilePublic;
}

function renderRule(
  overrides: Partial<BookingProfilePublic> = {},
  collection: "online" | "business" = "online"
) {
  return render(
    <DepositRuleForm
      collection={collection}
      currency="XCD"
      depositsAvailable
      example={null}
      orgSlug="salon"
      profile={profile(overrides)}
    />
  );
}

function optionTexts(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("DepositHoldField", () => {
  it("offers the sensible choices with the default first", () => {
    render(<DepositHoldField saved={null} />);
    expect(optionTexts(screen.getByLabelText(HOLD))).toEqual(CHOICES);
  });

  it("selects the default when nothing is saved", () => {
    render(<DepositHoldField saved={null} />);
    expect(screen.getByLabelText(HOLD)).toHaveValue("default");
  });

  it("selects a saved choice by its minutes", () => {
    render(<DepositHoldField saved={2880} />);
    expect(screen.getByLabelText(HOLD)).toHaveValue("2880");
  });

  it("keeps a saved value outside the choices as its own option", () => {
    render(<DepositHoldField saved={90} />);
    const select = screen.getByLabelText(HOLD);
    expect(select).toHaveValue("90");
    expect(optionTexts(select)).toContain("90 minutes");
  });

  it("is unnamed, so it is not sent, until the person changes it", () => {
    render(<DepositHoldField saved={120} />);
    const select = screen.getByLabelText(HOLD);
    expect(select).not.toHaveAttribute("name");
    fireEvent.change(select, { target: { value: "1440" } });
    expect(select).toHaveAttribute("name", "depositHoldMinutes");
    expect(select).toHaveValue("1440");
  });

  it("explains the hold, including the 2 hour card cap and the business case", () => {
    render(<DepositHoldField saved={null} />);
    expect(screen.getByText(CARD_CAP)).toBeVisible();
    expect(screen.getByText(DIRECT_NOTE)).toBeVisible();
  });
});

describe("the hold field in the deposit rule", () => {
  it("is shown for a deposit paid online", () => {
    renderRule({ deposit_hold_minutes: 1440 }, "online");
    expect(screen.getByLabelText(HOLD)).toHaveValue("1440");
  });

  it("is hidden when customers pay the business directly", () => {
    renderRule({}, "business");
    expect(screen.queryByLabelText(HOLD)).not.toBeInTheDocument();
  });

  it("sends the hold only when it was changed", async () => {
    vi.mocked(saveProfileAction).mockClear();
    renderRule({ deposit_hold_minutes: null });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(saveProfileAction).toHaveBeenCalledTimes(1));
    const unchanged = vi.mocked(saveProfileAction).mock.calls.at(-1)?.[2];
    expect(unchanged?.get("section")).toBe("deposit");
    expect(unchanged?.has("depositHoldMinutes")).toBe(false);
  });

  it("posts the chosen hold in minutes when it was changed", async () => {
    vi.mocked(saveProfileAction).mockClear();
    renderRule({ deposit_hold_minutes: null });
    fireEvent.change(screen.getByLabelText(HOLD), {
      target: { value: "4320" },
    });
    fireEvent.click(screen.getByRole("button", { name: SAVE }));
    await waitFor(() => expect(saveProfileAction).toHaveBeenCalledTimes(1));
    const body = vi.mocked(saveProfileAction).mock.calls.at(-1)?.[2];
    expect(body?.get("depositHoldMinutes")).toBe("4320");
  });
});
