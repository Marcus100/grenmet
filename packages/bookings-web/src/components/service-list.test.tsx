import type {
  BookingPublicAddOn,
  BookingPublicService,
  BookingStorefront,
} from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ServiceList } from "./service-list";

const RX_1 = /Soft set\./u;
const RX_2 = /No deposit for this service/u;
const RX_3 = /EC\$20/u;
const RX_4 = /business/iu;
const RX_5 = /Add-ons you can tick below/u;
const RX_6 = /Extra lash, EC\$10/u;
const RX_7 = /Classic lashes/u;
const LEAD_TIME =
  /Please book at least 3 days before your first lash appointment/u;

const LASHES = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0001";
const BROWS = "5d6c0a52-7c12-4c53-9e0f-9d8f2b2f0002";
const LONG =
  "Full set of lashes applied one by one for a natural look that lasts for weeks, with a patch test beforehand and aftercare advice given at the end of every visit, so nothing is a surprise.";

const NO_CONTACT = {
  phone: null,
  whatsapp: null,
  instagram: null,
  email: null,
};

function service(
  overrides: Partial<BookingPublicService> & Pick<BookingPublicService, "id">
): BookingPublicService {
  return {
    name: "Service",
    category: null,
    description: null,
    duration_min: 60,
    price_minor: 7000,
    deposit_minor: 0,
    ...overrides,
  };
}

function shop(
  services: BookingPublicService[],
  extra: Partial<BookingStorefront> = {}
): BookingStorefront {
  return {
    slug: "studio",
    display_name: "Studio",
    timezone: "America/Grenada",
    currency: "XCD",
    cancel_cutoff_hours: 24,
    contact: NO_CONTACT,
    providers: [],
    brand_color: null,
    logo_url: null,
    services,
    ...extra,
  };
}

function list(
  storefront: BookingStorefront,
  selectedId: string | null,
  onPick = vi.fn()
) {
  return render(
    <ServiceList
      bookAgainIds={[]}
      onPick={onPick}
      selectedId={selectedId}
      services={storefront.services}
      storefront={storefront}
    />
  );
}

