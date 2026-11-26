import type { BookingCalendarFeedStatus } from "@barrelsgd/api-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCalendarFeedAction,
  rotateCalendarFeedAction,
} from "@/app/studio/[orgSlug]/settings/actions";
import { CalendarFeedSection } from "./calendar-feed-section";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  createCalendarFeedAction: vi.fn(),
  rotateCalendarFeedAction: vi.fn(),
}));

const SHOWN_ONCE = /shown only once/u;
const REJECTED_TEXT = /rotate it instead/u;
const ADD_SUBSCRIBED = /Add Subscribed Calendar/u;
const FROM_URL = /From URL/u;
const ORG_SLUG = "babydoll";
const FIRST_URL =
  "https://api.barrels.gd/api/v1/bookings/public/calendar/FIRSTtoken_-abc123.ics";
const SECOND_URL =
  "https://api.barrels.gd/api/v1/bookings/public/calendar/SECONDtoken_-xyz789.ics";
const LINKED: BookingCalendarFeedStatus = {
  enabled: true,
  created_at: "2026-11-01T10:00:00Z",
  rotated_at: null,
};
const NOT_LINKED: BookingCalendarFeedStatus = { enabled: false };

describe("CalendarFeedSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("tells members that only an owner or admin can change the link", () => {
    render(
      <CalendarFeedSection editable={false} orgSlug={ORG_SLUG} status={null} />
    );
    expect(
      screen.getByText(
        "Only an owner or admin can make or reset the calendar link."
      )
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Make calendar link" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset link" })).toBeNull();
  });

  it("offers to make the link when none exists", () => {
    render(
      <CalendarFeedSection editable orgSlug={ORG_SLUG} status={NOT_LINKED} />
    );
    expect(
      screen.getByRole("button", { name: "Make calendar link" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset link" })).toBeNull();
  });

  it("says the address is not shown again once a link exists", () => {
    render(<CalendarFeedSection editable orgSlug={ORG_SLUG} status={LINKED} />);
    expect(screen.getByText(SHOWN_ONCE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset link" })).toBeTruthy();
    expect(screen.queryByDisplayValue(FIRST_URL)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Make calendar link" })
    ).toBeNull();
  });

  it("says so when the status could not be loaded", () => {
    render(<CalendarFeedSection editable orgSlug={ORG_SLUG} status={null} />);
    expect(screen.getByRole("status").textContent).toContain(
      "could not be loaded"
    );
  });

  it("shows the address once, with a webcal link and a copy button", async () => {
    vi.mocked(createCalendarFeedAction).mockResolvedValue({
      status: "success",
      message: "Calendar link made.",
      url: FIRST_URL,
    });
    render(
      <CalendarFeedSection editable orgSlug={ORG_SLUG} status={NOT_LINKED} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Make calendar link" }));

    const phoneLink = await screen.findByRole("link", {
      name: "Add to my phone calendar",
    });
    expect(phoneLink.getAttribute("href")).toBe(
      FIRST_URL.replace("https://", "webcal://")
    );
    const address = screen.getByLabelText(
      "Calendar address"
    ) as HTMLInputElement;
    expect(address.value).toBe(FIRST_URL);
    expect(address.readOnly).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy()
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(FIRST_URL);
  });

  it("shows the refusal when making the link fails", async () => {
    vi.mocked(createCalendarFeedAction).mockResolvedValue({
      status: "error",
      kind: "conflict",
      message:
        "A calendar feed already exists for this business; rotate it instead",
      nextStep: "Reset the link instead.",
    });
    render(
      <CalendarFeedSection editable orgSlug={ORG_SLUG} status={NOT_LINKED} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Make calendar link" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(REJECTED_TEXT)).toBeTruthy();
    expect(screen.queryByLabelText("Calendar address")).toBeNull();
  });

  it("resets the link after a confirmation and shows the new address once", async () => {
    vi.mocked(rotateCalendarFeedAction).mockResolvedValue({
      status: "success",
      message: "Calendar link reset.",
      url: SECOND_URL,
    });
    render(<CalendarFeedSection editable orgSlug={ORG_SLUG} status={LINKED} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset link" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Reset the calendar link?")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset link" }));

    const address = (await screen.findByLabelText(
      "Calendar address"
    )) as HTMLInputElement;
    await waitFor(() => expect(address.value).toBe(SECOND_URL));
    // The dialog closes in an effect after the new address renders. While it
    // is open, Base UI hides the rest of the page from assistive tech, so wait
    // for it to unmount before querying by role.
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      screen
        .getByRole("link", { name: "Add to my phone calendar" })
        .getAttribute("href")
    ).toBe(SECOND_URL.replace("https://", "webcal://"));
  });

  it("explains how to add the link on an iPhone and in Google Calendar", () => {
    render(<CalendarFeedSection editable orgSlug={ORG_SLUG} status={LINKED} />);
    expect(screen.getByText("iPhone")).toBeTruthy();
    expect(screen.getByText("Google Calendar")).toBeTruthy();
    expect(screen.getByText(ADD_SUBSCRIBED)).toBeTruthy();
    expect(screen.getByText(FROM_URL)).toBeTruthy();
  });
});
