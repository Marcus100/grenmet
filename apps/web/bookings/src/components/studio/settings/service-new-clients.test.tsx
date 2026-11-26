import type { BookingServicePublic } from "@barrelsgd/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  saveServiceAction: vi.fn(),
}));
vi.mock("@/app/studio/[orgSlug]/settings/actions", () => actions);

import { ServiceForm } from "./service-form";
import { ServicesSection } from "./settings-sections";

const NEW_CLIENTS = "New clients only";
const LEAD_DAYS = "Book at least this many days before";
const FIRST_VISIT = /Their first appointment is in/u;
const ADD_ON = "This is an add-on";
const ALSO_ADD_ON = "Also offer as an add-on";
const SWITCH_BLOCKED =
  /Turn off “This is an add-on” and “Also offer as an add-on” to make this/u;
const ADD_ON_BLOCKED =
  /Turn off “New clients only” to offer this as an add-on/u;

const idle = { status: "idle" } as const;
const CATEGORY_FIRST = /Give your services a category first/u;

function service(overrides: Partial<BookingServicePublic> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    name: "New client consultation",
    category: "Lashes",
    description: null,
    duration_min: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    price_minor: 5000,
    deposit_minor: 0,
    active: true,
    sort_order: 0,
    is_add_on: false,
    also_add_on: false,
    add_on_categories: null,
    new_clients_only: true,
    first_visit_lead_days: 2,
    first_visit_categories: ["Lashes"],
    ...overrides,
  } as BookingServicePublic;
}

function checkbox(name: string) {
  return screen.getByRole("checkbox", { name });
}

describe("new clients only: switch and fields", () => {
  it("hides the lead time and the categories while the switch is off", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        serviceCategories={["Lashes", "Brows"]}
      />
    );
    expect(checkbox(NEW_CLIENTS)).not.toBeChecked();
    expect(screen.queryByLabelText(LEAD_DAYS)).toBeNull();
    expect(screen.queryByText(FIRST_VISIT)).toBeNull();
  });

  it("reveals the lead time and the business's categories when the switch is on", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        serviceCategories={["Lashes", "Brows"]}
      />
    );
    fireEvent.click(checkbox(NEW_CLIENTS));
    expect(screen.getByLabelText(LEAD_DAYS)).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(LEAD_DAYS)).toHaveAttribute("max", "60");
    expect(screen.getByText(FIRST_VISIT)).toBeVisible();
    expect(checkbox("Lashes")).not.toBeChecked();
    expect(checkbox("Brows")).not.toBeChecked();
  });

  it("shows a stored lead time and its categories ticked", () => {
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        service={service()}
        serviceCategories={["Lashes", "Brows"]}
      />
    );
    expect(checkbox(NEW_CLIENTS)).toBeChecked();
    expect(screen.getByLabelText(LEAD_DAYS)).toHaveValue(2);
    expect(checkbox("Lashes")).toBeChecked();
    expect(checkbox("Brows")).not.toBeChecked();
  });

  it("says plainly when the business has no categories to choose from", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    fireEvent.click(checkbox(NEW_CLIENTS));
    expect(screen.getByText(CATEGORY_FIRST)).toBeVisible();
  });
});

describe("new clients only: add-on exclusion", () => {
  it("disables the add-on controls while the switch is on, and says why", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    fireEvent.click(checkbox(NEW_CLIENTS));
    expect(checkbox(ADD_ON)).toBeDisabled();
    expect(checkbox(ALSO_ADD_ON)).toBeDisabled();
    expect(screen.getByText(ADD_ON_BLOCKED)).toBeVisible();
  });

  it("disables the switch while an add-on is on, and says why", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    fireEvent.click(checkbox(ALSO_ADD_ON));
    expect(checkbox(NEW_CLIENTS)).toBeDisabled();
    expect(screen.getByText(SWITCH_BLOCKED)).toBeVisible();
  });

  it("unticking the switch gives the add-on controls back", () => {
    render(<ServiceForm currency="XCD" depositsAvailable orgSlug="salon" />);
    fireEvent.click(checkbox(NEW_CLIENTS));
    expect(checkbox(ADD_ON)).toBeDisabled();
    fireEvent.click(checkbox(NEW_CLIENTS));
    expect(checkbox(ADD_ON)).toBeEnabled();
    expect(checkbox(ALSO_ADD_ON)).toBeEnabled();
  });
});

describe("new clients only: the save payload", () => {
  it("sends the switch, lead time and categories when it is on", async () => {
    actions.saveServiceAction.mockResolvedValue(idle);
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        serviceCategories={["Lashes", "Brows"]}
      />
    );
    fireEvent.change(screen.getByLabelText("Service name"), {
      target: { value: "Consultation" },
    });
    fireEvent.click(checkbox(NEW_CLIENTS));
    fireEvent.change(screen.getByLabelText(LEAD_DAYS), {
      target: { value: "2" },
    });
    fireEvent.click(checkbox("Brows"));
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(actions.saveServiceAction).toHaveBeenCalled());
    const data = actions.saveServiceAction.mock.calls.at(-1)?.[2] as FormData;
    expect(data.get("newClientsOnly")).toBe("on");
    expect(data.get("firstVisitLeadDays")).toBe("2");
    expect(data.getAll("firstVisitCategory")).toEqual(["Brows"]);
    expect(data.get("isAddOn")).toBeNull();
    expect(data.get("alsoAddOn")).toBeNull();
  });

  it("sends no new-client fields when the switch is off", async () => {
    actions.saveServiceAction.mockResolvedValue(idle);
    render(
      <ServiceForm
        currency="XCD"
        depositsAvailable
        orgSlug="salon"
        serviceCategories={["Lashes"]}
      />
    );
    fireEvent.change(screen.getByLabelText("Service name"), {
      target: { value: "Massage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(actions.saveServiceAction).toHaveBeenCalled());
    const data = actions.saveServiceAction.mock.calls.at(-1)?.[2] as FormData;
    expect(data.get("newClientsOnly")).toBeNull();
    expect(data.get("firstVisitLeadDays")).toBeNull();
    expect(data.getAll("firstVisitCategory")).toEqual([]);
  });
});

describe("services list", () => {
  it("tags a new-clients-only service with a text label", () => {
    render(
      <ServicesSection
        currency="XCD"
        depositsAvailable
        editable={false}
        orgSlug="salon"
        services={[
          service(),
          service({
            id: "55555555-5555-4555-8555-555555555555",
            name: "Haircut",
            new_clients_only: false,
            first_visit_lead_days: null,
            first_visit_categories: null,
          }),
        ]}
      />
    );
    expect(screen.getByText("New clients")).toBeVisible();
    expect(screen.getAllByText("New clients")).toHaveLength(1);
  });
});
