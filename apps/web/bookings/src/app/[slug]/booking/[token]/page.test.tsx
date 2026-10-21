import type { BookingPublicDetail } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBooking } from "@/lib/booking-api";
import ManageBookingPage, { metadata } from "./page";

vi.mock("@/lib/booking-api", () => ({ getBooking: vi.fn() }));
vi.mock("./actions", () => ({
  cancelMyBooking: vi.fn(),
  rescheduleMyBooking: vi.fn(),
  loadRescheduleSlots: { bind: vi.fn(() => vi.fn()) },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const booking: BookingPublicDetail = {
  id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c11",
  status: "confirmed",
  service_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
  service_name: "Deep tissue massage",
  provider_id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c12",
  provider_name: "Maya",
  starts_at: "2027-01-05T13:30:00Z",
  ends_at: "2027-01-05T15:00:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 15_000,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
};

const params = (slug: string, token: string) => ({
  params: Promise.resolve({ slug, token }),
});

beforeEach(() => {
  vi.mocked(getBooking).mockReset();
});

describe("/[slug]/booking/[token]", () => {
  it("shows the booking with a calendar link under the business path", async () => {
    vi.mocked(getBooking).mockResolvedValue(booking);
    render(await ManageBookingPage(params("sea-salt-spa", "tok-123")));

    expect(getBooking).toHaveBeenCalledWith("tok-123");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your booking"
    );
    expect(screen.getByText("Deep tissue massage")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Add to calendar" })
    ).toHaveAttribute("href", "/sea-salt-spa/booking/tok-123/ics");
    expect(
      screen.getByRole("button", { name: "Cancel booking" })
    ).toBeVisible();
  });

  it("is not found for an unknown token", async () => {
    vi.mocked(getBooking).mockResolvedValue(null);
    await expect(
      ManageBookingPage(params("sea-salt-spa", "nope"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
  });

  it("is not found for a malformed slug without calling the API", async () => {
    await expect(
      ManageBookingPage(params("Bad Slug", "tok-123"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
    expect(getBooking).not.toHaveBeenCalled();
  });

  it("keeps the secret token out of search and referrers", () => {
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    });
  });
});
