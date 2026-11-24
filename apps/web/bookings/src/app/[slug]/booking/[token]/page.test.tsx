import type {
  BookingPublicDetail,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBooking, getStorefront } from "@/lib/booking-api";
import ManageBookingPage, { metadata } from "./page";

vi.mock("@/lib/booking-api", () => ({
  getBooking: vi.fn(),
  getStorefront: vi.fn(),
}));
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

const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};
const QUESTIONS = /Questions\? Contact us/u;
const WHATSAPP = /WhatsApp/u;
const CONTACT_COLON = /contact Sea Salt Spa:/u;
const EXPIRED =
  /This link may have expired\. Check the link in your email, or contact the business directly\./u;

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
  contact: { ...NO_CONTACT, email: "hello@seasalt.example" },
};

const storefront: BookingStorefront = {
  slug: "sea-salt-spa",
  display_name: "Sea Salt Spa",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  contact: { ...NO_CONTACT, whatsapp: "14734401234" },
  providers: [],
  brand_color: null,
  logo_url: null,
  services: [],
};

const params = (slug: string, token: string) => ({
  params: Promise.resolve({ slug, token }),
});

beforeEach(() => {
  vi.mocked(getBooking).mockReset();
  vi.mocked(getStorefront).mockReset();
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
    const strip = screen.getByRole("complementary", { name: QUESTIONS });
    expect(
      within(strip).getByRole("link", { name: "Email hello@seasalt.example" })
    ).toHaveAttribute("href", "mailto:hello@seasalt.example");
  });

  it("explains an unknown token and names the business", async () => {
    vi.mocked(getBooking).mockResolvedValue(null);
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    render(await ManageBookingPage(params("sea-salt-spa", "nope")));

    expect(getStorefront).toHaveBeenCalledWith("sea-salt-spa");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "We could not find this booking"
    );
    expect(
      screen.getByText("This link does not match a booking with Sea Salt Spa.")
    ).toBeVisible();
    expect(screen.getByText(EXPIRED)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Book with Sea Salt Spa" })
    ).toHaveAttribute("href", "/sea-salt-spa");
    expect(screen.queryByText("nope")).not.toBeInTheDocument();
    expect(screen.getByText(CONTACT_COLON)).toBeVisible();
    expect(screen.getByRole("link", { name: WHATSAPP })).toHaveAttribute(
      "href",
      "https://wa.me/14734401234"
    );
  });

  it("still helps when the business cannot be named", async () => {
    vi.mocked(getBooking).mockResolvedValue(null);
    vi.mocked(getStorefront).mockResolvedValue(null);
    render(await ManageBookingPage(params("gone-spa", "nope")));

    expect(
      screen.getByText("This link does not match a booking.")
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Make a new booking" })
    ).toHaveAttribute("href", "/gone-spa");
    expect(screen.getByText(EXPIRED)).toBeVisible();
  });

  it("is not found for a malformed slug without calling the API", async () => {
    await expect(
      ManageBookingPage(params("Bad Slug", "tok-123"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
    expect(getBooking).not.toHaveBeenCalled();
    expect(getStorefront).not.toHaveBeenCalled();
  });

  it("keeps the secret token out of search and referrers", () => {
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false },
      referrer: "no-referrer",
    });
  });

  it("invites a guest to create an account at the API's link", async () => {
    const inviteUrl =
      "https://auth.barrels.gd/signup?returnTo=https%3A%2F%2Fbookings.barrels.gd%2Fsignin%3FreturnTo%3D%2Fsea-salt-spa";
    vi.mocked(getBooking).mockResolvedValue({
      ...booking,
      account_invite_url: inviteUrl,
    });
    render(await ManageBookingPage(params("sea-salt-spa", "tok-123")));

    expect(
      screen.getByRole("heading", { name: "Keep your bookings in one place" })
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Create an account or sign in" })
    ).toHaveAttribute("href", inviteUrl);
  });

  it("shows no account invitation once the booking is linked to an account", async () => {
    vi.mocked(getBooking).mockResolvedValue({
      ...booking,
      account_invite_url: null,
    });
    render(await ManageBookingPage(params("sea-salt-spa", "tok-123")));

    expect(
      screen.queryByRole("heading", { name: "Keep your bookings in one place" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create an account or sign in" })
    ).not.toBeInTheDocument();
  });
});
