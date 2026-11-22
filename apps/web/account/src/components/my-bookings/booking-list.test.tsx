import type { BookingMyBooking } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookingList } from "./booking-list";

const BASE = "https://bookings.barrels.gd";
const PAYMENT_LINE = /Paid|refunded|Payment of/u;
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

  it("shows what was paid and refunded for a booking that had a payment", () => {
    const payment = {
      status: "paid" as const,
      amount_minor: 1500,
      paid_minor: 1500,
      refunded_minor: 0,
      currency: "XCD",
      checkout_url: null,
    };
    render(
      <BookingList
        bookings={[
          booking({ id: "a", payment }),
          booking({
            id: "b",
            payment: { ...payment, status: "refunded", refunded_minor: 1500 },
          }),
          booking({ id: "c" }),
        ]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    expect(screen.getByText("Paid EC$15")).toBeInTheDocument();
    expect(screen.getByText("Payment of EC$15 refunded")).toBeInTheDocument();
    expect(screen.queryAllByText(PAYMENT_LINE)).toHaveLength(2);
  });

  it("links a row to its manage page first, then to the business page", () => {
    render(
      <BookingList
        bookings={[
          booking({
            id: "a",
            manage_url: "https://bookings.barrels.gd/babydoll/booking/tok",
          }),
        ]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      "href",
      "https://bookings.barrels.gd/babydoll/booking/tok"
    );
    expect(links[0]).toHaveAccessibleName(
      "Manage booking, Bridal makeup with Babydoll Beauty Bar"
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "https://bookings.barrels.gd/babydoll"
    );
  });

  it("links to the business page on the bookings site when there is no manage link", () => {
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

  it("puts rows under the day they start, one heading per day", () => {
    render(
      <BookingList
        bookings={[
          booking({ id: "a" }),
          booking({
            id: "b",
            starts_at: new Date(2030, 0, 10, 13, 0).toISOString(),
            ends_at: new Date(2030, 0, 10, 14, 0).toISOString(),
          }),
          booking({
            id: "c",
            starts_at: new Date(2030, 0, 12, 10, 0).toISOString(),
            ends_at: new Date(2030, 0, 12, 11, 0).toISOString(),
          }),
        ]}
        bookingsBaseUrl={BASE}
        emptyBody="Appear here."
        emptyTitle="None"
      />
    );
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent("Thursday, 10 January 2030");
    expect(headings[1]).toHaveTextContent("Saturday, 12 January 2030");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
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
