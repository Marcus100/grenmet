import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import { loadVisitor } from "@/lib/signed-in-visitor";
import BusinessBookingPage from "./page";

vi.mock("@/env", () => ({
  env: {
    ACCOUNT_APP_URL: "https://account.example.test",
    AUTH_APP_URL: "https://auth.example.test",
    NEXT_PUBLIC_SITE_URL: "https://bookings.example.test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
}));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
vi.mock("@/lib/signed-in-visitor", () => ({
  loadVisitor: vi.fn(),
  SIGN_OUT_ACTION: "/auth/logout",
}));
vi.mock("./actions", () => ({
  confirmEmailCode: { bind: vi.fn(() => vi.fn()) },
  requestEmailCode: { bind: vi.fn(() => vi.fn()) },
  loadSlots: { bind: vi.fn(() => vi.fn()) },
  submitBooking: { bind: vi.fn(() => vi.fn()) },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@barrelsgd/bookings-web/components/booking-flow", () => ({
  BookingFlow: () => <div data-testid="flow" />,
}));

const storefront: BookingStorefront = {
  slug: "sea-salt-spa",
  display_name: "Sea Salt Spa",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  contact: { phone: null, whatsapp: null, instagram: null, email: null },
  providers: [],
  brand_color: null,
  logo_url: null,
  services: [],
};

const ACCOUNT_MENU = /Account menu/u;

const params = {
  params: Promise.resolve({ slug: "sea-salt-spa" }),
  searchParams: Promise.resolve({}),
};

beforeEach(() => {
  vi.mocked(getStorefront).mockReset().mockResolvedValue(storefront);
  vi.mocked(loadVisitor).mockReset();
});

describe("/[slug] header account menu", () => {
  it("shows the account menu to a signed-in visitor and no sign-in link", async () => {
    vi.mocked(loadVisitor).mockResolvedValue({
      bookAgain: [],
      signedIn: {
        email: "ada@example.test",
        name: "Ada Lovelace",
        phone: "",
        signOutAction: "/auth/logout",
      },
    });
    render(await BusinessBookingPage(params));
    expect(
      screen.getByRole("button", { name: "Account menu for Ada Lovelace" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("shows the sign-in link and no account menu to a guest", async () => {
    vi.mocked(loadVisitor).mockResolvedValue(null);
    render(await BusinessBookingPage(params));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin?returnTo=%2Fsea-salt-spa"
    );
    expect(screen.queryByRole("button", { name: ACCOUNT_MENU })).toBeNull();
  });
});
