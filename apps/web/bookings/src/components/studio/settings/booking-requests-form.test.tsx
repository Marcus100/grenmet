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
        "Customers who reach the limit are asked to contact you to book more."
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
