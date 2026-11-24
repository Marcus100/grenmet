import type { BookingStorefront } from "@barrelsgd/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingFlowActions } from "../lib/booking-types";
import { BookingFlow } from "./booking-flow";

const loadSlots = vi.fn<BookingFlowActions["loadSlots"]>();
const submitBooking = vi.fn<BookingFlowActions["submitBooking"]>();
const actions: BookingFlowActions = {
  confirmEmailCode: vi.fn(),
  loadSlots,
  requestEmailCode: vi.fn(),
  submitBooking,
};
const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};

const LASH_1 = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001";
const LASH_2 = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0002";
const BROW = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0003";
const FACIAL = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0004";
const TUE = "2027-01-05T13:30:00Z";

const LASHES = /Lashes/u;
const BROWS = /Brows/u;
const FACIALS = /Facials/u;
const CHOSEN_FACIAL = /Chosen: Hydrating facial/u;
const TWO_SERVICES = /2 services/u;
const ONE_SERVICE = /1 service(?!s)/u;
const SLOT = "9:30 am";
const HYDRATING = /Hydrating facial/u;
const BROW_SHAPING = /Brow shaping/u;
const CLASSIC = /Classic lashes/u;
const REQUEST_IN = /Your request is in/u;
const SERVICES_HEADING = /^Services$/u;
const SUBMIT = "Request my booking";

function service(
  id: string,
  name: string,
  category: string | null,
  sort: number
) {
  return {
    id,
    name,
    category,
    description: null,
    duration_min: 30 + sort,
    price_minor: 5000,
    deposit_minor: 0,
  };
}

const categorised: BookingStorefront = {
  slug: "babydoll-test",
  display_name: "Babydoll Test",
  timezone: "America/Grenada",
  currency: "XCD",
  cancel_cutoff_hours: 24,
  contact: NO_CONTACT,
  providers: [],
  brand_color: null,
  logo_url: null,
  services: [
    service(LASH_1, "Classic lashes", "Lashes", 1),
    service(LASH_2, "Lash lift", "Lashes", 2),
    service(BROW, "Brow shaping", "Brows", 3),
    service(FACIAL, "Hydrating facial", "Facials", 4),
  ],
};

const flatCategory: BookingStorefront = {
  ...categorised,
  services: [service(LASH_1, "Classic lashes", "Lashes", 1)],
};

const noCategory: BookingStorefront = {
  ...categorised,
  services: [service(LASH_1, "Classic lashes", null, 1)],
};

const slots = {
  ok: true as const,
  data: {
    timezone: "America/Grenada",
    slots: [{ starts_at: TUE, ends_at: "2027-01-05T15:00:00Z" }],
  },
};

const booking = {
  id: "b1",
  status: "pending" as const,
  service_id: BROW,
  service_name: "Brow shaping",
  provider_id: "p1",
  provider_name: "Jeriann",
  starts_at: TUE,
  ends_at: "2027-01-05T15:00:00Z",
  timezone: "America/Grenada",
  customer_name: "Ada Lovelace",
  price_minor: 5000,
  deposit_minor: 0,
  currency: "XCD",
  cancel_cutoff_hours: 24,
  can_cancel: true,
  contact: NO_CONTACT,
};

function renderWith(
  shown: BookingStorefront,
  props: Partial<ComponentProps<typeof BookingFlow>> = {}
) {
  return render(
    <BookingFlow
      actions={actions}
      managePath="/booking"
      storefront={shown}
      studioName="Test Studio"
      turnstileSiteKey=""
      {...props}
    />
  );
}

/** The category disclosures, in page order. */
function categories(container: HTMLElement): HTMLDetailsElement[] {
  return Array.from(container.querySelectorAll("details.service-category"));
}

function summaryOf(details: HTMLDetailsElement): HTMLElement {
  const summary = details.querySelector("summary");
  if (!summary) {
    throw new Error("a category has no summary");
  }
  return summary;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSlots).mockResolvedValue(slots);
});

