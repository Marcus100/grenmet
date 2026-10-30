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
const MOVED_TIME = /6 January 2027, 9:30 am/u;
const HYBRID = /Hybrid/u;
const TOKEN = "secret-token-value-123";
const CALENDAR_HREF = `/booking/${TOKEN}/ics`;
const CONTACT = { href: "https://instagram.test/dm", label: "Instagram" };
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
};

function renderManage(detail: BookingPublicDetail = booking) {
  return render(
    <ManageBooking
      actions={actions}
      booking={detail}
      calendarHref={CALENDAR_HREF}
      contact={CONTACT}
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
    expect(
      screen.getByRole("link", { name: "message us on Instagram" })
    ).toHaveAttribute("href", CONTACT.href);
  });

  it("offers no changes inside the cutoff to begin with", () => {
    renderManage({ ...booking, can_cancel: false });
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(CHANGES_CLOSE)).toBeVisible();
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
});
