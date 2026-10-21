import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import BusinessBookingPage, { generateMetadata } from "./page";

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" } }));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
vi.mock("./actions", () => ({
  loadSlots: { bind: vi.fn(() => vi.fn()) },
  submitBooking: { bind: vi.fn(() => vi.fn()) },
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const SERVICE_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";

const storefront: BookingStorefront = {
  slug: "sea-salt-spa",
  display_name: "Sea Salt Spa",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  providers: [
    {
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      name: "Maya",
      service_ids: [],
    },
  ],
  services: [
    {
      id: SERVICE_ID,
      name: "Deep tissue massage",
      category: null,
      description: null,
      duration_min: 90,
      price_minor: 15_000,
      deposit_minor: 2500,
    },
  ],
};

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  vi.mocked(getStorefront).mockReset();
});

describe("/[slug]", () => {
  it("shows the business name from the API and its services", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    render(await BusinessBookingPage(params("sea-salt-spa")));

    expect(getStorefront).toHaveBeenCalledWith("sea-salt-spa");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sea Salt Spa"
    );
    const list = screen.getByRole("region", { name: "Services" });
    expect(within(list).getByText("Deep tissue massage")).toBeVisible();
    expect(within(list).getByText("1 hr 30 min · $25 deposit")).toBeVisible();
    expect(within(list).getByText("$150")).toBeVisible();
    expect(screen.getByText("Maya")).toBeVisible();
    expect(
      screen.getByRole("form", { name: "Book an appointment" })
    ).toBeVisible();
  });

  it("omits the deposit label when there is no deposit", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      services: [{ ...storefront.services[0], deposit_minor: 0 }],
    } as BookingStorefront);
    render(await BusinessBookingPage(params("sea-salt-spa")));
    const list = screen.getByRole("region", { name: "Services" });
    expect(within(list).getByText("1 hr 30 min")).toBeVisible();
  });

  it("says online booking is not open when there are no services", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      services: [],
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(
      screen.getByText("Online booking is not open for this business yet.")
    ).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("is not found for an unknown slug", async () => {
    vi.mocked(getStorefront).mockResolvedValue(null);
    await expect(
      BusinessBookingPage(params("nobody-here"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
  });

  it("is not found for a malformed slug without calling the API", async () => {
    await expect(
      BusinessBookingPage(params("Bad Slug!"))
    ).rejects.toHaveProperty("message", "NEXT_NOT_FOUND");
    expect(getStorefront).not.toHaveBeenCalled();
  });
});

describe("metadata", () => {
  it("names the business", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    expect(await generateMetadata(params("sea-salt-spa"))).toMatchObject({
      title: "Book at Sea Salt Spa",
    });
  });

  it("keeps an unknown slug out of search", async () => {
    vi.mocked(getStorefront).mockResolvedValue(null);
    expect(await generateMetadata(params("nobody-here"))).toMatchObject({
      robots: { index: false },
    });
  });
});
