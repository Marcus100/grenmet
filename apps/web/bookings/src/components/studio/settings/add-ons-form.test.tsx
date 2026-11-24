import type {
  BookingProfilePublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveProfileAction: vi.fn(),
  saveServiceAction: vi.fn(),
}));

import { AddOnsForm } from "./add-ons-form";
import { ServiceForm } from "./service-form";

const SWITCH = "Offer add-ons on my booking page";
const EXPLAIN = /Each add-on adds its time and price to the booking/u;
const IS_ADD_ON = "This is an add-on";
const CATEGORIES = "Offer it with these categories";
const NOT_SEEN = /Customers will not see it until you switch add-ons on/u;
const NO_CATEGORIES = /offered with every main service/u;

function profile(on: boolean | undefined): BookingProfilePublic {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "org-1",
    public_slug: "salon",
    display_name: "Salon",
    ...(on === undefined ? {} : { add_ons_enabled: on }),
  } as BookingProfilePublic;
}

const service: BookingServicePublic = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Lash tint",
  category: null,
  description: null,
  duration_min: 15,
  buffer_before_min: 0,
  buffer_after_min: 0,
  price_minor: 1000,
  deposit_minor: 0,
  active: true,
  sort_order: 0,
  is_add_on: true,
  add_on_categories: ["Lashes"],
};

describe("add-ons switch", () => {
  it("is off by default and says what it does", () => {
    render(<AddOnsForm orgSlug="salon" profile={profile(undefined)} />);
    expect(screen.getByRole("checkbox", { name: SWITCH })).not.toBeChecked();
    expect(screen.getByText(EXPLAIN)).toBeVisible();
  });

  it("shows the stored on state", () => {
    render(<AddOnsForm orgSlug="salon" profile={profile(true)} />);
    expect(screen.getByRole("checkbox", { name: SWITCH })).toBeChecked();
  });
});

describe("service form add-on fields", () => {
  it("hides the categories until the box is ticked, then lists main-service categories", () => {
    render(
      <ServiceForm
        addOnCategories={["Lashes", "Brows"]}
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
      />
    );
    expect(screen.queryByText(CATEGORIES)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: IS_ADD_ON }));
    expect(screen.getByText(CATEGORIES)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Lashes" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Brows" })).toBeVisible();
  });

  it("shows a stored add-on with its categories ticked", () => {
    render(
      <ServiceForm
        addOnCategories={["Lashes", "Brows"]}
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        service={service}
      />
    );
    expect(screen.getByRole("checkbox", { name: IS_ADD_ON })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Lashes" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Brows" })).not.toBeChecked();
  });

  it("says customers will not see add-ons while the business switch is off", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    expect(screen.getByText(NOT_SEEN)).toBeVisible();
  });

  it("says an add-on with no categories to follow goes with every main service", () => {
    render(
      <ServiceForm
        addOnCategories={[]}
        addOnsEnabled
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: IS_ADD_ON }));
    expect(screen.getByText(NO_CATEGORIES)).toBeVisible();
  });
});
