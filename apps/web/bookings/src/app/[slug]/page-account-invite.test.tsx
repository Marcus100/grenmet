import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import { loadVisitor } from "@/lib/signed-in-visitor";
import BusinessBookingPage from "./page";

vi.mock("@/env", () => ({
  env: {
    AUTH_APP_URL: "https://auth.example.test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
}));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
vi.mock("@/lib/signed-in-visitor", () => ({ loadVisitor: vi.fn() }));
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
// The flow itself is tested in @barrelsgd/bookings-web; here only what the
// page hands it matters.
vi.mock("@barrelsgd/bookings-web/components/booking-flow", () => ({
  BookingFlow: (props: {
    accountInvite?: { href: string };
    bookAgain?: unknown[];
    signedIn?: { email: string; name: string; phone: string };
  }) => (
    <div data-testid="flow">
      <p data-testid="invite">{props.accountInvite?.href ?? "no invite"}</p>
      <p data-testid="signed-in">
        {props.signedIn
          ? `${props.signedIn.name}|${props.signedIn.email}|${props.signedIn.phone}`
          : "guest"}
      </p>
      <p data-testid="again">{props.bookAgain?.length ?? 0}</p>
    </div>
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

const params = { params: Promise.resolve({ slug: "sea-salt-spa" }) };

beforeEach(() => {
  vi.mocked(getStorefront).mockReset().mockResolvedValue(storefront);
  vi.mocked(loadVisitor).mockReset();
});

describe("/[slug] guest", () => {
  it("gets a blank form and the sign-up address on the auth app", async () => {
    vi.mocked(loadVisitor).mockResolvedValue(null);
    render(await BusinessBookingPage(params));
    expect(loadVisitor).toHaveBeenCalledWith("sea-salt-spa");
    expect(screen.getByTestId("invite")).toHaveTextContent(
      "https://auth.example.test/signup"
    );
    expect(screen.getByTestId("signed-in")).toHaveTextContent("guest");
    expect(screen.getByTestId("again")).toHaveTextContent("0");
  });
});

describe("/[slug] signed in", () => {
  it("passes the person's own details and shortcuts, and no invitation", async () => {
    vi.mocked(loadVisitor).mockResolvedValue({
      bookAgain: [{ providerId: "p1", serviceId: "s1" }],
      signedIn: {
        email: "ada@example.com",
        name: "Ada Lovelace",
        phone: "+1 473 555 0100",
        signOutAction: "/auth/logout",
      },
    });
    render(await BusinessBookingPage(params));
    expect(screen.getByTestId("invite")).toHaveTextContent("no invite");
    expect(screen.getByTestId("signed-in")).toHaveTextContent(
      "Ada Lovelace|ada@example.com|+1 473 555 0100"
    );
    expect(screen.getByTestId("again")).toHaveTextContent("1");
  });

  it("does not look anyone up for an unknown business", async () => {
    vi.mocked(getStorefront).mockResolvedValue(null);
    await expect(BusinessBookingPage(params)).rejects.toHaveProperty(
      "message",
      "NEXT_NOT_FOUND"
    );
    expect(loadVisitor).not.toHaveBeenCalled();
  });
});