describe("service details on selection", () => {
  it("shows the description, duration, price and payment line for the chosen service", () => {
    const storefront = shop([
      service({
        id: LASHES,
        name: "Classic lashes",
        description: "Soft set.\nLasts 3 weeks.",
      }),
    ]);
    list(storefront, LASHES);
    expect(screen.getByText(RX_1)).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    // The row above the panel shows the same figures, so the panel's are checked inside it.
    const panel = document.querySelector<HTMLElement>(".service-details");
    expect(panel).toHaveTextContent("1 hr");
    expect(panel).toHaveTextContent("EC$70");
    expect(screen.getByText(RX_2)).toBeInTheDocument();
  });

  it("still shows duration, price and the payment line with no description", () => {
    const storefront = shop([
      service({
        id: BROWS,
        name: "Brow shaping",
        duration_min: 30,
        price_minor: 3000,
      }),
    ]);
    list(storefront, BROWS);
    const panel = document.querySelector<HTMLElement>(".service-details");
    expect(panel).toHaveTextContent("30 min");
    expect(panel).toHaveTextContent("EC$30");
    expect(screen.getByText(RX_2)).toBeInTheDocument();
    expect(document.querySelector(".service-description")).toBeNull();
  });

  it("shows a deposit paid directly to the business in the payment line", () => {
    const storefront = shop(
      [
        service({
          id: LASHES,
          name: "Classic lashes",
          deposit_to_business_minor: 2000,
        }),
      ],
      { deposit_collection: "business" }
    );
    list(storefront, LASHES);
    const payment = document.querySelector<HTMLElement>(".service-payment");
    expect(payment).toHaveTextContent(RX_3);
    expect(payment).toHaveTextContent(RX_4);
  });

  it("shows the new-clients note and the lead time", () => {
    const storefront = shop([
      service({
        id: LASHES,
        name: "Classic lashes",
        new_clients_only: true,
        first_visit_lead_days: 3,
        first_visit_categories: ["lash"],
      }),
    ]);
    list(storefront, LASHES);
    expect(screen.getByText(LEAD_TIME)).toBeInTheDocument();
  });

  it("lists add-ons offered with the service, read only, with their prices", () => {
    const addOn: BookingPublicAddOn = {
      id: "7a6c0a52-7c12-4c53-9e0f-9d8f2b2f0001",
      name: "Extra lash",
      description: null,
      duration_min: 15,
      price_minor: 1000,
      service_ids: [LASHES],
    };
    const storefront = shop([service({ id: LASHES, name: "Classic lashes" })], {
      add_ons: [addOn],
    });
    list(storefront, LASHES);
    expect(screen.getByText(RX_5)).toBeInTheDocument();
    expect(screen.getByText(RX_6)).toBeInTheDocument();
  });

  it("opens the full policy from the details panel when the business has one", async () => {
    const user = userEvent.setup();
    const storefront = shop([service({ id: LASHES, name: "Classic lashes" })], {
      booking_policy: "Late arrivals lose their slot.",
    });
    list(storefront, LASHES);
    await user.click(screen.getByText("Full policy"));
    expect(screen.getByText("Late arrivals lose their slot.")).toBeVisible();
  });

  it("shows no full policy link when the business has none", () => {
    const storefront = shop([service({ id: LASHES, name: "Classic lashes" })]);
    list(storefront, LASHES);
    expect(screen.queryByText("Full policy")).toBeNull();
  });

  it("expands only the chosen service and collapses the one before", () => {
    const storefront = shop([
      service({
        id: LASHES,
        name: "Classic lashes",
        description: "Lashes description.",
      }),
      service({
        id: BROWS,
        name: "Brow shaping",
        description: "Brows description.",
      }),
    ]);
    const { rerender } = list(storefront, LASHES);
    expect(screen.getByText("Lashes description.")).toBeInTheDocument();
    expect(screen.queryByText("Brows description.")).toBeNull();

    rerender(
      <ServiceList
        bookAgainIds={[]}
        onPick={vi.fn()}
        selectedId={BROWS}
        services={storefront.services}
        storefront={storefront}
      />
    );
    expect(screen.queryByText("Lashes description.")).toBeNull();
    expect(screen.getByText("Brows description.")).toBeInTheDocument();
  });

  it("leaves out the amount while add-ons are ticked, since the total is only known on the next step", () => {
    const storefront = shop([service({ id: LASHES, name: "Classic lashes" })]);
    render(
      <ServiceList
        addOnsChosen
        bookAgainIds={[]}
        onPick={vi.fn()}
        selectedId={LASHES}
        services={storefront.services}
        storefront={storefront}
      />
    );
    expect(document.querySelector(".service-details")).not.toBeNull();
    expect(document.querySelector(".service-payment")).toBeNull();
  });

  it("names the chosen service's details for the radio, so screen readers hear them", () => {
    const storefront = shop([
      service({ id: LASHES, name: "Classic lashes", description: "Soft set." }),
    ]);
    list(storefront, LASHES);
    expect(
      screen.getByRole("radio", { name: RX_7 })
    ).toHaveAccessibleDescription(RX_1);
  });
});

describe("Read more", () => {
  it("clamps a long description behind a button that says whether it is open", async () => {
    const user = userEvent.setup();
    const storefront = shop([
      service({ id: LASHES, name: "Classic lashes", description: LONG }),
    ]);
    list(storefront, LASHES);
    const more = screen.getByRole("button", { name: "Read more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector('[data-clamped="true"]')).not.toBeNull();

    await user.click(more);
    const less = screen.getByRole("button", { name: "Show less" });
    expect(less).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector('[data-clamped="true"]')).toBeNull();
  });

  it("offers no toggle for a short description", () => {
    const storefront = shop([
      service({ id: LASHES, name: "Classic lashes", description: "Short." }),
    ]);
    list(storefront, LASHES);
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
  });
});
