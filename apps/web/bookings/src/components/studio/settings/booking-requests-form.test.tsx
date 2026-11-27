import type { BookingProfilePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveProfileAction: vi.fn(),
}));

import { BookingRequestsForm } from "./booking-requests-form";

const HOURS = "Hours until an unconfirmed request expires";
const LIMIT = "Most upcoming bookings one customer can hold online";
const START = "Only at the start time";
const TO_20 = /from 1 to 20/u;
const SAVE = "Save booking requests";
const HOLD_1 = /A customer may hold 1 upcoming booking at once\./u;
const HOLD_7 = /A customer may hold 7 upcoming bookings at once\./u;
const HOLD_5 = /A customer may hold 5 upcoming bookings at once\./u;
const HOLD_ANY = /A customer may hold/u;

function profile(extra: Partial<BookingProfilePublic>): BookingProfilePublic {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "org-1",
    public_slug: "salon",
    display_name: "Salon",
    ...extra,
  } as BookingProfilePublic;
}

describe("BookingRequestsForm", () => {
  it("shows the defaults 24 hours and 3 when the profile carries none", () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    expect(screen.getByLabelText(HOURS)).toHaveValue(24);
    expect(screen.getByLabelText(LIMIT)).toHaveValue(3);
  });

  it("shows stored values and the start-time choice for null", () => {
    render(
      <BookingRequestsForm
        orgSlug="salon"
        profile={profile({
          pending_expiry_hours: null,
          max_open_per_customer: 5,
        })}
      />
    );
    expect(screen.getByRole("radio", { name: START })).toBeChecked();
    expect(screen.getByLabelText(HOURS)).toBeDisabled();
    expect(screen.getByLabelText(LIMIT)).toHaveValue(5);
  });

  it("explains both rules in plain words", () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    expect(
      screen.getByText(
        "If you don't confirm a request in time, it cancels itself and the customer gets an email saying so."
      )
    ).toBeVisible();
    expect(
      screen.getByText(
        "A customer may hold 3 upcoming bookings at once. Beyond that, online booking is refused and the customer is asked to change or cancel one from the link in their booking email, or to contact you. The refusal never tells them the limit."
      )
    ).toBeVisible();
  });

  it("announces an out-of-range value and blocks Save", async () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    fireEvent.change(screen.getByLabelText(LIMIT), { target: { value: "21" } });
    expect(await screen.findByText(TO_20)).toBeVisible();
    expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(HOURS), { target: { value: "0" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("1 to 168");
  });

  it("lets the hours go once Only at the start time is chosen", () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    fireEvent.click(screen.getByRole("radio", { name: START }));
    expect(screen.getByLabelText(HOURS)).toBeDisabled();
  });
});

describe("the limit in plain words", () => {
  it("follows the number being typed, in the singular at 1", () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    fireEvent.change(screen.getByLabelText(LIMIT), { target: { value: "1" } });
    expect(screen.getByText(HOLD_1)).toBeVisible();
    fireEvent.change(screen.getByLabelText(LIMIT), { target: { value: "7" } });
    expect(screen.getByText(HOLD_7)).toBeVisible();
  });

  it("says nothing while the number is not one the API would take", () => {
    render(<BookingRequestsForm orgSlug="salon" profile={profile({})} />);
    fireEvent.change(screen.getByLabelText(LIMIT), { target: { value: "99" } });
    expect(screen.queryByText(HOLD_ANY)).toBeNull();
  });

  it("describes the stored limit when the form opens", () => {
    render(
      <BookingRequestsForm
        orgSlug="salon"
        profile={profile({ max_open_per_customer: 5 })}
      />
    );
    expect(screen.getByText(HOLD_5)).toBeVisible();
  });
});
