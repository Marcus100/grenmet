import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction: vi.fn(),
}));

import { NewBookingForm } from "./new-booking-form";

const CLOCK = /America\/Grenada/;
const S1 = "44444444-4444-4444-8444-444444444444";
const S2 = "44444444-4444-4444-8444-444444444445";

function service(id: string, name: string) {
  return {
    id,
    name,
    category: null,
    description: null,
    duration_min: 60,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 15_000,
    deposit_minor: 2500,
    active: true,
    sort_order: 0,
  };
}

function provider(id: string, name: string, serviceIds: string[]) {
  return {
    id,
    name,
    user_id: null,
    active: true,
    sort_order: 0,
    service_ids: serviceIds,
  };
}

describe("new booking form", () => {
  it("offers only providers for the chosen service and names the clock", () => {
    render(
      <NewBookingForm
        idempotencyKey="99999999-9999-4999-8999-999999999999"
        orgSlug="sea-salt"
        providers={[provider("p1", "Maya", [S1]), provider("p2", "Kofi", [S2])]}
        services={[service(S1, "Massage"), service(S2, "Facial")]}
        today="2026-10-21"
        zone="America/Grenada"
      />
    );
    expect(screen.getByRole("option", { name: "Maya" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Kofi" })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Service"), {
      target: { value: S2 },
    });
    expect(screen.getByRole("option", { name: "Kofi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-21");
    expect(screen.getByText(CLOCK)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save booking" })).toBeEnabled();
  });
});
