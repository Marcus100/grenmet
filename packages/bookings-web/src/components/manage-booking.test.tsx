import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManageBookingActions } from "../lib/booking-types";
import { ManageBooking } from "./manage-booking";

const WILL_EMAIL = /We will email you a confirmation\./u;
const HOLD_LENGTH = /\(24 hours\) while we wait for your deposit\./u;
const HOLD_LINE =
  /Your time is held until .* while we wait for your deposit\./u;
const POLICY_LINE = /You can cancel or change this booking online/u;

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
const KEEP_IN_ONE_PLACE = "Keep your bookings in one place";
const LISTED_UNDER_MY_BOOKINGS = /listed under My bookings/u;
const PAYMENT_DUE = /Payment of EC\$225 not received yet/u;
const DIRECTLY = /please contact the business directly\./u;
const NAMED = /please contact Babydoll Beauty Bar/u;
const CUTOFF =
  "Bookings can be cancelled online up to 24 hours before they start. Please contact the studio.";

const PAY_BY = /^Pay by .*5 January 2027, 9:00 am/u;
const HELD_FOR_DEPOSIT = /while we wait for your deposit/u;
const NOT_RECEIVED = /not received yet/u;
const STAYS_A_REQUEST = /stays a request until they do/u;
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

  it("cancels after a confirmation step and says what happened", async () => {
    const user = userEvent.setup();
    cancel.mockResolvedValue({
      ok: true,
      data: { ...booking, status: "cancelled" },
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancel).not.toHaveBeenCalled();
    expect(screen.getByText(WILL_EMAIL)).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Yes, cancel my booking" })
    );

    expect(cancel).toHaveBeenCalledWith(TOKEN, null);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your booking is cancelled. We have emailed you a confirmation and told the business."
    );
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add to calendar" })
    ).not.toBeInTheDocument();
  });

  it("sends the optional reason the customer typed, trimmed", async () => {
    const user = userEvent.setup();
    cancel.mockResolvedValue({
      ok: true,
      data: { ...booking, status: "cancelled" },
    });
    renderManage();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    const reason = screen.getByLabelText("Reason for cancelling (optional)");
    expect(reason).toHaveAttribute("maxLength", "300");
    expect(reason).toHaveAccessibleDescription(
      "The business sees this reason. Leave it blank if you prefer."
    );
    await user.type(reason, "  Flight moved  ");
    await user.click(
      screen.getByRole("button", { name: "Yes, cancel my booking" })
    );
    expect(cancel).toHaveBeenCalledWith(TOKEN, "Flight moved");
  });

  it("keeps the booking when the customer changes their mind", async () => {
    const user = userEvent.setup();
    renderManage();
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.type(
      screen.getByLabelText("Reason for cancelling (optional)"),
      "Maybe not"
    );
    await user.click(screen.getByRole("button", { name: "Keep my booking" }));
    expect(cancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Cancel booking" })
    ).toBeVisible();
    // Asking again starts with an empty reason.
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(
      screen.getByLabelText("Reason for cancelling (optional)")
    ).toHaveValue("");
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
    await user.click(
      screen.getByRole("button", { name: "Yes, cancel my booking" })
    );

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

  it("states the rules line while the booking can still change", () => {
    renderManage();
    expect(
      screen.getByText(
        "No deposit for this service. Change or cancel online up to 24 hours before; after that, contact the business."
      )
    ).toBeVisible();
  });

  it("names the business in the rules line and the closed-changes notice", () => {
    const { unmount } = renderManage({
      ...booking,
      business_name: "Babydoll Beauty Bar",
    });
    expect(
      screen.getByText(
        "No deposit for this service. Change or cancel online up to 24 hours before; after that, contact Babydoll Beauty Bar."
      )
    ).toBeVisible();
    unmount();
    renderManage({
      ...booking,
      business_name: "Babydoll Beauty Bar",
      can_cancel: false,
    });
    expect(screen.getByText(NAMED)).toBeVisible();
  });

  it("falls back to the business when the name is empty", () => {
    renderManage({ ...booking, business_name: "  " });
    expect(
      screen.getByText(
        "No deposit for this service. Change or cancel online up to 24 hours before; after that, contact the business."
      )
    ).toBeVisible();
  });

  it("uses the booking's own non-refundable snapshot", () => {
    renderManage({
      ...booking,
      deposit_minor: 4000,
      deposit_non_refundable: true,
    });
    expect(
      screen.getByText(
        "EC$40 deposit, not refundable. Change or cancel online up to 24 hours before; after that, contact the business."
      )
    ).toBeVisible();
  });

  it("says a pending booking's non-refundable deposit follows the cut-off rule", () => {
    renderManage({
      ...booking,
      status: "pending",
      deposit_minor: 4000,
      deposit_non_refundable: true,
    });
    expect(
      screen.getByText(
        "EC$40 deposit, refunded if you cancel at least 24 hours before it starts. Change or cancel online up to 24 hours before; after that, contact the business."
      )
    ).toBeVisible();
  });

  it("shows the full policy only when the booking has policy text", async () => {
    const user = userEvent.setup();
    const { unmount } = renderManage({
      ...booking,
      booking_policy: "Deposits move with you, they never expire.",
    });
    await user.click(screen.getByText("Full policy"));
    expect(
      screen.getByText("Deposits move with you, they never expire.")
    ).toBeVisible();
    unmount();
    renderManage({ ...booking, booking_policy: null });
    expect(screen.queryByText("Full policy")).toBeNull();
  });

  it("says when an unpaid hold is released", () => {
    renderManage({
      ...booking,
      status: "pending_payment",
      hold_ends_at: "2027-01-05T13:00:00Z",
    });
    expect(screen.getByText(HOLD_LINE)).toBeVisible();
  });

  it("names the hold length beside the release time", () => {
    renderManage({
      ...booking,
      status: "pending_payment",
      hold_ends_at: "2027-01-05T13:00:00Z",
      hold_minutes: 1440,
    });
    expect(screen.getByText(HOLD_LENGTH)).toBeVisible();
  });

  it("hides the hold line once the booking is no longer awaiting payment", () => {
    renderManage({
      ...booking,
      status: "confirmed",
      hold_ends_at: "2027-01-05T13:00:00Z",
      hold_minutes: 1440,
    });
    expect(screen.queryByText(HOLD_LINE)).not.toBeInTheDocument();
  });

  it("keeps a cancelled booking read-only", () => {
    renderManage({ ...booking, status: "cancelled" });
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(screen.queryByText(POLICY_LINE)).not.toBeInTheDocument();
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
        balance_at_salon_minor: 0,
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
        balance_at_salon_minor: 0,
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
        balance_at_salon_minor: 0,
        currency: "XCD",
        checkout_url: null,
      },
    });
    expect(screen.getByText("Paid EC$225. Thank you.")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Pay now" })
    ).not.toBeInTheDocument();
  });

  it("invites a guest to an account at the API's link, unchanged", () => {
    const inviteUrl =
      "https://auth.barrels.gd/signup?returnTo=https%3A%2F%2Fbookings.barrels.gd%2Fsignin%3FreturnTo%3D%2Fstudio";
    renderManage({ ...booking, account_invite_url: inviteUrl });
    expect(
      screen.getByRole("heading", { name: KEEP_IN_ONE_PLACE })
    ).toBeVisible();
    expect(screen.getByText(LISTED_UNDER_MY_BOOKINGS)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create an account or sign in" })
    ).toHaveAttribute("href", inviteUrl);
  });

  it("shows no account invitation when the API gives null", () => {
    renderManage({ ...booking, account_invite_url: null });
    expect(
      screen.queryByRole("heading", { name: KEEP_IN_ONE_PLACE })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create an account or sign in" })
    ).not.toBeInTheDocument();
  });

  it("shows no account invitation when the field is absent", () => {
    renderManage(booking);
    expect(screen.queryByText(KEEP_IN_ONE_PLACE)).not.toBeInTheDocument();
  });

  it("never puts the manage token into the invitation link", () => {
    renderManage({
      ...booking,
      account_invite_url:
        "https://auth.barrels.gd/signup?returnTo=%2Fsea-salt-spa",
    });
    const link = screen.getByRole("link", {
      name: "Create an account or sign in",
    });
    expect(link.getAttribute("href")).not.toContain(TOKEN);
  });

  it("lists the add-ons with their prices and the total", () => {
    renderManage({
      ...booking,
      price_minor: 7000,
      add_ons: [
        { name: "Lash tint", duration_min: 15, price_minor: 1000 },
        { name: "Brow wax", duration_min: 30, price_minor: 2000 },
      ],
    });
    expect(screen.getByText("Lash tint: +15 min, +EC$10")).toBeVisible();
    expect(screen.getByText("Brow wax: +30 min, +EC$20")).toBeVisible();
    expect(screen.getByText("Total")).toBeVisible();
    expect(screen.getByText("EC$70")).toBeVisible();
  });

  it("keeps the plain Price row when there are no add-ons", () => {
    renderManage({ ...booking, add_ons: [] });
    expect(screen.getByText("Price")).toBeVisible();
    expect(screen.queryByText("Add-ons")).toBeNull();
  });
});
const RX_1 = /not through Barrels/u;
const RX_2 = /Send EC\$53 to account 12345\./u;
const RX_3 = /How to pay your deposit/u;
const RX_4 = /Deposit to pay/u;
const RX_5 = /late fee/u;
const RX_6 = /first-time/u;
const RX_7 = /for first-time clients/iu;
const RX_8 = /Please book at least/u;

