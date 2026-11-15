import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import { getSession } from "@/lib/session";
import BusinessBookingPage from "./page";

const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/env", () => ({
  env: {
    AUTH_APP_URL: "https://auth.example.test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
}));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("./actions", () => ({
  confirmEmailCode: { bind: vi.fn(() => vi.fn()) },
  requestEmailCode: { bind: vi.fn(() => vi.fn()) },
  loadSlots: { bind: vi.fn(() => vi.fn()) },
  submitBooking: { bind: vi.fn(() => vi.fn()) },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve(
      new Headers({
        host: "bookings.example.test",
        "x-forwarded-proto": "https",
      })
    )
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// The flow itself is tested in @barrelsgd/bookings-web; here only what the
// page hands it matters.
vi.mock("@barrelsgd/bookings-web/components/booking-flow", () => ({
  BookingFlow: ({ accountInvite }: { accountInvite?: { href: string } }) => (
    <p data-testid="flow">{accountInvite ? accountInvite.href : "no invite"}</p>
  ),
}));

const storefront: BookingStorefront = {
  slug: "sea-salt-spa",
  display_name: "Sea Salt Spa",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  providers: [],
  services: [
    {
      id: "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10",
      name: "Deep tissue massage",
      category: null,
      description: null,
      duration_min: 90,
      price_minor: 15_000,
      deposit_minor: 0,
    },
  ],
};

const NOT_NEEDED = /You do not need one to book/u;
const params = { params: Promise.resolve({ slug: "sea-salt-spa" }) };

beforeEach(() => {
  vi.mocked(getStorefront).mockReset().mockResolvedValue(storefront);
  vi.mocked(getSession).mockReset();
  reportError.mockReset();
});

describe("/[slug] account invitation", () => {
  it("sends a guest to sign up on auth and back, signed in, to this booking page", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    render(await BusinessBookingPage(params));
    const invite = new URL(screen.getByTestId("flow").textContent ?? "");
    expect(`${invite.origin}${invite.pathname}`).toBe(
      "https://auth.example.test/signup"
    );
    expect(invite.searchParams.get("returnTo")).toBe(
      "https://bookings.example.test/signin?returnTo=%2Fsea-salt-spa"
    );
  });

  it("shows a guest a quiet sign-in link that returns to the same page", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    render(await BusinessBookingPage(params));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/signin?returnTo=%2Fsea-salt-spa"
    );
    expect(screen.getByText(NOT_NEEDED, { exact: false })).toBeVisible();
  });

  it("offers nothing to a signed-in person", async () => {
    vi.mocked(getSession).mockResolvedValue({
      accessToken: "token",
      email: "ada@example.com",
      name: "Ada",
    });
    render(await BusinessBookingPage(params));
    expect(screen.getByTestId("flow")).toHaveTextContent("no invite");
    expect(
      screen.queryByRole("link", { name: "Sign in" })
    ).not.toBeInTheDocument();
  });

  it("treats a sign-in fault as a guest, reports it and still shows the page", async () => {
    vi.mocked(getSession).mockRejectedValue(new Error("auth down"));
    render(await BusinessBookingPage(params));
    expect(screen.getByTestId("flow")).toHaveTextContent(
      "https://auth.example.test/signup"
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toBeVisible();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      "bookings-public-session"
    );
  });
});
