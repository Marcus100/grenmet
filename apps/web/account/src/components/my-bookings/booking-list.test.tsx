import type { BookingMyBooking } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingList } from "./booking-list";

const BASE = "https://bookings.barrels.gd";
const TEN_TO_ELEVEN = /10:00 am to 11:00 am/u;

function booking(
  overrides: Partial<BookingMyBooking> & Pick<BookingMyBooking, "id">
): BookingMyBooking {
  return {
    status: "confirmed",
    starts_at: new Date(2030, 0, 10, 10, 0).toISOString(),
    ends_at: new Date(2030, 0, 10, 11, 0).toISOString(),
    service_name: "Bridal makeup",
    business_name: "Babydoll Beauty Bar",
    business_slug: "babydoll",
    ...overrides,
  };
}

describe("BookingList", () => {
  it("shows the business, service, time and status of each row", () => {
    render(
      <BookingList
        bookings={[booking({ id: "a" })]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Babydoll Beauty Bar")).toBeInTheDocument();
    expect(within(row).getByText("Bridal makeup")).toBeInTheDocument();
    expect(within(row).getByText("Confirmed")).toBeInTheDocument();
    expect(within(row).getByText(TEN_TO_ELEVEN)).toBeInTheDocument();
  });

  it("links each business to its page on the bookings site and nowhere else", () => {
    render(
      <BookingList
        bookings={[booking({ id: "a", business_slug: "babydoll" })]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://bookings.barrels.gd/babydoll"
    );
  });

  it("labels every known status in plain words", () => {
    const rows: BookingMyBooking[] = [
      "pending_payment",
      "pending",
      "confirmed",
      "cancelled",
      "no_show",
      "completed",
    ].map((status, index) =>
      booking({ id: `s${index}`, status: status as BookingMyBooking["status"] })
    );
    render(
      <BookingList
        bookings={rows}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    for (const label of [
      "Waiting for payment",
      "Waiting to be confirmed",
      "Confirmed",
      "Cancelled",
      "Marked as no-show",
      "Completed",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows an unknown status as the raw value", () => {
    render(
      <BookingList
        bookings={[
          booking({
            id: "u",
            status: "refund_pending" as BookingMyBooking["status"],
          }),
        ]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    expect(screen.getByText("refund_pending")).toBeInTheDocument();
  });

  it("shows the empty state in words when there are no rows", () => {
    render(
      <BookingList
        bookings={[]}
        bookingsBaseUrl={BASE}
        emptyBody="Bookings you make while signed in appear here."
        emptyTitle="No upcoming bookings"
      />
    );
    expect(screen.getByText("No upcoming bookings")).toBeInTheDocument();
    expect(
      screen.getByText("Bookings you make while signed in appear here.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
