import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const createBookingAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/studio/[orgSlug]/bookings/new/actions", () => ({
  createBookingAction,
}));

import { NewBookingForm } from "./new-booking-form";

const UUID = /^[0-9a-f-]{36}$/u;
const CLOCK = /America\/Grenada/u;
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

describe("idempotency key", () => {
  it("is made on mount, so the form is submittable only after it exists", () => {
    render(
      <NewBookingForm
        orgSlug="sea-salt"
        providers={[provider("p1", "Maya", [S1])]}
        services={[service(S1, "Massage")]}
        today="2026-10-21"
        zone="America/Grenada"
      />
    );
    const key = document.querySelector<HTMLInputElement>(
      'input[name="idempotencyKey"]'
    );
    expect(key?.value).toMatch(UUID);
  });
});

describe("new booking form", () => {
  it("offers only providers for the chosen service and names the clock", () => {
    render(
      <NewBookingForm
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

  it("keeps everything typed after a refused submit", async () => {
    createBookingAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "That time is taken.",
      nextStep: "Pick another time.",
    });
    render(
      <NewBookingForm
        orgSlug="sea-salt"
        providers={[provider("p1", "Maya", [S1])]}
        services={[service(S1, "Massage")]}
        today="2026-10-21"
        zone="America/Grenada"
      />
    );
    fireEvent.change(screen.getByLabelText("Customer name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("Start time"), {
      target: { value: "10:30" },
    });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "Prefers the quiet room" },
    });
    const firstKey = document.querySelector<HTMLInputElement>(
      'input[name="idempotencyKey"]'
    )?.value;
    fireEvent.click(screen.getByRole("button", { name: "Save booking" }));
    await screen.findByText("That time is taken.");
    const sent = createBookingAction.mock.calls[0]?.[2] as FormData;
    expect(sent.get("idempotencyKey")).toBe(firstKey);
    // A refused (conflict) submit rotates the key; the retry carries the new one.
    await waitFor(() =>
      expect(
        document.querySelector<HTMLInputElement>('input[name="idempotencyKey"]')
          ?.value
      ).not.toBe(firstKey)
    );
    fireEvent.click(screen.getByRole("button", { name: "Save booking" }));
    await waitFor(() => expect(createBookingAction).toHaveBeenCalledTimes(2));
    const retry = createBookingAction.mock.calls[1]?.[2] as FormData;
    expect(retry.get("idempotencyKey")).not.toBe(firstKey);
    expect(retry.get("idempotencyKey")).toMatch(UUID);
    expect(screen.getByLabelText("Customer name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Start time")).toHaveValue("10:30");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue(
      "Prefers the quiet room"
    );
  });
});
