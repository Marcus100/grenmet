import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import { loadVisitor } from "@/lib/signed-in-visitor";
import BusinessBookingPage from "./page";

vi.mock("@/env", () => ({
  env: {
    AUTH_APP_URL: "https://auth.example.test",
    NEXT_PUBLIC_SITE_URL: "https://bookings.example.test",
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
vi.mock("@barrelsgd/bookings-web/components/booking-flow", () => ({
  BookingFlow: () => <div data-testid="flow" />,
}));

const COVER = "https://cdn.example.test/cover.jpg";

function storefrontWith(
  overrides: Partial<BookingStorefront> = {}
): BookingStorefront {
  return {
    slug: "sea-salt-spa",
    display_name: "Sea Salt Spa",
    timezone: "America/Grenada",
    currency: "XCD",
    cancel_cutoff_hours: 24,
    contact: { phone: null, whatsapp: null, instagram: null, email: null },
    providers: [],
    brand_color: null,
    logo_url: null,
    cover_url: null,
    services: [],
    ...overrides,
  };
}

const params = {
  params: Promise.resolve({ slug: "sea-salt-spa" }),
  searchParams: Promise.resolve({}),
};

beforeEach(() => {
  vi.mocked(loadVisitor).mockReset().mockResolvedValue(null);
});

describe("/[slug] cover banner", () => {
  it("shows a decorative cover above the business name", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({ cover_url: COVER })
    );
    const { container } = render(await BusinessBookingPage(params));

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(COVER);
    expect(img?.getAttribute("alt")).toBe("");
    // First thing on the page: it must not wait to scroll into view.
    expect(img?.getAttribute("loading")).toBe("eager");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Sea Salt Spa",
    });
    expect(img?.compareDocumentPosition(heading) ?? 0).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("shows no banner when there is no cover", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefrontWith());
    const { container } = render(await BusinessBookingPage(params));

    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sea Salt Spa" })
    ).toBeTruthy();
  });

  it("shows no banner for an unsafe cover address", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({ cover_url: "http://cdn.example.test/cover.jpg" })
    );
    const { container } = render(await BusinessBookingPage(params));

    expect(container.querySelector("img")).toBeNull();
  });
});
