import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ saveProfileAction: vi.fn() }));
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);

import { BookingPolicyForm } from "./booking-policy-form";

const POLICY = "Policy text";
const SUGGEST = "Suggest text for me";
const NOT_SAVED = /Nothing is saved until you do/u;
const FEE_FIELD = /^Late fee \(EC\$\)/u;

function profile(overrides: Partial<BookingProfilePublic> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "org-1",
    public_slug: "salon",
    display_name: "Salon",
    ...overrides,
  } as BookingProfilePublic;
}

function renderForm(
  overrides: Partial<BookingProfilePublic> = {},
  takesDeposit = false
) {
  render(
    <BookingPolicyForm
      currency="XCD"
      orgSlug="salon"
      profile={profile(overrides)}
      takesDeposit={takesDeposit}
    />
  );
  return screen.getByLabelText(POLICY);
}

describe("booking policy suggestion", () => {
  it("offers a suggestion while the box is empty", () => {
    renderForm();
    expect(screen.getByRole("button", { name: SUGGEST })).toBeEnabled();
    expect(screen.getByText(NOT_SAVED)).toBeVisible();
  });

  it("does not offer one over a policy the business already wrote", () => {
    renderForm({ booking_policy: "Ours is simple: just turn up." });
    expect(screen.queryByRole("button", { name: SUGGEST })).toBeNull();
  });

  it("fills the box with text built from the business's own settings", () => {
    const box = renderForm(
      {
        cancel_cutoff_hours: 48,
        deposit_non_refundable: true,
        late_fee_minor: 2000,
        late_grace_min: 10,
      },
      true
    );
    fireEvent.click(screen.getByRole("button", { name: SUGGEST }));
    const filled = (box as HTMLTextAreaElement).value;
    expect(filled).toContain("48 hours");
    expect(filled).toContain("The deposit is not refunded");
    expect(filled).toContain(
      "Arriving more than 10 minutes late adds a late fee of EC$20."
    );
  });

  it("saves nothing by itself: the business still has to press Save", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: SUGGEST }));
    expect(actions.saveProfileAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save booking policy" })
    ).toBeEnabled();
  });

  it("stops offering once the box has text, and counts what it filled in", () => {
    const box = renderForm();
    fireEvent.click(screen.getByRole("button", { name: SUGGEST }));
    expect(screen.queryByRole("button", { name: SUGGEST })).toBeNull();
    const filled = (box as HTMLTextAreaElement).value;
    expect(
      screen.getByText(`${[...filled].length} of 1000 characters`)
    ).toBeVisible();
  });

  it("leaves the deposit paragraph out for a business that takes none", () => {
    const box = renderForm({}, false);
    fireEvent.click(screen.getByRole("button", { name: SUGGEST }));
    expect((box as HTMLTextAreaElement).value).not.toContain("Deposit:");
  });

  it("offers the suggestion again once the business clears the box", () => {
    const box = renderForm({ booking_policy: "Old terms." });
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: SUGGEST })).toBeEnabled();
  });

  it("uses the late fee on screen, not only the saved one", () => {
    const box = renderForm();
    fireEvent.change(screen.getByLabelText(FEE_FIELD), {
      target: { value: "35" },
    });
    fireEvent.change(screen.getByLabelText("Grace period (minutes)"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: SUGGEST }));
    expect((box as HTMLTextAreaElement).value).toContain(
      "Arriving more than 5 minutes late adds a late fee of EC$35."
    );
  });
});