describe("business deposit, late fee and new clients on the manage page", () => {
  const WITH_DEPOSIT: BookingPublicDetail = {
    ...booking,
    status: "confirmed",
    business_name: "Babydoll Beauty Bar",
    deposit_to_business_minor: 5300,
    deposit_instructions: "Send EC$53 to account 12345.\nUse your name.",
    late_fee: { amount_minor: 2500, grace_min: 15 },
  };
  const DEPOSIT_AMOUNT = "Deposit to pay: EC$53";
  const LATE = "Arriving more than 15 minutes late adds a late fee of EC$25.";

  it("shows the deposit, the instructions and the late fee once accepted", () => {
    renderManage(WITH_DEPOSIT);
    expect(screen.getByText(DEPOSIT_AMOUNT)).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "How to pay your deposit to Babydoll Beauty Bar",
      })
    ).toBeVisible();
    expect(screen.getByText(RX_1)).toBeVisible();
    expect(screen.getByText(RX_2).textContent).toBe(
      "Send EC$53 to account 12345.\nUse your name."
    );
    expect(screen.getByText(LATE)).toBeVisible();
  });

  it("asks for nothing while the request waits: the amount, no instructions", () => {
    renderManage({ ...WITH_DEPOSIT, status: "pending" });
    expect(
      screen.getByText(
        "Nothing to pay yet. We will email you when Babydoll Beauty Bar accepts. You then pay a deposit of EC$53 directly to Babydoll Beauty Bar, not through Barrels."
      )
    ).toBeVisible();
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
    expect(screen.queryByText(RX_2)).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "How to pay your deposit to Babydoll Beauty Bar",
      })
    ).toBeNull();
    expect(screen.getByText(LATE)).toBeVisible();
  });

  it("shows received in place of the amount due and the instructions", () => {
    renderManage({ ...WITH_DEPOSIT, deposit_received: true });
    expect(screen.getByText("Deposit received: EC$53")).toBeVisible();
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
    expect(screen.queryByText(RX_3)).toBeNull();
    expect(screen.queryByText(RX_2)).toBeNull();
    // The late-fee rule still applies while the booking is open.
    expect(screen.getByText(LATE)).toBeVisible();
  });

  it("shows no instructions or fee once cancelled", () => {
    renderManage({
      ...WITH_DEPOSIT,
      status: "cancelled",
      can_cancel: false,
      deposit_instructions: null,
    });
    expect(screen.queryByText(DEPOSIT_AMOUNT)).toBeNull();
    expect(screen.queryByText(RX_3)).toBeNull();
    expect(screen.queryByText(LATE)).toBeNull();
  });

  it("changes nothing for an online booking with no such fields", () => {
    renderManage(booking);
    expect(screen.queryByText(RX_4)).toBeNull();
    expect(screen.queryByText(RX_5)).toBeNull();
    expect(screen.queryByText(RX_6)).toBeNull();
  });

  it("notes a new-clients booking as a request, without lead days", () => {
    renderManage({
      ...booking,
      status: "pending",
      new_clients_only: true,
      first_visit_lead_days: 7,
      first_visit_categories: ["lash"],
    });
    expect(screen.getByText(RX_7)).toBeVisible();
    expect(screen.queryByText(RX_8)).toBeNull();
  });
});

