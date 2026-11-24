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

const EXPIRY_LINE = /Expire|Expiring/u;

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

  it("says what the list covers", () => {
    render(<NeedsConfirming orgSlug="sea-salt" pending={agenda([])} />);
    expect(
      screen.getByText("Covers the last 11 weeks and the next 6 weeks.")
    ).toBeInTheDocument();
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

  const NOW = new Date("2026-11-29T14:00:00Z");
  const HELP =
    "Requests you don't confirm in time cancel themselves, and the customer is told.";

  it("shows the plain line under the heading only when something is waiting", () => {
    const { rerender } = render(
      <NeedsConfirming orgSlug="sea-salt" pending={agenda([])} />
    );
    expect(screen.queryByText(HELP)).not.toBeInTheDocument();
    rerender(
      <NeedsConfirming
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")])}
      />
    );
    expect(screen.getByText(HELP)).toBeInTheDocument();
  });

  it("counts down to the start time when requests expire only then", () => {
    render(
      <NeedsConfirming
        expiryHours={null}
        now={NOW}
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")])}
      />
    );
    // The booking starts 2026-11-30 14:00 UTC, 24 hours after NOW.
    expect(screen.getByText("Expires in 24 h")).toBeInTheDocument();
  });

  it("says Expiring now once the start time has passed", () => {
    render(
      <NeedsConfirming
        expiryHours={null}
        now={new Date("2026-12-01T00:00:00Z")}
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")])}
      />
    );
    expect(screen.getByText("Expiring now")).toBeInTheDocument();
  });

  it("shows nothing when the window is set, because agenda items carry no request time", () => {
    render(
      <NeedsConfirming
        expiryHours={24}
        now={NOW}
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")])}
      />
    );
    expect(screen.queryByText(EXPIRY_LINE)).not.toBeInTheDocument();
  });

  it("shows nothing when the window is unknown", () => {
    render(
      <NeedsConfirming
        now={NOW}
        orgSlug="sea-salt"
        pending={agenda([item("a1", "Ada Lovelace")])}
      />
    );
    expect(screen.queryByText(EXPIRY_LINE)).not.toBeInTheDocument();
  });
});
