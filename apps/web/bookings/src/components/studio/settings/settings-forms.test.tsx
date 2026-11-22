import type {
  BookingProfilePublic,
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveHoursAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
  saveServiceAction: vi.fn(),
  startLogoUploadAction: vi.fn(),
  finishLogoUploadAction: vi.fn(),
}));

import { CONTACT_MESSAGES } from "@/lib/business-contact";
import { ContactOptions } from "./contact-options";
import { HoursForm } from "./hours-form";
import { ProfileForm } from "./profile-form";
import { ProviderForm } from "./provider-form";
import { ServiceForm } from "./service-form";

const S1 = "44444444-4444-4444-8444-444444444444";
const P1 = "33333333-3333-4333-8333-333333333333";
const NAME = /Business name/u;
const ADDRESS = /Booking address/u;
const CUTOFF = /Cancellation cutoff/u;
const OPEN = /Online booking is open/u;
const DEPOSIT_LABEL = /Deposit \(XCD\)/u;
const NO_PAYMENTS = /does not have online payments/u;
const MONDAY_OPENS = /Monday opens, period 1/u;
const MONDAY_ROW3 = /Monday opens, period 3/u;
const TUESDAY_ROW3 = /Tuesday opens, period 3/u;
const TUESDAY_ROW2 = /Tuesday opens, period 2/u;
const CLOCK = /America\/Grenada/u;
const MASSAGE = /Massage/u;
const ADD_FIRST = /Add a service first/u;
const CONTACT_GROUP = /Contact options for customers/u;
const PHONE = /^Phone/u;
const WHATSAPP = /^WhatsApp/u;
const INSTAGRAM = /^Instagram/u;
const EMAIL = /^Email \(optional\)/u;
const COUNTRY_CODE = /with its country code/u;

const service: BookingServicePublic = {
  id: S1,
  name: "Massage",
  category: null,
  description: null,
  duration_min: 60,
  buffer_before_min: 0,
  buffer_after_min: 0,
  price_minor: 15_000,
  deposit_minor: 2550,
  active: true,
  sort_order: 0,
};

const provider: BookingProviderPublic = {
  id: P1,
  name: "Maya",
  user_id: null,
  active: true,
  sort_order: 0,
  service_ids: [S1],
};

const DEPOSIT_CHOICE = /Deposit set on each service/u;
const FULL_CHOICE = /Full price, paid online by card/u;
const NOT_SWITCHED_ON = /not switched on yet/u;
const TEST_MODE = /test mode: no real money moves/u;

