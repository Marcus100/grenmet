import type { BookingAgenda, BookingAgendaItem } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsConfirming } from "./needs-confirming";

function item(id: string, name: string): BookingAgendaItem {
  return {
    id,
    provider_id: "33333333-3333-4333-8333-333333333333",
    service_id: "44444444-4444-4444-8444-444444444444",
    service_name: "Gel manicure",
    customer_id: "55555555-5555-4555-8555-555555555555",
    customer_name: name,
    starts_at: "2026-11-30T14:00:00Z",
    ends_at: "2026-11-30T15:00:00Z",
    status: "pending",
    price_minor: 8000,
    currency: "XCD",
    deposit_minor: 0,
    payment_kind: "deposit",
    source: "online",
  };
}

function agenda(bookings: BookingAgendaItem[], total = bookings.length) {
  return {
    ok: true as const,
    value: {
      timezone: "America/Grenada",
      from_date: "2026-11-24",
      to_date: "2027-01-10",
      total,
      limit: 100,
      offset: 0,
      days: bookings.length ? [{ day: "2026-11-30", bookings }] : [],
    } satisfies BookingAgenda,
  };
}

describe("NeedsConfirming", () => {
  it("lists each waiting booking with customer, service, day and time, and the count", () => {
    render(
      <NeedsConfirming
        orgSlug="sea-salt"
        pending={agenda([
          item("a1", "Ada Lovelace"),
          item("b2", "Grace Hopper"),
        ])}
      />
    );
    const section = screen.getByRole("region", {
      name: "Needs confirming (2)",
    });
    const rows = within(section).getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/studio/sea-salt/bookings/a1");
    expect(rows[0]).toHaveTextContent("Ada Lovelace");
    expect(rows[0]).toHaveTextContent("Gel manicure");
    expect(rows[0]).toHaveTextContent("Monday, 30 November 2026, 10:00 am");
  });

  it("still shows the heading, saying nothing is waiting", () => {
    render(<NeedsConfirming orgSlug="sea-salt" pending={agenda([])} />);
    expect(
      screen.getByRole("heading", { name: "Needs confirming" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
  });

  it("says how many are shown when there are more than fit", () => {
    render(
      <NeedsConfirming
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")], 130)}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Needs confirming (130)" })
    ).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 130.")).toBeInTheDocument();
  });

  it("keeps the heading and explains a failed read", () => {
    render(
      <NeedsConfirming
        orgSlug="sea-salt"
        pending={{
          ok: false,
          failure: {
            kind: "unavailable",
            message: "We could not load this.",
            nextStep: "Try again.",
          },
        }}
      />
    );
    expect(
      screen.getByRole("heading", { name: "Needs confirming" })
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
  });
});
