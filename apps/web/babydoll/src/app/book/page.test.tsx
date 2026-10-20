import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKING_URL } from "@/data/site";
import { getStorefront } from "@/lib/booking-api";
import BookPage from "./page";

const mocks = vi.hoisted(() => ({
  env: {
    BABYDOLL_ONLINE_BOOKING: "off" as "on" | "off",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
vi.mock("@/app/book/actions", () => ({
  loadSlots: vi.fn(),
  submitBooking: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const storefront = {
  slug: "babydoll-beauty-bar",
  display_name: "Babydoll Beauty Bar",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  providers: [],
  services: [],
};

// The error crosses jsdom's realm, so compare its message, not its class.
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => null,
    (error: unknown) => error
  );
}

beforeEach(() => {
  vi.mocked(getStorefront).mockReset();
});

describe("/book", () => {
  it("redirects to the Acuity link while the switch is off, without calling the API", async () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
    expect(await rejection(BookPage())).toHaveProperty(
      "message",
      `NEXT_REDIRECT ${BOOKING_URL}`
    );
    expect(getStorefront).not.toHaveBeenCalled();
  });

  it("redirects to the Acuity link when the studio's page is disabled", async () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "on";
    vi.mocked(getStorefront).mockResolvedValue(null);
    expect(await rejection(BookPage())).toHaveProperty(
      "message",
      `NEXT_REDIRECT ${BOOKING_URL}`
    );
  });

  it("renders the booking flow when the switch is on", async () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "on";
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    render(await BookPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Book your appointment"
    );
    expect(
      screen.getByRole("form", { name: "Book an appointment" })
    ).toBeVisible();
  });
});
