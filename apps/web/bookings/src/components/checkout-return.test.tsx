import { rememberManagePath } from "@barrelsgd/bookings-web/lib/booking-payment";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckoutReturnPage from "@/app/checkout/return/page";
import { CheckoutReturn } from "./checkout-return";

const BOOKING = "8c7d3f0e-1111-4c53-9e0f-9d8f2b2f6c10";
const CONFIRMING = /We are confirming your payment/u;
const STILL_HELD = /Your time stays held for a short while/u;

const replace = vi.fn();

function stubLocation() {
  vi.stubGlobal("location", { ...window.location, replace });
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  replace.mockReset();
});

describe("CheckoutReturn", () => {
  it("goes on to the remembered manage page", () => {
    stubLocation();
    rememberManagePath(BOOKING, "/salon/booking/tok");
    render(<CheckoutReturn bookingId={BOOKING} paid />);
    expect(replace).toHaveBeenCalledWith("/salon/booking/tok");
    expect(
      screen.getByRole("heading", { name: "Thank you for your payment" })
    ).toBeVisible();
  });

  it("explains where to find the booking after a payment from another browser", async () => {
    stubLocation();
    render(<CheckoutReturn bookingId={BOOKING} paid />);
    expect(await screen.findByText(CONFIRMING)).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });

  it("says the time is still held when the payment was not finished", async () => {
    stubLocation();
    render(<CheckoutReturn bookingId="not-a-booking" paid={false} />);
    expect(
      screen.getByRole("heading", { name: "Payment not finished" })
    ).toBeVisible();
    expect(await screen.findByText(STILL_HELD)).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("checkout return page", () => {
  it("reads the booking and the outcome from the address", async () => {
    stubLocation();
    render(
      await CheckoutReturnPage({
        searchParams: Promise.resolve({
          booking: BOOKING,
          result: "cancelled",
        }),
      })
    );
    expect(
      screen.getByRole("heading", { name: "Payment not finished" })
    ).toBeVisible();
  });
});
