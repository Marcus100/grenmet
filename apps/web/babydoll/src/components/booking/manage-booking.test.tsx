import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelMyBooking,
  loadRescheduleSlots,
  rescheduleMyBooking,
} from "@/app/booking/[token]/actions";
import { ManageBooking } from "./manage-booking";

vi.mock("@/app/booking/[token]/actions", () => ({
  cancelMyBooking: vi.fn(),
  loadRescheduleSlots: vi.fn(),
  rescheduleMyBooking: vi.fn(),
}));

const ORIGINAL_TIME = /5 January 2027, 9:30 am/;
const CHANGES_CLOSE = /Changes close 24 hours before/;
const MOVED_TIME = /6 January 2027, 9:30 am/;
const HYBRID = /Hybrid/;
const TOKEN = "secret-token-value-123";
const CUTOFF =
  "Bookings can be cancelled online up to 24 hours before they start. Please contact Babydoll Beauty Bar.";

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadRescheduleSlots).mockResolvedValue({
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
    render(<ManageBooking booking={booking} token={TOKEN} />);
    expect(screen.getByRole("heading", { name: HYBRID })).toBeVisible();
    expect(screen.getByText(ORIGINAL_TIME)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Add to calendar" })
    ).toHaveAttribute("href", `/booking/${TOKEN}/ics`);
  });

  it("cancels after a confirmation step", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelMyBooking).mockResolvedValue({
      ok: true,
      data: { ...booking, status: "cancelled" },
    });
    render(<ManageBooking booking={booking} token={TOKEN} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(cancelMyBooking).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    expect(cancelMyBooking).toHaveBeenCalledWith(TOKEN);
    expect(await screen.findByText("Your booking is cancelled.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
  });

  it("explains the cutoff and removes the buttons when cancelling is refused", async () => {
    const user = userEvent.setup();
    vi.mocked(cancelMyBooking).mockResolvedValue({
      ok: false,
      code: "cutoff",
      message: CUTOFF,
    });
    render(<ManageBooking booking={booking} token={TOKEN} />);
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(CUTOFF);
    expect(screen.getByText(CHANGES_CLOSE)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Cancel booking" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "message us on Instagram" })
    ).toBeVisible();
  });

  it("offers no changes inside the cutoff to begin with", () => {
    render(
      <ManageBooking
        booking={{ ...booking, can_cancel: false }}
        token={TOKEN}
      />
    );
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
    expect(screen.getByText(CHANGES_CLOSE)).toBeVisible();
  });

  it("moves the booking to a chosen slot", async () => {
    const user = userEvent.setup();
    vi.mocked(rescheduleMyBooking).mockResolvedValue({
      ok: true,
      data: { ...booking, starts_at: "2027-01-06T13:30:00Z" },
    });
    render(<ManageBooking booking={booking} token={TOKEN} />);
    await user.click(screen.getByRole("button", { name: "Change time" }));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    await user.click(screen.getByRole("button", { name: "Move my booking" }));

    expect(rescheduleMyBooking).toHaveBeenCalledWith(
      TOKEN,
      "2027-01-06T13:30:00Z"
    );
    expect(await screen.findByText("Your booking has moved.")).toBeVisible();
    expect(screen.getByText(MOVED_TIME)).toBeVisible();
  });

  it("says the slot was taken, clears the pick and reloads the times", async () => {
    const user = userEvent.setup();
    vi.mocked(rescheduleMyBooking).mockResolvedValue({
      ok: false,
      code: "slot_taken",
      message: "That time has just been taken. Please choose another.",
    });
    render(<ManageBooking booking={booking} token={TOKEN} />);
    await user.click(screen.getByRole("button", { name: "Change time" }));
    await user.click(await screen.findByRole("radio", { name: "9:30 am" }));
    const before = vi.mocked(loadRescheduleSlots).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Move my booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "just been taken"
    );
    await waitFor(() =>
      expect(vi.mocked(loadRescheduleSlots).mock.calls.length).toBeGreaterThan(
        before
      )
    );
    expect(
      screen.getByRole("button", { name: "Move my booking" })
    ).toBeDisabled();
  });

  it("keeps a cancelled booking read-only", () => {
    render(
      <ManageBooking
        booking={{ ...booking, status: "cancelled" }}
        token={TOKEN}
      />
    );
    expect(screen.getByText("Cancelled")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Add to calendar" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change time" })
    ).not.toBeInTheDocument();
  });
});
