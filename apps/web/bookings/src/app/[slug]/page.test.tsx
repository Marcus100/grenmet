import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefront } from "@/lib/booking-api";
import BusinessBookingPage, { generateMetadata } from "./page";

vi.mock("@/env", () => ({
  env: {
    AUTH_APP_URL: "https://auth.example.test",
    NEXT_PUBLIC_SITE_URL: "https://bookings.example.test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  },
}));
vi.mock("@/lib/signed-in-visitor", () => ({ loadVisitor: vi.fn(() => null) }));
vi.mock("@/lib/booking-api", () => ({ getStorefront: vi.fn() }));
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

const SERVICE_ID = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f6c10";
const QUESTIONS = /Questions\? Contact us/u;
const INSTAGRAM = /Instagram @seasaltspa/u;
const DEPOSIT = /deposit/iu;

const storefront: BookingStorefront = {
  slug: "sea-salt-spa",
  display_name: "Sea Salt Spa",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  contact: { phone: null, whatsapp: null, instagram: null, email: null },
  providers: [
    {
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      name: "Maya",
      service_ids: [],
    },
  ],
  brand_color: null,
  logo_url: null,
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
    expect(screen.queryByRole("region", { name: "Services" })).toBeNull();
    expect(screen.getByText("Deep tissue massage")).toBeVisible();
    expect(screen.getByText("EC$150")).toBeVisible();
    expect(screen.getByText("Maya")).toBeVisible();
    expect(
      screen.getByRole("form", { name: "Book an appointment" })
    ).toBeVisible();
  });

  it("lists each service once, in the booking form", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    render(await BusinessBookingPage(params("sea-salt-spa")));
    const form = screen.getByRole("form", { name: "Book an appointment" });
    expect(within(form).getByText("Deep tissue massage")).toBeVisible();
    expect(screen.getAllByText("Deep tissue massage")).toHaveLength(1);
  });

  it("has a Book now link that jumps to the booking form", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    const { container } = render(
      await BusinessBookingPage(params("sea-salt-spa"))
    );
    const link = screen.getByRole("link", { name: "Book now" });
    expect(link).toHaveAttribute("href", "#book-online");
    expect(container.querySelectorAll("#book-online")).toHaveLength(1);
    expect(container.querySelector("#book-online")).toContainElement(
      screen.getByRole("form", { name: "Book an appointment" })
    );
  });

  it("shows no Book now link when no service is open", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      services: [],
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.queryByRole("link", { name: "Book now" })).toBeNull();
  });

  it("shows no contact strip when the business set no contact", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.queryByText(QUESTIONS)).not.toBeInTheDocument();
  });

  it("shows the business's contacts near the top", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      contact: {
        phone: "+14734401234",
        whatsapp: null,
        instagram: "seasaltspa",
        email: null,
      },
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    const strip = screen.getByRole("complementary", { name: QUESTIONS });
    expect(
      within(strip).getByRole("link", { name: "Call +14734401234" })
    ).toHaveAttribute("href", "tel:+14734401234");
    expect(
      within(strip).getByRole("link", { name: INSTAGRAM })
    ).toHaveAttribute("href", "https://instagram.com/seasaltspa");
    expect(within(strip).getAllByRole("link")).toHaveLength(2);
  });

  it("omits the deposit label when there is no deposit", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      services: [{ ...storefront.services[0], deposit_minor: 0 }],
    } as BookingStorefront);
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.getByText("1 hr 30 min")).toBeVisible();
    expect(screen.queryByText(DEPOSIT)).toBeNull();
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

describe("brand on the booking page", () => {
  const LOGO = "https://storage.example.test/booking-logo/sea-salt.png";
  const wrapperOf = (container: HTMLElement) => {
    const wrapper = container.querySelector<HTMLElement>(".booking");
    if (!wrapper) {
      throw new Error("expected the booking wrapper");
    }
    return wrapper;
  };

  it("shows the logo above the heading with the business name as its alt text", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      logo_url: LOGO,
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    const logo = screen.getByRole("img", { name: "Sea Salt Spa" });
    expect(logo).toHaveAttribute("src", LOGO);
    expect(logo).not.toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sea Salt Spa"
    );
  });

  it("shows no logo when logo_url is null, missing or not https", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefront);
    const { unmount } = render(
      await BusinessBookingPage(params("sea-salt-spa"))
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    unmount();

    // An older cached payload: the two brand fields are absent, not null.
    const { brand_color: _brand, logo_url: _logo, ...older } = storefront;
    vi.mocked(getStorefront).mockResolvedValue(older as BookingStorefront);
    const second = render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(wrapperOf(second.container)).not.toHaveAttribute("style");
    second.unmount();

    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      logo_url: "http://storage.example.test/logo.png",
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("sets the accent on the wrapper when the colour passes 4.5:1", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      brand_color: "#0B63EE",
    });
    const { container } = render(
      await BusinessBookingPage(params("sea-salt-spa"))
    );
    const wrapper = wrapperOf(container);
    expect(wrapper.style.getPropertyValue("--booking-accent")).toBe("#0b63ee");
    expect(wrapper.style.getPropertyValue("--booking-accent-text")).toBe(
      "#ffffff"
    );
    expect(wrapper.style.getPropertyValue("--booking-link")).toBe("#0b63ee");
  });

  it.each([
    ["a pale colour", "#777777"],
    ["a yellow", "#ffff00"],
    ["a non-hex word", "red"],
    ["a hostile value", "red;background:url(x)"],
  ])("keeps the shared tokens for %s", async (_label, brandColor) => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      brand_color: brandColor,
    });
    const { container } = render(
      await BusinessBookingPage(params("sea-salt-spa"))
    );
    const wrapper = wrapperOf(container);
    expect(wrapper).not.toHaveAttribute("style");
    expect(container.innerHTML).not.toContain("url(x)");
  });

  it("keeps the business name and the Booking by Barrels credit with a brand", async () => {
    vi.mocked(getStorefront).mockResolvedValue({
      ...storefront,
      brand_color: "#0b63ee",
      logo_url: LOGO,
    });
    render(await BusinessBookingPage(params("sea-salt-spa")));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sea Salt Spa"
    );
    expect(
      screen.getByRole("form", { name: "Book an appointment" })
    ).toBeVisible();
  });
});
