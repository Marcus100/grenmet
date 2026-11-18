import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManageBookingActions } from "../lib/booking-types";
import { ManageBooking } from "./manage-booking";

const cancel = vi.fn<ManageBookingActions["cancel"]>();
const loadSlots = vi.fn<ManageBookingActions["loadSlots"]>();
const reschedule = vi.fn<ManageBookingActions["reschedule"]>();
const actions: ManageBookingActions = { cancel, loadSlots, reschedule };

const ORIGINAL_TIME = /5 January 2027, 9:30 am/u;
const CHANGES_CLOSE = /Changes close 24 hours before/u;
const CHANGES_CLOSE_ONE = /Changes close 1 hour before/u;
const MOVED_TIME = /6 January 2027, 9:30 am/u;
const HYBRID = /Hybrid/u;
const TOKEN = "secret-token-value-123";
const CALENDAR_HREF = `/booking/${TOKEN}/ics`;
const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};
const INSTAGRAM = /Instagram @teststudio/u;
const PAYMENT_DUE = /Payment of EC\$225 not received yet/u;
const DIRECTLY = /please contact the business directly\./u;
const CUTOFF =
  "Bookings can be cancelled online up to 24 hours before they start. Please contact the studio.";

const booking: BookingPublicDetail = {
  id: "b1",
  status: "confirmed",
  service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
  service_name: "Hybrid",
  provider_id: "p1",
  provider_name: "Jeriann",
  starts_at: "2027-01-05T13:30:00Z",
  ends_at: "2027-01-05T15:45:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 22_500,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
  contact: { ...NO_CONTACT, instagram: "teststudio" },
};

function renderManage(detail: BookingPublicDetail = booking) {
  return render(
    <ManageBooking
      actions={actions}
      booking={detail}
      calendarHref={CALENDAR_HREF}
      token={TOKEN}
    />
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  loadSlots.mockResolvedValue({
    ok: true,
    data: {
      timezone: "America/Grenada",
      slots: [
        { starts_at: "2027-01-06T13:30:00Z", ends_at: "2027-01-06T15:45:00Z" },
      ],
    },
  });
});

describe("ManageBooking", () => {
  it("shows the booking with a calendar download", () => {
    renderManage();
    expect(screen.getByRole("heading", { name: HYBRID })).toBeVisible();
    expect(screen.getByText(ORIGINAL_TIME)).toBeVisible();
    expect(screen.getByText("EC$225")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Add to calendar" })
    ).toHaveAttribute("href", CALENDAR_HREF);
  });

  it("cancels after a confirmation step", async () => {
    const user = userEvent.setup();
    cancel.mockResolvedValue({
      ok: true,
      data: { ...booking, status: "cancelled" },
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    expect(cancel).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText("Your booking is cancelled.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
  });

  it("explains the cutoff and removes the buttons when cancelling is refused", async () => {
    const user = userEvent.setup();
    cancel.mockResolvedValue({
      ok: false,
      code: "cutoff",
      message: CUTOFF,
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(CUTOFF);
    expect(screen.getByText(CHANGES_CLOSE)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Cancel booking" })
    ).not.toBeInTheDocument();
    // Under the refusal and in the "changes close" notice.
    const links = screen.getAllByRole("link", { name: INSTAGRAM });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "https://instagram.com/teststudio");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("offers no changes inside the cutoff to begin with", () => {
    renderManage({ ...booking, can_cancel: false });
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(CHANGES_CLOSE)).toBeVisible();
    expect(screen.getByRole("link", { name: INSTAGRAM })).toBeVisible();
  });

  it("says to contact the business directly when it set no contact", () => {
    renderManage({ ...booking, can_cancel: false, contact: NO_CONTACT });
    expect(screen.getByText(DIRECTLY)).toBeVisible();
    expect(screen.queryAllByRole("link", { name: INSTAGRAM })).toHaveLength(0);
  });

  it("writes a one-hour cutoff in the singular", () => {
    renderManage({ ...booking, can_cancel: false, cancel_cutoff_hours: 1 });
    expect(screen.getByText(CHANGES_CLOSE_ONE)).toBeVisible();
  });

  it("moves the booking to a chosen slot", async () => {
    const user = userEvent.setup();
    reschedule.mockResolvedValue({
      ok: true,
      data: { ...booking, starts_at: "2027-01-06T13:30:00Z" },
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Change time" }));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    await user.click(screen.getByRole("button", { name: "Move my booking" }));

    expect(reschedule).toHaveBeenCalledWith(TOKEN, "2027-01-06T13:30:00Z");
    expect(await screen.findByText("Your booking has moved.")).toBeVisible();
    expect(screen.getByText(MOVED_TIME)).toBeVisible();
  });

  it("says the slot was taken, clears the pick and reloads the times", async () => {
    const user = userEvent.setup();
    reschedule.mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: "That time has just been taken. Please choose another.",
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Change time" }));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    const before = loadSlots.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Move my booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "just been taken"
    );
    await waitFor(() =>
      expect(loadSlots.mock.calls.length).toBeGreaterThan(before)
    );
    expect(
      screen.getByRole("button", { name: "Move my booking" })
    ).toBeDisabled();
  });

  it("keeps a cancelled booking read-only", () => {
    renderManage({ ...booking, status: "cancelled" });
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Add to calendar" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
  });

  it("shows no payment block when nothing was due at booking", () => {
    renderManage();
    expect(
      screen.queryByRole("heading", { name: "Payment" })
    ).not.toBeInTheDocument();
  });

  it("offers Pay now while a payment is due and remembers the way back", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", `/salon/booking/${TOKEN}`);
    renderManage({
      ...booking,
      id: "8c7d3f0e-1111-4c53-9e0f-9d8f2b2f6c10",
      status: "pending_payment",
      deposit_minor: 22_500,
      payment: {
        status: "due",
        amount_minor: 22_500,
        paid_minor: 0,
        refunded_minor: 0,
        currency: "XCD",
        checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1",
      },
    });
    expect(screen.getByText(PAYMENT_DUE)).toBeVisible();
    const pay = screen.getByRole("link", { name: "Pay now" });
    expect(pay).toHaveAttribute(
      "href",
      "https://checkout.stripe.com/c/pay/cs_test_1"
    );
    pay.addEventListener("click", (event) => event.preventDefault());
    await user.click(pay);
    expect(
      window.sessionStorage.getItem(
        "barrels.bookings.return.8c7d3f0e-1111-4c53-9e0f-9d8f2b2f6c10"
      )
    ).toBe(`/salon/booking/${TOKEN}`);
  });

  it("says the payment arrived while the booking is still being confirmed", () => {
    renderManage({
      ...booking,
      status: "pending_payment",
      deposit_minor: 22_500,
      payment: {
        status: "paid",
        amount_minor: 22_500,
        paid_minor: 22_500,
        refunded_minor: 0,
        currency: "XCD",
        checkout_url: null,
      },
    });
    expect(
      screen.getByText("Payment received, confirming your booking")
    ).toBeVisible();
    expect(screen.queryByText("Waiting for payment")).not.toBeInTheDocument();
  });

  it("says when the payment was received", () => {
    renderManage({
      ...booking,
      deposit_minor: 22_500,
      payment: {
        status: "paid",
        amount_minor: 22_500,
        paid_minor: 22_500,
        refunded_minor: 0,
        currency: "XCD",
        checkout_url: null,
      },
    });
    expect(screen.getByText("Paid EC$225. Thank you.")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Pay now" })
    ).not.toBeInTheDocument();
  });
});
