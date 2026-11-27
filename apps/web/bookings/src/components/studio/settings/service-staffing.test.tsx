import type {
  BookingProfilePublic,
  BookingProviderPublic,
  BookingServicePublic,
} from "@barrelsgd/api-client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/studio/[orgSlug]/settings/actions", () => ({
  saveServiceAction: vi.fn(),
  saveProfileAction: vi.fn(),
  saveProviderAction: vi.fn(),
}));

import { ServiceForm } from "./service-form";
import { ServicesSection } from "./settings-sections";

const NOTICE = "nobody-does-notice";
const BADGE = "No one does this";
const TEXT = /Nobody is set to do this, so customers see no times for it/u;
const FIX = /untick "Offered to customers"/u;
const NO_PEOPLE_AT_ALL = /so customers can see times/u;

const SERVICE_ID = "44444444-4444-4444-8444-444444444444";

function service(overrides: Partial<BookingServicePublic> = {}) {
  return {
    id: SERVICE_ID,
    name: "Lash lift",
    category: null,
    description: null,
    duration_min: 60,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 15_000,
    deposit_minor: 0,
    active: true,
    sort_order: 0,
    is_add_on: false,
    also_add_on: false,
    add_on_categories: null,
    new_clients_only: false,
    first_visit_lead_days: null,
    first_visit_categories: null,
    ...overrides,
  } as BookingServicePublic;
}

function person(overrides: Partial<BookingProviderPublic> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Maya",
    user_id: null,
    active: true,
    sort_order: 0,
    service_ids: [],
    working_hours: [],
    ...overrides,
  } as BookingProviderPublic;
}

const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  organisation_id: "org-1",
  public_slug: "salon",
  display_name: "Salon",
} as BookingProfilePublic;

function renderSection(options: {
  editable?: boolean;
  providers?: BookingProviderPublic[];
  services?: BookingServicePublic[];
}) {
  render(
    <ServicesSection
      currency="XCD"
      depositsAvailable
      editable={options.editable ?? true}
      orgSlug="salon"
      profile={profile}
      providers={options.providers ?? [person()]}
      services={options.services ?? [service()]}
    />
  );
}

describe("a service offered to customers that nobody does", () => {
  it("flags the row and says what to do, in the service's own form", () => {
    renderSection({});
    expect(screen.getByText(BADGE)).toBeVisible();
    const notice = screen.getByTestId(NOTICE);
    expect(notice).toHaveTextContent(TEXT);
    expect(notice).toHaveTextContent(FIX);
    expect(screen.getByRole("link", { name: "People" })).toHaveAttribute(
      "href",
      "/studio/salon/people"
    );
  });

  it("says it only once: the form carries it, not the list as well", () => {
    renderSection({});
    expect(screen.getAllByTestId(NOTICE)).toHaveLength(1);
  });

  it("still says it to a viewer who cannot edit, with no form to carry it", () => {
    renderSection({ editable: false });
    // Inside the row's collapsed <details>, so it is in the document rather
    // than visible until the business opens the row.
    expect(screen.getByTestId(NOTICE)).toHaveTextContent(TEXT);
    expect(screen.queryByLabelText("Service name")).toBeNull();
  });

  it("says nothing once an active person is set to do it", () => {
    renderSection({ providers: [person({ service_ids: [SERVICE_ID] })] });
    expect(screen.queryByText(BADGE)).toBeNull();
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("says nothing about a service that is not offered to customers", () => {
    renderSection({ services: [service({ active: false })] });
    expect(screen.queryByText(BADGE)).toBeNull();
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("leaves an add-on alone: it follows the main service's person", () => {
    renderSection({ services: [service({ is_add_on: true })] });
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it("does not repeat the one notice for a business with no active person", () => {
    // PR #1954's case: one notice for the whole business, no per-service badge.
    renderSection({ providers: [person({ active: false })] });
    expect(screen.queryByText(BADGE)).toBeNull();
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(screen.getByText(NO_PEOPLE_AT_ALL)).toBeVisible();
  });
});

describe("the service form on its own", () => {
  it("warns only when it is told nobody does the service", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        nobodyDoes
        orgSlug="salon"
        service={service()}
      />
    );
    expect(screen.getByTestId(NOTICE)).toHaveTextContent(FIX);
  });

  it("stays quiet by default, so a new service form is not pre-warned", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});
