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

const FIRST = "https://cdn.example.test/one.jpg";
const SECOND = "https://cdn.example.test/two.jpg";
const ABOUT_HEADING = /^About/u;

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

describe("/[slug] about text", () => {
  it("shows what the business says, with its line breaks kept", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({ about: "We braid hair.\nSince 2004." })
    );
    const { container } = render(await BusinessBookingPage(params));

    expect(
      screen.getByRole("heading", { level: 2, name: "About Sea Salt Spa" })
    ).toBeTruthy();
    const text = container.querySelector(".deposit-instructions");
    expect(text?.textContent).toBe("We braid hair.\nSince 2004.");
  });

  it("escapes the business's own text instead of reading it as markup", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({ about: "<b>Bold</b> <script>bad()</script>" })
    );
    const { container } = render(await BusinessBookingPage(params));

    const text = container.querySelector(".deposit-instructions");
    expect(text?.textContent).toContain("<b>Bold</b>");
    // Nothing the business typed becomes markup (the page's own JSON-LD
    // script stays, so look only inside the about text).
    expect(text?.querySelector("b")).toBeNull();
    expect(text?.querySelector("script")).toBeNull();
    expect(text?.children.length).toBe(1);
  });

  it("shows no about section when the business has written nothing", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefrontWith({ about: "  " }));
    render(await BusinessBookingPage(params));

    expect(screen.queryByRole("heading", { name: ABOUT_HEADING })).toBeNull();
  });
});

describe("/[slug] gallery strip", () => {
  it("shows each photograph in the business's order, lazily and decorative", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({
        gallery: [
          { id: "11111111-1111-4111-8111-111111111111", url: FIRST },
          { id: "22222222-2222-4222-8222-222222222222", url: SECOND },
        ],
      })
    );
    const { container } = render(await BusinessBookingPage(params));

    expect(
      screen.getByRole("heading", { level: 2, name: "Our work" })
    ).toBeTruthy();
    const images = [...container.querySelectorAll("img")];
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      FIRST,
      SECOND,
    ]);
    for (const img of images) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("loading")).toBe("lazy");
    }
  });

  it("scrolls inside itself, with 12 px corners and a 16 px gutter", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({
        gallery: [{ id: "11111111-1111-4111-8111-111111111111", url: FIRST }],
      })
    );
    const { container } = render(await BusinessBookingPage(params));

    const strip = container.querySelector("ul.rail");
    expect(strip?.getAttribute("class")).toContain("overflow-x-auto");
    expect(strip?.getAttribute("class")).toContain("gap-4");
    // The page itself must not scroll sideways: the track may shrink.
    expect(strip?.getAttribute("class")).toContain("min-w-0");
    const frame = container.querySelector("ul.rail span");
    expect(frame?.getAttribute("class")).toContain("rounded-xl");
  });

  it("drops a photograph whose address is not https", async () => {
    vi.mocked(getStorefront).mockResolvedValue(
      storefrontWith({
        gallery: [
          { id: "11111111-1111-4111-8111-111111111111", url: FIRST },
          {
            id: "22222222-2222-4222-8222-222222222222",
            url: "http://cdn.example.test/two.jpg",
          },
        ],
      })
    );
    const { container } = render(await BusinessBookingPage(params));

    expect([...container.querySelectorAll("img")].length).toBe(1);
  });

  it("shows no gallery at all when the business has no photographs", async () => {
    vi.mocked(getStorefront).mockResolvedValue(storefrontWith({ gallery: [] }));
    render(await BusinessBookingPage(params));

    expect(screen.queryByRole("heading", { name: "Our work" })).toBeNull();
  });
});
