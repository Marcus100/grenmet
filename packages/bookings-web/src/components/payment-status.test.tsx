import type { BookingPaymentSummary } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaymentStatus } from "./payment-status";

const BOOKING_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const CHECKOUT = "https://checkout.stripe.com/c/pay/cs_test_123";
const MANAGE = `/bookings/manage/${BOOKING_ID}`;
const RETURN_KEY = `barrels.bookings.return.${BOOKING_ID}`;
const PAYMENT_NAME = /^Payment$/u;
const PAY_NOW = /Pay now/u;
const NOT_RECEIVED = /not received yet/u;
const HOLD = /Your time is held until it arrives/u;

function payment(
  overrides: Partial<BookingPaymentSummary> & {
    status: BookingPaymentSummary["status"];
  }
): BookingPaymentSummary {
  return {
    amount_minor: 5000,
    paid_minor: 0,
    refunded_minor: 0,
    balance_at_salon_minor: 0,
    currency: "XCD",
    checkout_url: null,
    ...overrides,
  };
}

function section() {
  return screen.getByRole("region", { name: PAYMENT_NAME });
}

describe("PaymentStatus", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  describe("due", () => {
    it("says the amount is not in yet and that the time is held", () => {
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          payment={payment({ status: "due", checkout_url: CHECKOUT })}
        />
      );
      const body = within(section());
      expect(body.getByText(NOT_RECEIVED)).toHaveTextContent(
        "Payment of EC$50 not received yet."
      );
      expect(body.getByText(HOLD)).toBeInTheDocument();
    });

    it("offers Pay now to the https checkout page", () => {
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          payment={payment({ status: "due", checkout_url: CHECKOUT })}
        />
      );
      const link = within(section()).getByRole("link", { name: PAY_NOW });
      expect(link).toHaveAttribute("href", CHECKOUT);
      expect(
        screen.queryByText("The business will tell you how to pay.")
      ).toBeNull();
    });

    it("remembers the manage path given by the host before leaving to pay", async () => {
      const user = userEvent.setup();
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          managePath={MANAGE}
          payment={payment({ status: "due", checkout_url: CHECKOUT })}
        />
      );
      await user.click(within(section()).getByRole("link", { name: PAY_NOW }));
      expect(window.sessionStorage.getItem(RETURN_KEY)).toBe(MANAGE);
    });

    it("remembers the current page when the host gives no manage path", async () => {
      const user = userEvent.setup();
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          payment={payment({ status: "due", checkout_url: CHECKOUT })}
        />
      );
      await user.click(within(section()).getByRole("link", { name: PAY_NOW }));
      expect(window.sessionStorage.getItem(RETURN_KEY)).toBe(
        window.location.pathname
      );
    });

    it("tells the visitor to ask the business when there is no online checkout", () => {
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          payment={payment({ status: "due", checkout_url: null })}
        />
      );
      expect(
        within(section()).getByText("The business will tell you how to pay.")
      ).toBeInTheDocument();
      expect(
        within(section()).queryByRole("link", { name: PAY_NOW })
      ).toBeNull();
    });

    it("never links to a checkout that is not https", () => {
      render(
        <PaymentStatus
          bookingId={BOOKING_ID}
          payment={payment({
            status: "due",
            checkout_url: "http://checkout.example.com/pay",
          })}
        />
      );
      expect(
        within(section()).queryByRole("link", { name: PAY_NOW })
      ).toBeNull();
      expect(
        within(section()).getByText("The business will tell you how to pay.")
      ).toBeInTheDocument();
    });
  });

  it("says the payment was received, with thanks, and offers no payment link", () => {
    render(
      <PaymentStatus
        bookingId={BOOKING_ID}
        payment={payment({
          status: "paid",
          paid_minor: 5000,
          checkout_url: CHECKOUT,
        })}
      />
    );
    expect(
      within(section()).getByText("Paid EC$50. Thank you.")
    ).toBeInTheDocument();
    expect(within(section()).queryByRole("link", { name: PAY_NOW })).toBeNull();
    expect(
      within(section()).queryByText("The business will tell you how to pay.")
    ).toBeNull();
  });

  it("shows the refund alongside a part-refunded payment", () => {
    render(
      <PaymentStatus
        bookingId={BOOKING_ID}
        payment={payment({
          status: "paid",
          paid_minor: 5000,
          refunded_minor: 2000,
          balance_at_salon_minor: 0,
        })}
      />
    );
    expect(
      within(section()).getByText("Paid EC$50; EC$20 refunded.")
    ).toBeInTheDocument();
  });

  it("says the payment was refunded in full", () => {
    render(
      <PaymentStatus
        bookingId={BOOKING_ID}
        payment={payment({ status: "refunded", paid_minor: 5000 })}
      />
    );
    expect(
      within(section()).getByText("Your payment of EC$50 was refunded.")
    ).toBeInTheDocument();
    expect(within(section()).queryByRole("link", { name: PAY_NOW })).toBeNull();
  });

  it("says no payment was made when the booking closed unpaid", () => {
    render(
      <PaymentStatus
        bookingId={BOOKING_ID}
        payment={payment({ status: "unpaid", checkout_url: CHECKOUT })}
      />
    );
    expect(
      within(section()).getByText("The payment of EC$50 was not made.")
    ).toBeInTheDocument();
    // Only a due payment is ever payable.
    expect(within(section()).queryByRole("link", { name: PAY_NOW })).toBeNull();
  });

  it("labels the section by its heading and marks the status for styling", () => {
    const { container } = render(
      <PaymentStatus
        bookingId={BOOKING_ID}
        payment={payment({ status: "paid", paid_minor: 5000 })}
      />
    );
    expect(section()).toHaveClass("payment", "payment-paid");
    expect(container.querySelector("h3")).toHaveTextContent("Payment");
  });
});
