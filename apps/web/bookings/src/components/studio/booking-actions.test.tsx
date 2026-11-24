import type { BookingStatus } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_ID } from "@/test/studio";

const actions = vi.hoisted(() => ({
  cancelBookingAction: vi.fn(),
  completeBookingAction: vi.fn(),
  confirmBookingAction: vi.fn(),
  declineBookingAction: vi.fn(),
  noShowBookingAction: vi.fn(),
  rescheduleBookingAction: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/bookings/[id]/actions", () => actions);

import { BookingActions } from "./booking-actions";

function show(
  status: BookingStatus,
  extra: {
    started?: boolean;
    refundable?: boolean;
    nonRefundable?: boolean;
  } = {}
) {
  return render(
    <BookingActions
      bookingId={BOOKING_ID}
      nonRefundable={extra.nonRefundable ?? false}
      orgSlug="sea-salt"
      refundable={extra.refundable ?? false}
      started={extra.started ?? false}
      startsAt="2027-01-05T13:30:00Z"
      status={status}
      timezone="America/Grenada"
    />
  );
}

const NOTHING_MORE = /nothing more to do/u;
const UNTICK = /untick it to keep the deposit/u;
const REASON = /Reason/u;
const BY_HAND = /refund it by hand/u;
const POLICY_HINT = /more than the\s+cancellation cutoff away/u;

const buttons = () =>
  screen.queryAllByRole("button").map((button) => button.textContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("button visibility", () => {
  it("offers only cancel while a deposit is awaited", () => {
    show("pending_payment");
    expect(buttons()).toEqual(["Cancel booking"]);
  });

  it("offers confirm, decline and cancel for a request", () => {
    show("pending");
    expect(buttons()).toEqual([
      "Confirm booking",
      "Change time",
      "Decline",
      "Cancel booking",
    ]);
  });

  it("offers change time and cancel for a confirmed booking that has not started", () => {
    show("confirmed", { started: false });
    expect(buttons()).toEqual(["Change time", "Cancel booking"]);
  });

  it("adds complete and no-show once a confirmed booking has started", () => {
    show("confirmed", { started: true });
    expect(buttons()).toEqual([
      "Mark completed",
      "Mark no-show",
      "Cancel booking",
    ]);
  });

  it.each(["cancelled", "no_show", "completed"] as const)(
    "shows no buttons for %s and says why",
    (status) => {
      show(status, { started: true });
      expect(buttons()).toEqual([]);
      expect(screen.getByText(NOTHING_MORE)).toBeInTheDocument();
    }
  );
});

describe("dialogs", () => {
  it("runs confirm straight away and announces the result", async () => {
    actions.confirmBookingAction.mockResolvedValue({
      status: "success",
      message: "Booking confirmed.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByText("Booking confirmed.")).toHaveAttribute(
      "role",
      "status"
    );
    expect(actions.confirmBookingAction).toHaveBeenCalledWith(
      "sea-salt",
      BOOKING_ID
    );
  });

  it("asks before cancelling and requires a reason", async () => {
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancel this booking?");
    expect(screen.getByLabelText(REASON)).toBeRequired();
    expect(actions.cancelBookingAction).not.toHaveBeenCalled();
  });

  it("offers the deposit choice only when a deposit is held", async () => {
    const { unmount } = show("pending", { refundable: false });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    unmount();

    show("pending", { refundable: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByLabelText("Follow the business policy")).toBeChecked();
    expect(screen.getByText(POLICY_HINT)).toBeInTheDocument();
  });

  it.each([
    ["Follow the business policy", "policy"],
    ["Refund the deposit", "refund"],
    ["Keep the deposit", "keep"],
  ])("submits the %s choice", async (label, value) => {
    actions.cancelBookingAction.mockResolvedValue({
      status: "success",
      message: "Booking cancelled.",
    });
    show("pending", { refundable: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Ill" },
    });
    fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Cancel booking" })
        .at(-1) as HTMLElement
    );
    await waitFor(() => expect(actions.cancelBookingAction).toHaveBeenCalled());
    const formData = actions.cancelBookingAction.mock.calls[0]?.[3] as FormData;
    expect(formData.get("refundChoice")).toBe(value);
    expect(formData.get("reason")).toBe("Ill");
  });

  it("defaults the deposit choice to refund on a confirmed non-refundable booking", async () => {
    const { unmount } = show("confirmed", {
      nonRefundable: true,
      refundable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(
      (await screen.findByLabelText("Refund the deposit")) as HTMLInputElement
    ).toBeChecked();
    expect(
      screen.getByLabelText("Follow the business policy")
    ).not.toBeChecked();
    expect(screen.getByText(UNTICK)).toBeInTheDocument();
    unmount();
  });

  it("keeps the business policy as the default for a request not yet confirmed", async () => {
    const { unmount } = show("pending", {
      nonRefundable: true,
      refundable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(
      (await screen.findByLabelText(
        "Follow the business policy"
      )) as HTMLInputElement
    ).toBeChecked();
    unmount();
  });

  it("says a decline refunds any deposit in full, only when one is held", async () => {
    const { unmount } = show("pending", { refundable: true });
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Any deposit is refunded in full."
    );
    unmount();
    show("pending", { refundable: false });
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("alertdialog")).not.toHaveTextContent(
      "refunded in full"
    );
  });

  it("shows a failed refund as an alert and moves focus to it", async () => {
    actions.cancelBookingAction.mockResolvedValue({
      status: "success",
      warning: true,
      message:
        "Booking cancelled. The deposit refund failed; refund it by hand.",
    });
    show("pending", { refundable: true });
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Ill" },
    });
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Cancel booking" })
        .at(-1) as HTMLElement
    );
    const alert = await screen.findByText(BY_HAND);
    expect(alert).toHaveAttribute("role", "alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("moves focus to the result after a final action", async () => {
    actions.completeBookingAction.mockResolvedValue({
      status: "success",
      message: "Marked as completed.",
    });
    show("confirmed", { started: true });
    fireEvent.click(screen.getByRole("button", { name: "Mark completed" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Mark completed" })
        .at(-1) as HTMLElement
    );
    const notice = await screen.findByText("Marked as completed.");
    await waitFor(() => expect(notice).toHaveFocus());
  });

  it("does not show last time's refusal when the dialog is reopened", async () => {
    actions.declineBookingAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "This booking has already changed.",
      nextStep: "Check its status.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Full" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decline request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already changed"
    );
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits the reason, closes and announces on success", async () => {
    actions.cancelBookingAction.mockResolvedValue({
      status: "success",
      message: "Booking cancelled.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Ill" },
    });
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Cancel booking" })
        .at(-1) as HTMLElement
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(await screen.findByText("Booking cancelled.")).toHaveAttribute(
      "role",
      "status"
    );
    const formData = actions.cancelBookingAction.mock.calls[0]?.[3] as FormData;
    expect(formData.get("reason")).toBe("Ill");
  });

  it("keeps the dialog open and shows a refusal as an alert", async () => {
    actions.declineBookingAction.mockResolvedValue({
      status: "error",
      kind: "forbidden",
      message: "You need admin access to change bookings.",
      nextStep: "Ask the business owner to make you an admin, then try again.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Full" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decline request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You need admin access to change bookings."
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps the typed reason after a refusal", async () => {
    actions.declineBookingAction.mockResolvedValue({
      status: "error",
      kind: "unavailable",
      message: "We could not save that change.",
      nextStep: "Try again in a moment.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    fireEvent.change(await screen.findByLabelText(REASON), {
      target: { value: "Fully booked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Decline request" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(REASON)).toHaveValue("Fully booked");
  });

  it("confirms a no-show before running it", async () => {
    actions.noShowBookingAction.mockResolvedValue({
      status: "success",
      message: "Marked as a no-show.",
    });
    show("confirmed", { started: true });
    fireEvent.click(screen.getByRole("button", { name: "Mark no-show" }));
    await screen.findByRole("alertdialog");
    expect(actions.noShowBookingAction).not.toHaveBeenCalled();
    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Mark no-show" })
        .at(-1) as HTMLElement
    );
    await waitFor(() =>
      expect(actions.noShowBookingAction).toHaveBeenCalledWith(
        "sea-salt",
        BOOKING_ID
      )
    );
  });
});

describe("change time", () => {
  it("opens with the booking's current day and time on the business's clock", async () => {
    show("confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Change time" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("The customer is emailed the new time");
    // 13:30 UTC on 5 January is 09:30 in Grenada (UTC-4).
    expect(screen.getByLabelText("New date")).toHaveValue("2027-01-05");
    expect(screen.getByLabelText("New start time")).toHaveValue("09:30");
    expect(screen.getByLabelText("New start time")).toBeRequired();
    expect(dialog).toHaveTextContent("America/Grenada");
    expect(actions.rescheduleBookingAction).not.toHaveBeenCalled();
  });

  it("sends the chosen date and time and announces the result", async () => {
    actions.rescheduleBookingAction.mockResolvedValue({
      status: "success",
      message: "Booking moved. The customer has been emailed.",
    });
    show("pending");
    fireEvent.click(screen.getByRole("button", { name: "Change time" }));
    fireEvent.change(await screen.findByLabelText("New date"), {
      target: { value: "2027-01-06" },
    });
    fireEvent.change(screen.getByLabelText("New start time"), {
      target: { value: "10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move booking" }));
    await waitFor(() =>
      expect(actions.rescheduleBookingAction).toHaveBeenCalled()
    );
    const formData = actions.rescheduleBookingAction.mock
      .calls[0]?.[3] as FormData;
    expect(formData.get("date")).toBe("2027-01-06");
    expect(formData.get("time")).toBe("10:00");
    expect(
      await screen.findByText("Booking moved. The customer has been emailed.")
    ).toHaveAttribute("role", "status");
  });

  it("shows a refusal inside the dialog and keeps what was typed", async () => {
    actions.rescheduleBookingAction.mockResolvedValue({
      status: "error",
      kind: "conflict",
      message: "That time is not free, or the booking has changed.",
      nextStep: "Choose another time.",
    });
    show("confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Change time" }));
    fireEvent.change(await screen.findByLabelText("New start time"), {
      target: { value: "11:15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move booking" }));
    const refusal = await screen.findByText(
      "That time is not free, or the booking has changed."
    );
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByLabelText("New start time")).toHaveValue("11:15");
  });
});