describe("a request paid after the business accepts", () => {
  const NOTHING_YET =
    "Nothing to pay yet. We will email you when Babydoll Beauty Bar accepts. You pay then (EC$50).";
  const ACCEPTED_LINE =
    "Babydoll Beauty Bar accepted your request. Pay EC$50 to confirm your booking.";
  const request: BookingPublicDetail = {
    ...booking,
    business_name: "Babydoll Beauty Bar",
    status: "pending",
    deposit_minor: 5000,
    pay_after_acceptance: true,
    new_clients_only: true,
    payment: null,
  };

  it("asks for nothing before the business accepts: no Pay now, no hold", () => {
    renderManage(request);
    expect(screen.getByText("Waiting for the studio to confirm")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Payment" })).toBeVisible();
    expect(screen.getByText(NOTHING_YET)).toBeVisible();
    expect(screen.getByText(STAYS_A_REQUEST)).toBeVisible();
    expect(screen.queryByRole("link", { name: "Pay now" })).toBeNull();
    expect(screen.queryByText(PAY_BY)).toBeNull();
    expect(screen.queryByText(HELD_FOR_DEPOSIT)).toBeNull();
    expect(screen.queryByText(NOT_RECEIVED)).toBeNull();
  });

  it("shows the amount, the pay button and the deadline once accepted", () => {
    renderManage({
      ...request,
      status: "pending_payment",
      hold_ends_at: "2027-01-05T13:00:00Z",
      hold_minutes: 600,
      payment: {
        status: "due",
        amount_minor: 5000,
        paid_minor: 0,
        refunded_minor: 0,
        balance_at_salon_minor: 17_500,
        currency: "XCD",
        checkout_url: "https://checkout.stripe.com/c/pay/cs_test_2",
      },
    });
    expect(
      screen.getByText("Accepted, waiting for your payment")
    ).toBeVisible();
    expect(screen.getByText(ACCEPTED_LINE)).toBeVisible();
    expect(screen.getByRole("link", { name: "Pay now" })).toHaveAttribute(
      "href",
      "https://checkout.stripe.com/c/pay/cs_test_2"
    );
    expect(screen.getByText(PAY_BY)).toBeVisible();
    expect(screen.queryByText(NOTHING_YET)).toBeNull();
    // It is no longer a request the business still has to answer.
    expect(screen.queryByText(STAYS_A_REQUEST)).toBeNull();
  });

  it("cannot change the time until it is paid, but can still cancel", () => {
    renderManage({
      ...request,
      status: "pending_payment",
      hold_ends_at: "2027-01-05T13:00:00Z",
    });
    expect(screen.queryByRole("button", { name: "Change time" })).toBeNull();
    expect(
      screen.getByText("Pay first, then you can change the time.")
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel booking" })
    ).toBeVisible();
  });

  it("offers Change time while the request waits and once it is confirmed", () => {
    const { unmount } = renderManage(request);
    expect(screen.getByRole("button", { name: "Change time" })).toBeVisible();
    unmount();
    renderManage({ ...request, status: "confirmed" });
    expect(screen.getByRole("button", { name: "Change time" })).toBeVisible();
  });

  it("stops saying it stays a request once the business confirmed it", () => {
    renderManage({ ...request, status: "confirmed" });
    expect(screen.queryByText(STAYS_A_REQUEST)).toBeNull();
  });

  it("leaves a payment at booking as it was", () => {
    renderManage({
      ...booking,
      status: "pending_payment",
      deposit_minor: 5000,
      hold_ends_at: "2027-01-05T13:00:00Z",
    });
    expect(screen.getByText("Waiting for payment")).toBeVisible();
    expect(screen.getByText(HELD_FOR_DEPOSIT)).toBeVisible();
    expect(screen.queryByText(PAY_BY)).toBeNull();
  });
});