describe("profile form", () => {
  it("starts from the organisation name when there is no profile", () => {
    render(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    expect(screen.getByLabelText(NAME)).toHaveValue("Sea Salt");
    expect(screen.getByLabelText(OPEN)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("shows saved values and the cancellation cutoff", () => {
    const profile = {
      id: "x",
      organisation_id: ORG,
      created_at: "",
      updated_at: "",
      public_slug: "sea-salt",
      display_name: "Sea Salt Spa",
      enabled: true,
      timezone: "America/Barbados",
      currency: "XCD",
      cancel_cutoff_hours: 48,
    } as BookingProfilePublic;
    render(
      <ProfileForm orgSlug="sea-salt" profile={profile} suggestedName="x" />
    );
    expect(screen.getByLabelText(ADDRESS)).toHaveValue("sea-salt");
    expect(screen.getByLabelText(CUTOFF)).toHaveValue("48");
    expect(screen.getByLabelText(OPEN)).toBeChecked();
  });

  it("defaults the payment choice to the service deposit and explains the card rail", () => {
    render(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    const group = screen.getByRole("group", { name: "Payment when booking" });
    expect(
      within(group).getByRole("radio", { name: DEPOSIT_CHOICE })
    ).toBeChecked();
    expect(group).toHaveAccessibleDescription(NOT_SWITCHED_ON);
  });

  it("shows a saved full-price choice and the test-mode note", () => {
    const profile = {
      id: "x",
      organisation_id: ORG,
      created_at: "",
      updated_at: "",
      public_slug: "sea-salt",
      display_name: "Sea Salt Spa",
      payment_at_booking: "full_price",
    } as BookingProfilePublic;
    render(
      <ProfileForm
        cardPaymentsAvailable
        orgSlug="sea-salt"
        profile={profile}
        suggestedName="x"
      />
    );
    expect(screen.getByRole("radio", { name: FULL_CHOICE })).toBeChecked();
    expect(
      screen.getByRole("group", { name: "Payment when booking" })
    ).toHaveAccessibleDescription(TEST_MODE);
  });

  it("has four empty, optional contact options for a new profile", () => {
    render(
      <ProfileForm orgSlug="sea-salt" profile={null} suggestedName="Sea Salt" />
    );
    const group = screen.getByRole("group", { name: CONTACT_GROUP });
    for (const label of [PHONE, WHATSAPP, INSTAGRAM, EMAIL]) {
      const input = within(group).getByLabelText(label);
      expect(input).toHaveValue("");
      expect(input).not.toBeRequired();
      expect(input).toHaveAccessibleDescription();
    }
  });

  it("shows saved contact options the way people type them", () => {
    const profile = {
      id: "x",
      organisation_id: ORG,
      created_at: "",
      updated_at: "",
      public_slug: "sea-salt",
      display_name: "Sea Salt Spa",
      contact_phone: "+14734401234",
      contact_whatsapp: "14734405678",
      contact_instagram: "seasaltspa",
      contact_email: "hello@seasalt.example",
    } as BookingProfilePublic;
    render(
      <ProfileForm orgSlug="sea-salt" profile={profile} suggestedName="x" />
    );
    expect(screen.getByLabelText(PHONE)).toHaveValue("+14734401234");
    expect(screen.getByLabelText(WHATSAPP)).toHaveValue("+14734405678");
    expect(screen.getByLabelText(INSTAGRAM)).toHaveValue("@seasaltspa");
    expect(screen.getByLabelText(EMAIL)).toHaveValue("hello@seasalt.example");
  });

  it("marks a wrong contact option and names the problem", () => {
    render(
      <ContactOptions
        errors={{ contactPhone: CONTACT_MESSAGES.contactPhone }}
        profile={null}
      />
    );
    const phone = screen.getByLabelText(PHONE);
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(COUNTRY_CODE);
    expect(screen.getByLabelText(EMAIL)).not.toHaveAttribute("aria-invalid");
  });
});

const ORG = "11111111-1111-4111-8111-111111111111";

describe("service form", () => {
  it("shows money in whole units and the deposit rule", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="sea-salt"
        service={service}
      />
    );
    expect(screen.getByLabelText(DEPOSIT_LABEL)).toHaveValue("25.50");
    expect(screen.getByLabelText("Price (XCD)")).toHaveValue("150");
    expect(screen.getByRole("button", { name: "Save service" })).toBeEnabled();
  });

  it("says plainly when deposits are not collected online", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable={false}
        orgSlug="sea-salt"
      />
    );
    expect(screen.getByText(NO_PAYMENTS)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add service" })).toBeEnabled();
  });
});

describe("provider form", () => {
  it("ticks the services they perform", () => {
    render(
      <ProviderForm
        orgSlug="sea-salt"
        provider={provider}
        services={[service]}
      />
    );
    expect(screen.getByRole("checkbox", { name: MASSAGE })).toBeChecked();
  });

  it("keeps the empty state visible when there are no services", () => {
    render(<ProviderForm orgSlug="sea-salt" services={[]} />);
    expect(screen.getByText(ADD_FIRST)).toBeInTheDocument();
  });
});

describe("hours form", () => {
  it("fills saved periods, adds a spare row and names the clock", () => {
    render(
      <HoursForm
        hours={[
          { weekday: 0, start_time: "09:00:00", end_time: "12:00:00" },
          { weekday: 0, start_time: "13:00:00", end_time: "17:00:00" },
        ]}
        orgSlug="sea-salt"
        providerId={P1}
        zone="America/Grenada"
      />
    );
    expect(screen.getByLabelText(MONDAY_OPENS)).toHaveValue("09:00");
    expect(screen.getByLabelText(MONDAY_ROW3)).toHaveValue("");
    // A day off still shows two empty rows.
    expect(screen.getByLabelText(TUESDAY_ROW2)).toBeInTheDocument();
    expect(screen.queryByLabelText(TUESDAY_ROW3)).not.toBeInTheDocument();
    expect(screen.getByText(CLOCK)).toBeInTheDocument();
  });
});