describe("service categories as disclosures", () => {
  it("lists categories in their configured order, each with its count", () => {
    const { container } = renderWith(categorised);
    const groups = categories(container);
    expect(groups).toHaveLength(3);
    expect(
      within(summaryOf(groups[0] as HTMLDetailsElement)).getByRole("heading", {
        name: LASHES,
      })
    ).toBeInTheDocument();
    expect(summaryOf(groups[0] as HTMLDetailsElement)).toHaveTextContent(
      TWO_SERVICES
    );
    expect(summaryOf(groups[1] as HTMLDetailsElement)).toHaveTextContent(BROWS);
    expect(summaryOf(groups[1] as HTMLDetailsElement)).toHaveTextContent(
      ONE_SERVICE
    );
    expect(summaryOf(groups[2] as HTMLDetailsElement)).toHaveTextContent(
      FACIALS
    );
  });

  it("opens only the first category by default, and every summary is a button-sized row", () => {
    const { container } = renderWith(categorised);
    const [lashes, brows, facials] = categories(container);
    expect(lashes?.open).toBe(true);
    expect(brows?.open).toBe(false);
    expect(facials?.open).toBe(false);
    expect(summaryOf(lashes as HTMLDetailsElement)).toBeVisible();
  });

  it("toggles a category with a click and keeps the other categories as they are", async () => {
    const user = userEvent.setup();
    const { container } = renderWith(categorised);
    const [lashes, brows] = categories(container) as [
      HTMLDetailsElement,
      HTMLDetailsElement,
    ];
    await user.click(summaryOf(brows));
    expect(brows.open).toBe(true);
    expect(lashes.open).toBe(true);
    await user.click(summaryOf(lashes));
    expect(lashes.open).toBe(false);
    expect(brows.open).toBe(true);
  });

  it("uses a native summary, so it takes focus and Enter or Space open it in the browser", () => {
    const { container } = renderWith(categorised);
    const facials = categories(container)[2] as HTMLDetailsElement;
    const summary = summaryOf(facials);
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.parentElement).toBe(facials);
    summary.focus();
    expect(summary).toHaveFocus();
    expect(facials.open).toBe(false);
  });

  it("opens the category holding a Book again service instead of the first", () => {
    const { container } = renderWith(categorised, {
      bookAgain: [{ providerId: "", serviceId: FACIAL }],
      signedIn: {
        email: "ada@example.com",
        name: "Ada Lovelace",
        phone: "",
        signOutAction: "/auth/logout",
      },
    });
    const [lashes, , facials] = categories(container);
    expect(facials?.open).toBe(true);
    expect(lashes?.open).toBe(false);
  });

  it("keeps the chosen service visible: named on its closed summary, and open again when chosen", async () => {
    const user = userEvent.setup();
    const { container } = renderWith(categorised, {
      bookAgain: [{ providerId: "", serviceId: FACIAL }],
      signedIn: {
        email: "ada@example.com",
        name: "Ada Lovelace",
        phone: "",
        signOutAction: "/auth/logout",
      },
    });
    const facials = categories(container)[2] as HTMLDetailsElement;
    await user.click(screen.getByRole("button", { name: HYDRATING }));
    expect(screen.getByRole("radio", { name: HYDRATING })).toBeChecked();
    // Close the category holding the chosen service: its radio is hidden but
    // the summary still names it.
    await user.click(summaryOf(facials));
    expect(facials.open).toBe(false);
    expect(summaryOf(facials)).toHaveTextContent(CHOSEN_FACIAL);
    expect(screen.getByRole("radio", { name: HYDRATING })).toBeChecked();
    // Pressing the same shortcut again changes nothing: the summary still names
    // the chosen service, and opening the category shows its radio, checked.
    await user.click(screen.getByRole("button", { name: HYDRATING }));
    expect(summaryOf(facials)).toHaveTextContent(CHOSEN_FACIAL);
    await user.click(summaryOf(facials));
    expect(facials.open).toBe(true);
    expect(screen.getByRole("radio", { name: HYDRATING })).toBeChecked();
  });

  it("books a service from a category the visitor opened, end to end", async () => {
    const user = userEvent.setup();
    vi.mocked(submitBooking).mockResolvedValue({
      ok: true,
      data: { booking, manageToken: "tok" },
    });
    const { container } = renderWith(categorised);
    const brows = categories(container)[1] as HTMLDetailsElement;
    await user.click(summaryOf(brows));
    await user.click(screen.getByRole("radio", { name: BROW_SHAPING }));
    await user.click(await screen.findByRole("radio", { name: SLOT }));
    await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(submitBooking).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitBooking).mock.calls[0]?.[0]).toMatchObject({
      serviceId: BROW,
      name: "Ada Lovelace",
    });
    expect(await screen.findByText(REQUEST_IN)).toBeVisible();
  });
});

describe("single category and no category keep the flat list", () => {
  it("renders one category as today's flat list, with no disclosure", () => {
    const { container } = renderWith(flatCategory);
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(container.querySelector(".service-group h3")).toHaveTextContent(
      LASHES
    );
    expect(screen.getByRole("radio", { name: CLASSIC })).toBeVisible();
  });

  it("renders services without a category as one flat list under Services", () => {
    const { container } = renderWith(noCategory);
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(container.querySelector(".service-group h3")).toHaveTextContent(
      SERVICES_HEADING
    );
    expect(screen.getByRole("radio", { name: CLASSIC })).toBeVisible();
  });
});
